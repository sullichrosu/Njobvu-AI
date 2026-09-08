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
    applyPreprocessingPipeline,
} = require('../../routes/api/v2/preprocessing');

// Handlers are exercised against a minimal app (mirroring
// tests/integration/s3Buckets.test.js) rather than the full app.js -> routes/api.js
// chain, since that chain pulls in ESM-only packages Jest cannot transform.
function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(fileUpload());

    app.get('/api/v2/projects/:admin/:projectName/preprocessing', getPreprocessingPipeline);
    app.put('/api/v2/projects/:admin/:projectName/preprocessing', savePreprocessingPipeline);
    app.post('/api/v2/projects/:admin/:projectName/preprocessing/scripts', uploadCustomScript);
    app.delete('/api/v2/projects/:admin/:projectName/preprocessing/scripts/:scriptId', deleteCustomScript);
    app.post('/api/v2/projects/:admin/:projectName/preprocessing/apply', applyPreprocessingPipeline);

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
                { id: 'c1', name: 'my_script.py', filename: 'c1-my_script.py', uploadedAt: '2026-01-01T00:00:00.000Z' },
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
});
