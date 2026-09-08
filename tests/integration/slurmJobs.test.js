jest.mock('../../queries/queries', () => ({
    managed: {
        listSlurmJobsForUser: jest.fn(),
        getSlurmJob: jest.fn(),
    },
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const queries = require('../../queries/queries');
const {
    getSlurmAccess,
    listSlurmJobs,
    getSlurmJobStatus,
    submitTrainingJob,
    submitInferenceJob,
} = require('../../routes/api/v2/slurmJobs');

function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.get('/api/v2/slurm/access', getSlurmAccess);
    app.get('/api/v2/slurm/jobs', listSlurmJobs);
    app.get('/api/v2/slurm/jobs/:slurmJobId', getSlurmJobStatus);
    app.post('/api/v2/slurm/training-jobs', submitTrainingJob);
    app.post('/api/v2/slurm/inference-jobs', submitInferenceJob);

    return app;
}

describe('Slurm job routes', () => {
    let app;

    beforeAll(() => {
        global.logger = { error: jest.fn(), debug: jest.fn() };
        app = buildTestApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
        global.configFile = undefined;
    });

    describe('GET /api/v2/slurm/access', () => {
        it('rejects unauthenticated requests', async () => {
            const res = await request(app).get('/api/v2/slurm/access');

            expect(res.statusCode).toBe(403);
            expect(res.body.success).toBe(false);
        });

        it('reports unconfigured/disallowed when no slurm_bin_path or allowlist is set', async () => {
            global.configFile = { slurm_bin_path: '', slurm_allowed_users: [] };

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, configured: false, allowed: false });
        });

        it('allows any logged-in user once configured, when the allowlist is empty', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.body).toEqual({ success: true, configured: true, allowed: true });
        });

        it('restricts access to users on a non-empty allowlist', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: ['alice'] };

            const denied = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=bob']);
            const allowed = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=alice']);

            expect(denied.body.allowed).toBe(false);
            expect(allowed.body.allowed).toBe(true);
        });
    });

    describe('GET /api/v2/slurm/jobs', () => {
        it('rejects unauthenticated requests', async () => {
            const res = await request(app).get('/api/v2/slurm/jobs');

            expect(res.statusCode).toBe(403);
        });

        it('returns the requesting user\'s job history', async () => {
            queries.managed.listSlurmJobsForUser.mockResolvedValue({
                rows: [{ SlurmJobId: '123', Status: 'RUNNING' }],
            });

            const res = await request(app)
                .get('/api/v2/slurm/jobs')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.jobs).toEqual([{ SlurmJobId: '123', Status: 'RUNNING' }]);
            expect(queries.managed.listSlurmJobsForUser).toHaveBeenCalledWith('testuser');
        });
    });

    describe('GET /api/v2/slurm/jobs/:slurmJobId', () => {
        it('404s when the job does not exist', async () => {
            queries.managed.getSlurmJob.mockResolvedValue({ row: undefined });

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });

        it('404s when the job belongs to a different user', async () => {
            queries.managed.getSlurmJob.mockResolvedValue({
                row: { SlurmJobId: '123', Username: 'someone-else' },
            });

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });

        it('returns the job when it belongs to the requesting user', async () => {
            queries.managed.getSlurmJob.mockResolvedValue({
                row: { SlurmJobId: '123', Username: 'testuser', Status: 'COMPLETED' },
            });

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.job.Status).toBe('COMPLETED');
        });
    });

    // submitTrainingJob/submitInferenceJob are stubs pending the sbatch
    // submission logic (see TODOs in routes/api/v2/slurmJobs.js); these guard
    // against silently shipping a route that does nothing.
    describe('POST /api/v2/slurm/training-jobs and /inference-jobs (not yet implemented)', () => {
        it('training-jobs responds 501 until job submission is implemented', async () => {
            const res = await request(app).post('/api/v2/slurm/training-jobs').send({});

            expect(res.statusCode).toBe(501);
        });

        it('inference-jobs responds 501 until job submission is implemented', async () => {
            const res = await request(app).post('/api/v2/slurm/inference-jobs').send({});

            expect(res.statusCode).toBe(501);
        });
    });
});
