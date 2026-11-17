jest.mock('../../queries/queries', () => ({
    managed: {
        listSlurmJobsForUser: jest.fn(),
        getSlurmJob: jest.fn(),
        recordSlurmJob: jest.fn(),
        updateSlurmJobStatus: jest.fn(),
        listPartitionsForUser: jest.fn(),
    },
}));

jest.mock('../../utils/slurmSubmit', () => ({
    submitSbatchJob: jest.fn(),
    getSlurmJobRuntimeStatus: jest.fn(),
}));

jest.mock('../../utils/slurmTrainingJob', () => ({
    prepareTrainingSubmission: jest.fn(),
}));

jest.mock('../../utils/slurmYoloTrainingJob', () => ({
    prepareYoloTrainingSubmission: jest.fn(),
}));

jest.mock('../../utils/slurmInferenceJob', () => ({
    prepareInferenceSubmission: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const queries = require('../../queries/queries');
const { submitSbatchJob, getSlurmJobRuntimeStatus } = require('../../utils/slurmSubmit');
const { prepareTrainingSubmission } = require('../../utils/slurmTrainingJob');
const { prepareYoloTrainingSubmission } = require('../../utils/slurmYoloTrainingJob');
const { prepareInferenceSubmission } = require('../../utils/slurmInferenceJob');
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
            expect(res.body).toEqual({ success: true, configured: false, allowed: false, partitions: [], partitionsRequired: false });
        });

        it('allows any logged-in user once configured, when the allowlist is empty', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.body).toEqual({ success: true, configured: true, allowed: true, partitions: [], partitionsRequired: false });
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

        it('surfaces only this user\'s PartitionAccess grants for the frontend <select>', async () => {
            global.configFile = {
                slurm_bin_path: '/opt/slurm/bin',
                slurm_allowed_users: [],
                slurm_partitions: ['gpu', 'cpu', 'debug'],
            };
            queries.managed.listPartitionsForUser.mockResolvedValue({
                rows: [{ Partition: 'cpu' }, { Partition: 'debug' }],
            });

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.body.partitions).toEqual(['cpu', 'debug']);
            expect(res.body.partitionsRequired).toBe(true);
            expect(queries.managed.listPartitionsForUser).toHaveBeenCalledWith('testuser');
        });

        it('returns no partitions for a user with no grants, even though the cluster has some configured', async () => {
            global.configFile = {
                slurm_bin_path: '/opt/slurm/bin',
                slurm_allowed_users: [],
                slurm_partitions: ['gpu', 'cpu'],
            };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [] });

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.body.partitions).toEqual([]);
            expect(res.body.partitionsRequired).toBe(true);
        });

        it('reports partitionsRequired as false when the cluster has no partition concept', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };

            const res = await request(app)
                .get('/api/v2/slurm/access')
                .set('Cookie', ['Username=testuser']);

            expect(res.body.partitionsRequired).toBe(false);
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

        it('returns the job when it belongs to the requesting user (no scheduler configured)', async () => {
            queries.managed.getSlurmJob.mockResolvedValue({
                row: { SlurmJobId: '123', Username: 'testuser', Status: 'COMPLETED' },
            });

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.job.Status).toBe('COMPLETED');
            expect(getSlurmJobRuntimeStatus).not.toHaveBeenCalled();
        });

        it('refreshes and persists status from the scheduler when not yet terminal', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            queries.managed.getSlurmJob.mockResolvedValue({
                row: { SlurmJobId: '123', Username: 'testuser', Status: 'PENDING' },
            });
            getSlurmJobRuntimeStatus.mockResolvedValue('RUNNING');

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.job.Status).toBe('RUNNING');
            expect(getSlurmJobRuntimeStatus).toHaveBeenCalledWith('123');
            expect(queries.managed.updateSlurmJobStatus).toHaveBeenCalledWith('123', 'RUNNING', expect.any(String));
        });

        it('does not re-query the scheduler once a job is in a terminal state', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            queries.managed.getSlurmJob.mockResolvedValue({
                row: { SlurmJobId: '123', Username: 'testuser', Status: 'FAILED' },
            });

            const res = await request(app)
                .get('/api/v2/slurm/jobs/123')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(getSlurmJobRuntimeStatus).not.toHaveBeenCalled();
            expect(queries.managed.updateSlurmJobStatus).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v2/slurm/training-jobs', () => {
        it('rejects unauthenticated requests', async () => {
            const res = await request(app).post('/api/v2/slurm/training-jobs').send({});

            expect(res.statusCode).toBe(403);
        });

        it('rejects users without Slurm access', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: ['alice'] };

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=bob'])
                .send({ PName: 'proj', Admin: 'admin' });

            expect(res.statusCode).toBe(403);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
        });

        it('rejects when Slurm is not configured', async () => {
            // Non-empty allowlist containing the user so hasSlurmAccess()
            // passes regardless of isSlurmConfigured(), isolating the
            // "not configured" branch under test.
            global.configFile = { slurm_bin_path: '', slurm_allowed_users: ['testuser'] };

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin' });

            expect(res.statusCode).toBe(400);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
        });

        it('propagates validation errors from job preparation', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            const err = new Error('Missing required training job parameters');
            err.statusCode = 400;
            prepareTrainingSubmission.mockRejectedValue(err);

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({});

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(submitSbatchJob).not.toHaveBeenCalled();
        });

        it('submits the prepared job via sbatch and records it', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            prepareTrainingSubmission.mockResolvedValue({
                command: '/path/train_data_from_project.py -p python3 -s train.py -l log -o opts',
                runPath: '/proj/training/logs/123',
                jobName: 'train_proj_123',
                logFile: '/proj/training/logs/123/sbatch.out',
                errFile: '/proj/training/logs/123/123-error.log',
                PName: 'proj',
                Admin: 'admin',
            });
            submitSbatchJob.mockResolvedValue({ slurmJobId: '999' });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, slurmJobId: '999', runPath: '/proj/training/logs/123' });
            expect(queries.managed.recordSlurmJob).toHaveBeenCalledWith(
                '999',
                'testuser',
                'proj',
                'admin',
                'training',
                '/proj/training/logs/123',
                expect.any(String),
                undefined,
            );
        });

        it('rejects a user with no PartitionAccess grants at all when slurm_partitions is configured', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [], slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [] });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py', partition: 'gpu' });

            expect(res.statusCode).toBe(403);
            expect(res.body.success).toBe(false);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
            expect(submitSbatchJob).not.toHaveBeenCalled();
        });

        it('rejects a missing partition when the user has been granted some', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [], slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [{ Partition: 'gpu' }, { Partition: 'cpu' }] });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py' });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
            expect(submitSbatchJob).not.toHaveBeenCalled();
        });

        it('rejects a partition that is not on the configured list', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [], slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [{ Partition: 'gpu' }, { Partition: 'cpu' }] });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py', partition: 'not-a-real-partition' });

            expect(res.statusCode).toBe(400);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
        });

        it('rejects a partition that is configured but not granted to this user', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [], slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [{ Partition: 'cpu' }] });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py', partition: 'gpu' });

            expect(res.statusCode).toBe(400);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
        });

        it('accepts and threads through a valid, granted partition', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [], slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [{ Partition: 'gpu' }, { Partition: 'cpu' }] });
            prepareTrainingSubmission.mockResolvedValue({
                command: 'cmd', runPath: '/proj/training/logs/123', jobName: 'train_proj_123',
                logFile: '/proj/training/logs/123/sbatch.out', errFile: '/proj/training/logs/123/123-error.log',
                PName: 'proj', Admin: 'admin',
            });
            submitSbatchJob.mockResolvedValue({ slurmJobId: '999' });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py', partition: 'gpu' });

            expect(res.statusCode).toBe(200);
            expect(submitSbatchJob).toHaveBeenCalledWith(expect.objectContaining({ partition: 'gpu' }));
            expect(queries.managed.recordSlurmJob).toHaveBeenCalledWith(
                '999', 'testuser', 'proj', 'admin', 'training', '/proj/training/logs/123', expect.any(String), 'gpu',
            );
        });

        it('reports a 500 when sbatch submission itself fails', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            prepareTrainingSubmission.mockResolvedValue({
                command: 'cmd', runPath: '/run', jobName: 'job', logFile: '/run/log', errFile: '/run/err', PName: 'proj', Admin: 'admin',
            });
            submitSbatchJob.mockRejectedValue(new Error('sbatch: command not found'));

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', python_path: 'python3', script: 'train.py' });

            expect(res.statusCode).toBe(500);
            expect(queries.managed.recordSlurmJob).not.toHaveBeenCalled();
        });

        it('dispatches to the YOLO builder when training_type is "yolo", leaving the generic builder untouched', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            prepareYoloTrainingSubmission.mockResolvedValue({
                command: 'python3 datatovalues.py -d /run -t detect -m train -o "EMPTY"',
                runPath: '/proj/training/logs/456',
                jobName: 'train_yolo_proj_456',
                logFile: '/proj/training/logs/456/sbatch.out',
                errFile: '/proj/training/logs/456/456-error.log',
                PName: 'proj',
                Admin: 'admin',
            });
            submitSbatchJob.mockResolvedValue({ slurmJobId: '777' });

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', training_type: 'yolo', yolovx_path: '/usr/local/bin/yolo', weights: 'yolov8n.pt' });

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({ success: true, slurmJobId: '777', runPath: '/proj/training/logs/456' });
            expect(prepareYoloTrainingSubmission).toHaveBeenCalledTimes(1);
            expect(prepareTrainingSubmission).not.toHaveBeenCalled();
            expect(queries.managed.recordSlurmJob).toHaveBeenCalledWith(
                '777', 'testuser', 'proj', 'admin', 'training', '/proj/training/logs/456', expect.any(String), undefined,
            );
        });

        it('propagates validation errors from the YOLO builder', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            const err = new Error('Missing required YOLO training job parameters (PName, Admin, yolovx_path, weights)');
            err.statusCode = 400;
            prepareYoloTrainingSubmission.mockRejectedValue(err);

            const res = await request(app)
                .post('/api/v2/slurm/training-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ training_type: 'yolo' });

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(submitSbatchJob).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v2/slurm/inference-jobs', () => {
        it('rejects unauthenticated requests', async () => {
            const res = await request(app).post('/api/v2/slurm/inference-jobs').send({});

            expect(res.statusCode).toBe(403);
        });

        it('rejects users without Slurm access', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: ['alice'] };

            const res = await request(app)
                .post('/api/v2/slurm/inference-jobs')
                .set('Cookie', ['Username=bob'])
                .send({ PName: 'proj', Admin: 'admin', inference_type: 'yolo' });

            expect(res.statusCode).toBe(403);
            expect(prepareInferenceSubmission).not.toHaveBeenCalled();
        });

        it('rejects when Slurm is not configured', async () => {
            global.configFile = { slurm_bin_path: '', slurm_allowed_users: ['testuser'] };

            const res = await request(app)
                .post('/api/v2/slurm/inference-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', inference_type: 'yolo' });

            expect(res.statusCode).toBe(400);
            expect(prepareInferenceSubmission).not.toHaveBeenCalled();
        });

        it('propagates an unsupported inference_type as a 400', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            const err = new Error('Unsupported inference_type "bogus"');
            err.statusCode = 400;
            prepareInferenceSubmission.mockRejectedValue(err);

            const res = await request(app)
                .post('/api/v2/slurm/inference-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', inference_type: 'bogus' });

            expect(res.statusCode).toBe(400);
            expect(submitSbatchJob).not.toHaveBeenCalled();
        });

        it.each(['yolo', 'megadetector', 'inception'])(
            'submits a prepared %s job via sbatch and records it',
            async (inferenceType) => {
                global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
                prepareInferenceSubmission.mockResolvedValue({
                    command: `python3 ${inferenceType}.py`,
                    runPath: `/proj/inference/logs/123`,
                    jobName: `inference_${inferenceType}_proj_123`,
                    logFile: `/proj/inference/logs/123/sbatch.out`,
                    errFile: `/proj/inference/logs/123/123-error.log`,
                    PName: 'proj',
                    Admin: 'admin',
                });
                submitSbatchJob.mockResolvedValue({ slurmJobId: '888' });

                const res = await request(app)
                    .post('/api/v2/slurm/inference-jobs')
                    .set('Cookie', ['Username=testuser'])
                    .send({ PName: 'proj', Admin: 'admin', inference_type: inferenceType });

                expect(res.statusCode).toBe(200);
                expect(res.body).toEqual({ success: true, slurmJobId: '888', runPath: '/proj/inference/logs/123' });
                expect(queries.managed.recordSlurmJob).toHaveBeenCalledWith(
                    '888',
                    'testuser',
                    'proj',
                    'admin',
                    'inference',
                    '/proj/inference/logs/123',
                    expect.any(String),
                    undefined,
                );
            },
        );

        it('reports a 500 when sbatch submission itself fails', async () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };
            prepareInferenceSubmission.mockResolvedValue({
                command: 'cmd', runPath: '/run', jobName: 'job', logFile: '/run/log', errFile: '/run/err', PName: 'proj', Admin: 'admin',
            });
            submitSbatchJob.mockRejectedValue(new Error('sbatch: command not found'));

            const res = await request(app)
                .post('/api/v2/slurm/inference-jobs')
                .set('Cookie', ['Username=testuser'])
                .send({ PName: 'proj', Admin: 'admin', inference_type: 'yolo' });

            expect(res.statusCode).toBe(500);
            expect(queries.managed.recordSlurmJob).not.toHaveBeenCalled();
        });
    });
});
