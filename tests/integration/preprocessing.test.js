jest.mock('child_process', () => ({
    execFile: jest.fn((cmd, args, cb) => cb && cb(null, 'ok', '')),
}));

jest.mock('../../utils/config', () => ({
    default_python_path: '/usr/bin/python3',
}));

jest.mock('../../queries/queries', () => ({
    project: {
        getPipeline: jest.fn().mockResolvedValue({ success: true, rows: [] }),
        replacePipeline: jest.fn().mockResolvedValue({ success: true }),
        getCustomScripts: jest.fn().mockResolvedValue({ success: true, rows: [] }),
        getCustomScriptById: jest.fn(),
        addCustomScript: jest.fn().mockResolvedValue({ success: true }),
        deleteCustomScript: jest.fn().mockResolvedValue({ success: true }),
        setCustomScriptPythonPath: jest.fn().mockResolvedValue({ success: true }),
    },
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const { execFile } = require('child_process');
const queries = require('../../queries/queries');
const {
    getPreprocessingPipeline,
    savePreprocessingPipeline,
    uploadCustomScript,
    deleteCustomScript,
    setCustomScriptPythonPath,
    applyPreprocessingPipeline,
    getPreprocessingJobStatus,
    downloadExampleScript,
    listPreprocessingBatches,
    renamePreprocessingBatch,
    listPreprocessingBatchImages,
    getPreprocessingBatchImage,
} = require('../../routes/api/v2/preprocessing');
const { sanitizeCode } = require('../../utils/sandboxedPythonRunner');

// Handlers are exercised against a minimal app (mirroring
// tests/integration/s3Buckets.test.js) rather than the full app.js -> routes/api.js
// chain, since that chain pulls in ESM-only packages Jest cannot transform.
function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(fileUpload());

    app.get('/api/v2/projects/preprocessing/example-script', downloadExampleScript);
    app.get('/api/v2/projects/:admin/:projectName/preprocessing', getPreprocessingPipeline);
    app.put('/api/v2/projects/:admin/:projectName/preprocessing', savePreprocessingPipeline);
    app.post('/api/v2/projects/:admin/:projectName/preprocessing/scripts', uploadCustomScript);
    app.put('/api/v2/projects/:admin/:projectName/preprocessing/scripts/:scriptId/python-path', setCustomScriptPythonPath);
    app.delete('/api/v2/projects/:admin/:projectName/preprocessing/scripts/:scriptId', deleteCustomScript);
    app.post('/api/v2/projects/:admin/:projectName/preprocessing/apply', applyPreprocessingPipeline);
    app.get('/api/v2/projects/:admin/:projectName/preprocessing/jobs/:jobId', getPreprocessingJobStatus);
    app.get('/api/v2/projects/:admin/:projectName/preprocessing/batches', listPreprocessingBatches);
    app.put('/api/v2/projects/:admin/:projectName/preprocessing/batches/:jobId', renamePreprocessingBatch);
    app.get('/api/v2/projects/:admin/:projectName/preprocessing/batches/:jobId/images', listPreprocessingBatchImages);
    app.get('/api/v2/projects/:admin/:projectName/preprocessing/batches/:jobId/images/:name', getPreprocessingBatchImage);

    return app;
}

describe('Pre-processing Pipeline Routes', () => {
    let app;
    let tmpRoot;
    let projectPath;

    beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'njobvu-preprocessing-'));
        global.currentPath = tmpRoot + path.sep;
        global.logger = { error: jest.fn(), debug: jest.fn() };

        projectPath = path.join(tmpRoot, 'public', 'projects', 'testuser-test-project');
        fs.mkdirSync(projectPath, { recursive: true });

        app = buildTestApp();
    });

    afterAll(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v2/projects/preprocessing/example-script', () => {
        it('serves the example script as a python attachment', async () => {
            const res = await request(app).get('/api/v2/projects/preprocessing/example-script');

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/x-python/);
            expect(res.headers['content-disposition']).toBe('attachment; filename="example_custom_script.py"');
            expect(res.text).toMatch(/^def process\(img\):/m);
        });

        it('is commented to explain the implementation', async () => {
            const res = await request(app).get('/api/v2/projects/preprocessing/example-script');

            const commentLines = res.text.split('\n').filter((l) => l.trim().startsWith('#')).length;
            expect(commentLines).toBeGreaterThanOrEqual(5);
            expect(res.text).toMatch(/BGR/);
            expect(res.text).toMatch(/process\(img\)/);
        });

        it('passes the same static checks applied to uploaded scripts', async () => {
            const res = await request(app).get('/api/v2/projects/preprocessing/example-script');

            expect(() => sanitizeCode(res.text)).not.toThrow();
        });

        it('can be uploaded back unchanged as a custom script', async () => {
            const download = await request(app).get('/api/v2/projects/preprocessing/example-script');

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/scripts')
                .set('Cookie', ['Username=testuser'])
                .attach('script', Buffer.from(download.text), 'example_custom_script.py');

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(queries.project.addCustomScript).toHaveBeenCalled();
        });

        it('does not require ownership since the content is static', async () => {
            const res = await request(app)
                .get('/api/v2/projects/preprocessing/example-script')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(200);
        });
    });

    describe('PUT /api/v2/projects/:admin/:projectName/preprocessing/scripts/:scriptId/python-path', () => {
        const url = '/api/v2/projects/testuser/test-project/preprocessing/scripts/c1/python-path';
        let fakePython;

        beforeAll(() => {
            fakePython = path.join(tmpRoot, 'fake-python');
            fs.writeFileSync(fakePython, '#!/bin/sh\n', { mode: 0o755 });
        });

        beforeEach(() => {
            queries.project.getCustomScriptById.mockResolvedValue({
                success: true,
                row: { ScriptId: 'c1', Name: 'my_script.py', FileName: 'c1-my_script.py' },
            });
        });

        const put = (body, user = 'testuser') =>
            request(app).put(url).set('Cookie', [`Username=${user}`]).send(body);

        it('persists a valid interpreter path', async () => {
            const res = await put({ pythonPath: fakePython });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, pythonPath: fakePython });
            expect(queries.project.setCustomScriptPythonPath).toHaveBeenCalledWith(projectPath, 'c1', fakePython);
        });

        it('clears the setting when the path is empty', async () => {
            const res = await put({ pythonPath: '   ' });

            expect(res.statusCode).toBe(200);
            expect(res.body.pythonPath).toBeNull();
            expect(queries.project.setCustomScriptPythonPath).toHaveBeenCalledWith(projectPath, 'c1', null);
        });

        it.each([
            ['a non-string value', 123],
            ['a relative path', 'python3'],
            ['a path with a newline', '/usr/bin/python3\n/bin/sh'],
            ['a path that does not exist', '/definitely/not/here/python'],
            ['a directory', os.tmpdir()],
            ['an over-long path', '/' + 'a'.repeat(1100)],
        ])('rejects %s', async (_label, pythonPath) => {
            const res = await put({ pythonPath });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(queries.project.setCustomScriptPythonPath).not.toHaveBeenCalled();
        });

        it('rejects a file that is not executable', async () => {
            const plain = path.join(tmpRoot, 'not-executable');
            fs.writeFileSync(plain, 'x', { mode: 0o644 });

            const res = await put({ pythonPath: plain });

            expect(res.statusCode).toBe(400);
            expect(queries.project.setCustomScriptPythonPath).not.toHaveBeenCalled();
        });

        it('returns 404 for an unknown script', async () => {
            queries.project.getCustomScriptById.mockResolvedValueOnce({ success: true, row: undefined });

            const res = await put({ pythonPath: fakePython });

            expect(res.statusCode).toBe(404);
            expect(queries.project.setCustomScriptPythonPath).not.toHaveBeenCalled();
        });

        it('rejects requests from a non-owner', async () => {
            const res = await put({ pythonPath: fakePython }, 'someone-else');

            expect(res.statusCode).toBe(403);
            expect(queries.project.setCustomScriptPythonPath).not.toHaveBeenCalled();
        });

        it('exposes the saved path on GET and passes it into the apply manifest', async () => {
            const rows = [{ ScriptId: 'c1', Name: 'my_script.py', FileName: 'c1-my_script.py', UploadedAt: 't', PythonPath: fakePython }];
            queries.project.getCustomScripts.mockResolvedValue({ success: true, rows });
            queries.project.getPipeline.mockResolvedValue({
                success: true,
                rows: [{ StepId: 's1', StepType: 'custom', ScriptId: 'c1', Enabled: 1, StepOrder: 0, Params: '{}' }],
            });

            const getRes = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser']);
            expect(getRes.body.customScripts[0].pythonPath).toBe(fakePython);

            const applyRes = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);
            expect(applyRes.statusCode).toBe(200);

            const args = execFile.mock.calls[0][1];
            const manifestPath = args[args.indexOf('--manifest') + 1];
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            expect(manifest.steps[0].pythonPath).toBe(fakePython);

            queries.project.getCustomScripts.mockResolvedValue({ success: true, rows: [] });
            queries.project.getPipeline.mockResolvedValue({ success: true, rows: [] });
        });

        it('refuses to apply when a saved interpreter no longer exists', async () => {
            queries.project.getCustomScripts.mockResolvedValueOnce({
                success: true,
                rows: [{ ScriptId: 'c1', Name: 'my_script.py', FileName: 'f.py', PythonPath: '/gone/python' }],
            });
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepId: 's1', StepType: 'custom', ScriptId: 'c1', Enabled: 1, StepOrder: 0, Params: '{}' }],
            });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toMatch(/my_script\.py/);
            expect(execFile).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/v2/projects/:admin/:projectName/preprocessing', () => {
        it('returns the saved pipeline and custom scripts for the project owner', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [
                    { StepId: 's1', StepType: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{"width":640}' },
                ],
            });
            queries.project.getCustomScripts.mockResolvedValueOnce({
                success: true,
                rows: [{ ScriptId: 'c1', Name: 'my_script.py', FileName: 'c1-my_script.py', UploadedAt: '2026-01-01T00:00:00.000Z' }],
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.pipeline).toEqual([
                { id: 's1', type: 'resize', enabled: true, order: 0, params: { width: 640 } },
            ]);
            expect(res.body.customScripts).toEqual([
                { id: 'c1', name: 'my_script.py', filename: 'c1-my_script.py', uploadedAt: '2026-01-01T00:00:00.000Z', pythonPath: null },
            ]);
        });

        it('rejects requests from a user who does not own the project', async () => {
            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(403);
            expect(queries.project.getPipeline).not.toHaveBeenCalled();
        });

        it('returns 404 when the project does not exist on disk', async () => {
            const res = await request(app)
                .get('/api/v2/projects/testuser/no-such-project/preprocessing')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('PUT /api/v2/projects/:admin/:projectName/preprocessing', () => {
        it('saves a valid pipeline of built-in steps', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({
                    pipeline: [
                        { type: 'resize', enabled: true, params: { width: 640, height: 480 } },
                        { type: 'rotate', enabled: false, params: { angle: 90 } },
                    ],
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(queries.project.replacePipeline).toHaveBeenCalledWith(
                expect.stringContaining('testuser-test-project'),
                [
                    expect.objectContaining({ type: 'resize', enabled: true, order: 0, scriptId: null }),
                    expect.objectContaining({ type: 'rotate', enabled: false, order: 1, scriptId: null }),
                ],
            );
        });

        it('accepts a custom step that references an uploaded script', async () => {
            queries.project.getCustomScripts.mockResolvedValueOnce({
                success: true,
                rows: [{ ScriptId: 'c1', Name: 'my_script.py', FileName: 'c1-my_script.py' }],
            });

            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: [{ type: 'custom', scriptId: 'c1', enabled: true, params: {} }] });

            expect(res.statusCode).toBe(200);
            expect(queries.project.replacePipeline).toHaveBeenCalledWith(
                expect.any(String),
                [expect.objectContaining({ type: 'custom', scriptId: 'c1' })],
            );
        });

        it('rejects a custom step whose scriptId does not exist for the project', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: [{ type: 'custom', scriptId: 'does-not-exist', enabled: true, params: {} }] });

            expect(res.statusCode).toBe(400);
            expect(queries.project.replacePipeline).not.toHaveBeenCalled();
        });

        it('rejects an unknown step type', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: [{ type: 'not-a-real-step', enabled: true, params: {} }] });

            expect(res.statusCode).toBe(400);
            expect(queries.project.replacePipeline).not.toHaveBeenCalled();
        });

        it('rejects requests from a non-owner', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=someone-else'])
                .send({ pipeline: [] });

            expect(res.statusCode).toBe(403);
            expect(queries.project.replacePipeline).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v2/projects/:admin/:projectName/preprocessing/scripts', () => {
        it('uploads a .py script and records it for the project', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/scripts')
                .set('Cookie', ['Username=testuser'])
                .attach('script', Buffer.from('print("hello")'), 'my_script.py');

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.script.name).toBe('my_script.py');
            expect(queries.project.addCustomScript).toHaveBeenCalled();

            const savedPath = path.join(projectPath, 'preprocessing', 'scripts', res.body.script.fileName);
            expect(fs.existsSync(savedPath)).toBe(true);
        });

        it('rejects a non-.py file', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/scripts')
                .set('Cookie', ['Username=testuser'])
                .attach('script', Buffer.from('not a script'), 'notes.txt');

            expect(res.statusCode).toBe(400);
            expect(queries.project.addCustomScript).not.toHaveBeenCalled();
        });

        it('rejects a script that fails the sandboxed-runner static safety check, without writing it to disk', async () => {
            const scriptsDir = path.join(projectPath, 'preprocessing', 'scripts');
            const before = fs.existsSync(scriptsDir) ? fs.readdirSync(scriptsDir) : [];

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/scripts')
                .set('Cookie', ['Username=testuser'])
                .attach('script', Buffer.from('import os\nos.system("rm -rf /")\n'), 'malicious.py');

            expect(res.statusCode).toBe(400);
            expect(queries.project.addCustomScript).not.toHaveBeenCalled();
            const after = fs.existsSync(scriptsDir) ? fs.readdirSync(scriptsDir) : [];
            expect(after).toEqual(before);
        });

        it('rejects a request with no file attached', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/scripts')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(400);
        });
    });

    describe('DELETE /api/v2/projects/:admin/:projectName/preprocessing/scripts/:scriptId', () => {
        it('deletes a custom script owned by the project', async () => {
            queries.project.getCustomScriptById.mockResolvedValueOnce({
                success: true,
                row: { ScriptId: 'c1', Name: 'my_script.py', FileName: 'c1-my_script.py' },
            });

            const res = await request(app)
                .delete('/api/v2/projects/testuser/test-project/preprocessing/scripts/c1')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(queries.project.deleteCustomScript).toHaveBeenCalledWith(expect.any(String), 'c1');
        });

        it('returns 404 for an unknown scriptId', async () => {
            queries.project.getCustomScriptById.mockResolvedValueOnce({ success: true, row: undefined });

            const res = await request(app)
                .delete('/api/v2/projects/testuser/test-project/preprocessing/scripts/nope')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('POST /api/v2/projects/:admin/:projectName/preprocessing/apply', () => {
        it('starts a job when the pipeline has at least one enabled step', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepId: 's1', StepType: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{"width":640}' }],
            });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.jobId).toBeDefined();
            expect(execFile).toHaveBeenCalledWith(
                '/usr/bin/python3',
                expect.arrayContaining(['--images', '--manifest', '--output']),
                expect.any(Function),
            );
        });

        it('passes a status file to the wrapper and records the job as running before it exits', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepId: 's1', StepType: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{}' }],
            });
            // Hold the process open so the pre-exit state is observable.
            execFile.mockImplementationOnce(() => {});

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);
            expect(res.statusCode).toBe(200);

            const args = execFile.mock.calls[0][1];
            expect(args[args.indexOf('--status') + 1]).toMatch(/-status\.json$/);

            const status = await request(app)
                .get(`/api/v2/projects/testuser/test-project/preprocessing/jobs/${res.body.jobId}`)
                .set('Cookie', ['Username=testuser']);
            expect(status.statusCode).toBe(200);
            expect(status.body).toMatchObject({ success: true, state: 'running', processed: 0 });
        });

        it('marks the job failed with the stderr tail when the process exits with an error', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepId: 's1', StepType: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{}' }],
            });
            execFile.mockImplementationOnce((cmd, args, cb) =>
                cb(new Error('exit 1'), '', "ModuleNotFoundError: No module named 'cv2'"),
            );

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            const status = await request(app)
                .get(`/api/v2/projects/testuser/test-project/preprocessing/jobs/${res.body.jobId}`)
                .set('Cookie', ['Username=testuser']);
            expect(status.body.state).toBe('failed');
            expect(status.body.error).toMatch(/No module named 'cv2'/);
        });

        it('rejects when the pipeline has no enabled steps', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepId: 's1', StepType: 'resize', ScriptId: null, Enabled: 0, StepOrder: 0, Params: '{}' }],
            });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(400);
            expect(execFile).not.toHaveBeenCalled();
        });

        it('rejects requests from a non-owner', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(403);
            expect(execFile).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/v2/projects/:admin/:projectName/preprocessing/jobs/:jobId', () => {
        const url = (id) => `/api/v2/projects/testuser/test-project/preprocessing/jobs/${id}`;

        it('404s for an unknown job', async () => {
            const res = await request(app).get(url('123')).set('Cookie', ['Username=testuser']);
            expect(res.statusCode).toBe(404);
        });

        it('400s for a job id that is not numeric (no path traversal)', async () => {
            const res = await request(app).get(url('..%2F..%2Fx')).set('Cookie', ['Username=testuser']);
            expect([400, 404]).toContain(res.statusCode);
            const bad = await request(app).get(url('abc')).set('Cookie', ['Username=testuser']);
            expect(bad.statusCode).toBe(400);
        });

        it('rejects requests from a non-owner', async () => {
            const res = await request(app).get(url('123')).set('Cookie', ['Username=someone-else']);
            expect(res.statusCode).toBe(403);
        });
    });
    describe('processed batches', () => {
        const base = '/api/v2/projects/testuser/test-project/preprocessing/batches';
        const cookie = ['Username=testuser'];
        const PNG = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
        );

        beforeAll(() => {
            const pre = path.join(projectPath, 'preprocessing');
            fs.mkdirSync(path.join(pre, 'jobs'), { recursive: true });
            fs.mkdirSync(path.join(pre, 'output', '900'), { recursive: true });
            fs.mkdirSync(path.join(projectPath, 'images'), { recursive: true });
            fs.writeFileSync(path.join(pre, 'jobs', '900-status.json'), JSON.stringify({ state: 'completed', processed: 1, finishedAt: '2026-01-01T00:00:00Z' }));
            fs.writeFileSync(path.join(pre, 'jobs', '900-manifest.json'), JSON.stringify({ steps: [{ type: 'crop' }] }));
            fs.writeFileSync(path.join(pre, 'jobs', '901-status.json'), JSON.stringify({ state: 'failed' }));
            fs.writeFileSync(path.join(pre, 'output', '900', 'a.png'), PNG);
            fs.writeFileSync(path.join(pre, 'output', '900', 'transforms.json'), '{}');
            fs.writeFileSync(path.join(projectPath, 'images', 'a.png'), PNG);
        });

        it('lists only completed batches that still have output', async () => {
            const res = await request(app).get(base).set('Cookie', cookie);
            expect(res.statusCode).toBe(200);
            expect(res.body.batches).toHaveLength(1);
            expect(res.body.batches[0]).toMatchObject({ jobId: '900', processed: 1, steps: ['crop'], hasTransforms: true });
        });

        it('lists image names for a batch and for the originals', async () => {
            const batch = await request(app).get(`${base}/900/images`).set('Cookie', cookie);
            expect(batch.body.images).toEqual(['a.png']);
            const original = await request(app).get(`${base}/original/images`).set('Cookie', cookie);
            expect(original.body.images).toEqual(['a.png']);
        });

        it('serves a batch image and the matching original', async () => {
            const batch = await request(app).get(`${base}/900/images/a.png`).set('Cookie', cookie);
            expect(batch.statusCode).toBe(200);
            expect(batch.headers['content-type']).toMatch(/image\/png/);
            const original = await request(app).get(`${base}/original/images/a.png`).set('Cookie', cookie);
            expect(original.statusCode).toBe(200);
        });

        it('refuses non-image files and path traversal', async () => {
            const json = await request(app).get(`${base}/900/images/transforms.json`).set('Cookie', cookie);
            expect(json.statusCode).toBe(400);
            const traversal = await request(app).get(`${base}/900/images/..%2F..%2Fjobs%2F900-status.json`).set('Cookie', cookie);
            expect([400, 404]).toContain(traversal.statusCode);
            const badId = await request(app).get(`${base}/abc/images/a.png`).set('Cookie', cookie);
            expect(badId.statusCode).toBe(400);
        });

        it('404s for a batch that does not exist and rejects non-owners', async () => {
            const missing = await request(app).get(`${base}/12345/images`).set('Cookie', cookie);
            expect(missing.statusCode).toBe(404);
            const other = await request(app).get(base).set('Cookie', ['Username=someone-else']);
            expect(other.statusCode).toBe(403);
        });
    });
    describe('batch names and image counts', () => {
        const base = '/api/v2/projects/testuser/test-project/preprocessing';
        const cookie = ['Username=testuser'];

        it('counts only real images in the progress total (not label .txt or "._" files)', async () => {
            const imagesDir = path.join(projectPath, 'images');
            fs.mkdirSync(imagesDir, { recursive: true });
            for (const name of ['p1.jpg', 'p2.PNG', 'p1.txt', '._p1.jpg', 'notes.md']) {
                fs.writeFileSync(path.join(imagesDir, name), 'x');
            }
            fs.mkdirSync(path.join(imagesDir, '__MACOSX'), { recursive: true });
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepType: 'crop', StepOrder: 0, Enabled: 1, Params: '{}' }],
            });

            const res = await request(app).post(`${base}/apply`).set('Cookie', cookie).send({});
            expect(res.statusCode).toBe(200);
            const status = JSON.parse(
                fs.readFileSync(path.join(projectPath, 'preprocessing', 'jobs', `${res.body.jobId}-status.json`), 'utf8'),
            );
            // a.png (from the batch tests, if they ran first) may also be present; the label/._ files must not be.
            const expected = fs.readdirSync(imagesDir).filter((n) => /^[^.].*\.(jpe?g|png)$/i.test(n)).length;
            expect(status.total).toBe(expected);
            expect(status.total).toBeGreaterThanOrEqual(2);
        });

        it('stores a name given at apply time and lists it with the batch', async () => {
            queries.project.getPipeline.mockResolvedValueOnce({
                success: true,
                rows: [{ StepType: 'crop', StepOrder: 0, Enabled: 1, Params: '{}' }],
            });
            const res = await request(app).post(`${base}/apply`).set('Cookie', cookie).send({ name: '  Greyscale run \n ' });
            expect(res.statusCode).toBe(200);

            // The mocked execFile "finishes" immediately, but only a completed job with output is listed.
            const pre = path.join(projectPath, 'preprocessing');
            fs.mkdirSync(path.join(pre, 'output', res.body.jobId), { recursive: true });
            fs.writeFileSync(
                path.join(pre, 'jobs', `${res.body.jobId}-status.json`),
                JSON.stringify({ state: 'completed', processed: 1 }),
            );
            const list = await request(app).get(`${base}/batches`).set('Cookie', cookie);
            const batch = list.body.batches.find((b) => b.jobId === res.body.jobId);
            expect(batch.name).toBe('Greyscale run');
        });

        it('renames a batch, clears the name, and validates input', async () => {
            const ok = await request(app).put(`${base}/batches/900`).set('Cookie', cookie).send({ name: 'Cropped' });
            expect(ok.statusCode).toBe(200);
            expect(ok.body.name).toBe('Cropped');
            let list = await request(app).get(`${base}/batches`).set('Cookie', cookie);
            expect(list.body.batches.find((b) => b.jobId === '900').name).toBe('Cropped');

            await request(app).put(`${base}/batches/900`).set('Cookie', cookie).send({ name: '' });
            list = await request(app).get(`${base}/batches`).set('Cookie', cookie);
            expect(list.body.batches.find((b) => b.jobId === '900').name).toBe('');

            const tooLong = await request(app).put(`${base}/batches/900`).set('Cookie', cookie).send({ name: 'x'.repeat(101) });
            expect(tooLong.statusCode).toBe(400);
            const notString = await request(app).put(`${base}/batches/900`).set('Cookie', cookie).send({ name: 5 });
            expect(notString.statusCode).toBe(400);
            const missing = await request(app).put(`${base}/batches/424242`).set('Cookie', cookie).send({ name: 'a' });
            expect(missing.statusCode).toBe(404);
            const badId = await request(app).put(`${base}/batches/abc`).set('Cookie', cookie).send({ name: 'a' });
            expect(badId.statusCode).toBe(400);
            const other = await request(app).put(`${base}/batches/900`).set('Cookie', ['Username=someone-else']).send({ name: 'a' });
            expect(other.statusCode).toBe(403);
        });
    });
});
