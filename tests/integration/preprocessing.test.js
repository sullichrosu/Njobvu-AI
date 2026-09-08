jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
}));

jest.mock('../../queries/queries', () => ({
    managed: {
        listSteps: jest.fn(),
        replaceSteps: jest.fn().mockResolvedValue({ success: true }),
        listScripts: jest.fn(),
        addScript: jest.fn(),
    },
}));

jest.mock('../../controllers/preprocessing/applyPipeline', () => ({
    applyPipelineToProject: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const queries = require('../../queries/queries');
const { applyPipelineToProject } = require('../../controllers/preprocessing/applyPipeline');
const {
    getPreprocessingPipeline,
    savePreprocessingPipeline,
    uploadPreprocessingScript,
    applyPreprocessingPipeline,
} = require('../../routes/api/v2/preprocessing');

// Handlers are exercised directly against a minimal app (rather than the
// full app.js -> routes/api.js chain) for the same reason as
// tests/integration/s3Buckets.test.js: this branch's chat route pulls in an
// ESM-only package that Jest cannot transform.
function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.get('/api/v2/projects/:admin/:projectName/preprocessing', getPreprocessingPipeline);
    app.put('/api/v2/projects/:admin/:projectName/preprocessing', savePreprocessingPipeline);
    app.post('/api/v2/projects/:admin/:projectName/preprocessing/apply', applyPreprocessingPipeline);

    return app;
}

describe('Pre-processing Pipeline Routes', () => {
    let app;

    beforeAll(() => {
        global.currentPath = '/test/path/';
        global.logger = { error: jest.fn(), debug: jest.fn() };
        app = buildTestApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
    });

    describe('GET /api/v2/projects/:admin/:projectName/preprocessing', () => {
        it('returns the mapped pipeline and custom scripts for the project owner', async () => {
            queries.managed.listSteps.mockResolvedValueOnce({
                rows: [
                    { Id: 1, Type: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{"width":640}' },
                    { Id: 2, Type: 'custom', ScriptId: 7, Enabled: 0, StepOrder: 1, Params: '{}' },
                ],
            });
            queries.managed.listScripts.mockResolvedValueOnce({
                rows: [{ Id: 7, Name: 'my_step.py', Filename: '123_my_step.py' }],
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.pipeline).toEqual([
                { id: 1, type: 'resize', scriptId: undefined, enabled: true, order: 0, params: { width: 640 } },
                { id: 2, type: 'custom', scriptId: 7, enabled: false, order: 1, params: {} },
            ]);
            expect(res.body.customScripts).toEqual([{ id: 7, name: 'my_step.py', filename: '123_my_step.py' }]);
        });

        it('rejects requests from a user who does not own the project', async () => {
            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(403);
            expect(queries.managed.listSteps).not.toHaveBeenCalled();
        });

        it('returns 500 when the pipeline cannot be fetched', async () => {
            queries.managed.listSteps.mockRejectedValueOnce(new Error('db error'));

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        });
    });

    describe('PUT /api/v2/projects/:admin/:projectName/preprocessing', () => {
        const validPipeline = [
            { type: 'resize', enabled: true, order: 0, params: { width: 640, height: 480 } },
            { type: 'custom', scriptId: 7, enabled: true, order: 1, params: {} },
        ];

        it('saves a valid pipeline for the project owner', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: validPipeline });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(queries.managed.replaceSteps).toHaveBeenCalledWith('test-project', 'testuser', validPipeline);
        });

        it('rejects a request whose body is missing the pipeline array', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({});

            expect(res.statusCode).toBe(400);
            expect(queries.managed.replaceSteps).not.toHaveBeenCalled();
        });

        it('rejects a step with an unrecognized type', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: [{ type: 'sharpen', enabled: true, order: 0, params: {} }] });

            expect(res.statusCode).toBe(400);
            expect(queries.managed.replaceSteps).not.toHaveBeenCalled();
        });

        it('rejects a custom step without a scriptId', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=testuser'])
                .send({ pipeline: [{ type: 'custom', enabled: true, order: 0, params: {} }] });

            expect(res.statusCode).toBe(400);
            expect(queries.managed.replaceSteps).not.toHaveBeenCalled();
        });

        it('rejects requests from a user who does not own the project', async () => {
            const res = await request(app)
                .put('/api/v2/projects/testuser/test-project/preprocessing')
                .set('Cookie', ['Username=someone-else'])
                .send({ pipeline: validPipeline });

            expect(res.statusCode).toBe(403);
            expect(queries.managed.replaceSteps).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v2/projects/:admin/:projectName/preprocessing/scripts (uploadPreprocessingScript)', () => {
        function mockReqRes({ fileName = 'custom_step.py', cookieUser = 'testuser', includeFile = true } = {}) {
            const req = {
                params: { admin: 'testuser', projectName: 'test-project' },
                cookies: { Username: cookieUser },
                files: includeFile
                    ? { script: { name: fileName, mv: jest.fn().mockResolvedValue(undefined) } }
                    : {},
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn().mockReturnThis(),
            };
            return { req, res };
        }

        it('stores an uploaded .py script and records it against the project', async () => {
            queries.managed.addScript.mockResolvedValueOnce({ lastID: 42 });
            const { req, res } = mockReqRes();

            await uploadPreprocessingScript(req, res);

            expect(req.files.script.mv).toHaveBeenCalled();
            expect(queries.managed.addScript).toHaveBeenCalledWith(
                'test-project', 'testuser', 'custom_step.py', expect.stringMatching(/_custom_step\.py$/),
            );
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                script: { id: 42, name: 'custom_step.py', filename: expect.stringMatching(/_custom_step\.py$/) },
            });
        });

        it('creates the scripts directory on first upload', async () => {
            queries.managed.addScript.mockResolvedValueOnce({ lastID: 1 });
            fs.existsSync.mockImplementation((p) => !String(p).endsWith('scripts'));
            const { req, res } = mockReqRes();

            await uploadPreprocessingScript(req, res);

            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('scripts'), { recursive: true });
        });

        it('rejects a non-.py file', async () => {
            const { req, res } = mockReqRes({ fileName: 'not_a_script.txt' });

            await uploadPreprocessingScript(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(queries.managed.addScript).not.toHaveBeenCalled();
        });

        it('rejects a request with no file attached', async () => {
            const { req, res } = mockReqRes({ includeFile: false });

            await uploadPreprocessingScript(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it('rejects requests from a user who does not own the project', async () => {
            const { req, res } = mockReqRes({ cookieUser: 'someone-else' });

            await uploadPreprocessingScript(req, res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(queries.managed.addScript).not.toHaveBeenCalled();
        });

        it('returns 404 when the project does not exist on disk', async () => {
            fs.existsSync.mockReturnValue(false);
            const { req, res } = mockReqRes();

            await uploadPreprocessingScript(req, res);

            expect(res.status).toHaveBeenCalledWith(404);
        });
    });

    describe('POST /api/v2/projects/:admin/:projectName/preprocessing/apply', () => {
        it('applies only the enabled steps and reports how many images were processed', async () => {
            queries.managed.listSteps.mockResolvedValueOnce({
                rows: [
                    { Id: 1, Type: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{}' },
                    { Id: 2, Type: 'rotate', ScriptId: null, Enabled: 0, StepOrder: 1, Params: '{}' },
                ],
            });
            queries.managed.listScripts.mockResolvedValueOnce({ rows: [] });
            applyPipelineToProject.mockResolvedValueOnce({ processed: 12 });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, processed: 12 });
            const callArg = applyPipelineToProject.mock.calls[0][0];
            expect(callArg.pipeline).toHaveLength(1);
            expect(callArg.pipeline[0].type).toBe('resize');
        });

        it('rejects when the pipeline has no enabled steps', async () => {
            queries.managed.listSteps.mockResolvedValueOnce({
                rows: [{ Id: 1, Type: 'resize', ScriptId: null, Enabled: 0, StepOrder: 0, Params: '{}' }],
            });
            queries.managed.listScripts.mockResolvedValueOnce({ rows: [] });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(400);
            expect(applyPipelineToProject).not.toHaveBeenCalled();
        });

        it('returns 404 when the project does not exist on disk', async () => {
            fs.existsSync.mockReturnValue(false);

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });

        it('rejects requests from a user who does not own the project', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(403);
            expect(applyPipelineToProject).not.toHaveBeenCalled();
        });

        it('returns 500 when applying the pipeline throws', async () => {
            queries.managed.listSteps.mockResolvedValueOnce({
                rows: [{ Id: 1, Type: 'resize', ScriptId: null, Enabled: 1, StepOrder: 0, Params: '{}' }],
            });
            queries.managed.listScripts.mockResolvedValueOnce({ rows: [] });
            applyPipelineToProject.mockRejectedValueOnce(new Error('python failed'));

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/preprocessing/apply')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(500);
            expect(res.body.success).toBe(false);
        });
    });
});
