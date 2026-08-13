jest.mock('fs', () => ({
    existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('../../queries/queries', () => ({
    managed: {
        attachBucket: jest.fn().mockResolvedValue({ success: true }),
        getBucket: jest.fn(),
        deleteBucket: jest.fn().mockResolvedValue({ success: true }),
        touchBucketSyncedAt: jest.fn().mockResolvedValue({ success: true }),
    },
    project: {
        addImages: jest.fn().mockResolvedValue({ success: true }),
    },
}));

jest.mock('../../utils/s3Client', () => ({
    buildS3Client: jest.fn(() => ({ fakeClient: true })),
    verifyBucketAccess: jest.fn().mockResolvedValue(undefined),
    listImageObjects: jest.fn().mockResolvedValue([]),
    downloadObjectToFile: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const queries = require('../../queries/queries');
const s3Client = require('../../utils/s3Client');
const {
    attachS3Bucket,
    getS3Bucket,
    deleteS3Bucket,
    syncS3Bucket,
} = require('../../routes/api/v2/s3Buckets');

// These handlers are exercised directly against a minimal app (rather than
// the full app.js -> routes/api.js chain) because this branch's chat route
// (routes/chat/ollamaChat.js) pulls in node-fetch v3, an ESM-only package
// that Jest cannot transform; that break is pre-existing and unrelated to
// the S3 bucket feature under test here.
function buildTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    app.post('/api/v2/projects/:admin/:projectName/s3-bucket', attachS3Bucket);
    app.get('/api/v2/projects/:admin/:projectName/s3-bucket', getS3Bucket);
    app.delete('/api/v2/projects/:admin/:projectName/s3-bucket', deleteS3Bucket);
    app.post('/api/v2/projects/:admin/:projectName/s3-bucket/sync', syncS3Bucket);

    return app;
}

describe('S3 Bucket Routes', () => {
    let app;

    beforeAll(() => {
        global.currentPath = '/test/path/';
        global.logger = { error: jest.fn(), debug: jest.fn() };
        global.readdirAsync = jest.fn().mockResolvedValue([]);
        app = buildTestApp();
    });

    afterEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
    });

    describe('POST /api/v2/projects/:admin/:projectName/s3-bucket', () => {
        const validBody = {
            BucketName: 'my-bucket',
            Region: 'us-east-1',
            Prefix: 'images/',
            AccessKeyId: 'AKIA...',
            SecretAccessKey: 'secret',
        };

        it('attaches a bucket when credentials are valid and the requester owns the project', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send(validBody);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(s3Client.verifyBucketAccess).toHaveBeenCalledWith(
                { fakeClient: true },
                'my-bucket',
            );
            expect(queries.managed.attachBucket).toHaveBeenCalledWith(
                'test-project',
                'testuser',
                'my-bucket',
                'us-east-1',
                'images/',
                'AKIA...',
                'secret',
            );
        });

        it('rejects requests from a user who does not own the project', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=someone-else'])
                .send(validBody);

            expect(res.statusCode).toBe(403);
            expect(queries.managed.attachBucket).not.toHaveBeenCalled();
        });

        it('rejects a request missing BucketName or Region', async () => {
            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send({ AccessKeyId: 'AKIA...', SecretAccessKey: 'secret' });

            expect(res.statusCode).toBe(400);
            expect(queries.managed.attachBucket).not.toHaveBeenCalled();
        });

        it('returns 400 when the bucket cannot be verified (bad credentials/permissions)', async () => {
            s3Client.verifyBucketAccess.mockRejectedValueOnce(new Error('Forbidden'));

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send(validBody);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
            expect(queries.managed.attachBucket).not.toHaveBeenCalled();
        });

        it('returns 404 when the project does not exist on disk', async () => {
            fs.existsSync.mockReturnValue(false);

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send(validBody);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('GET /api/v2/projects/:admin/:projectName/s3-bucket', () => {
        it('returns bucket details without leaking the secret access key', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    Prefix: 'images/',
                    LastSyncedAt: null,
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'super-secret',
                },
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.bucket.BucketName).toBe('my-bucket');
            expect(res.body.bucket.hasCredentials).toBe(true);
            expect(res.body.bucket.SecretAccessKey).toBeUndefined();
            expect(res.body.bucket.AccessKeyId).toBeUndefined();
        });

        it('returns 404 when no bucket is attached', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({ row: undefined });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v2/projects/:admin/:projectName/s3-bucket', () => {
        it('detaches the bucket for the project owner', async () => {
            const res = await request(app)
                .delete('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(queries.managed.deleteBucket).toHaveBeenCalledWith('test-project', 'testuser');
        });

        it('rejects detach requests from a non-owner', async () => {
            const res = await request(app)
                .delete('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=someone-else']);

            expect(res.statusCode).toBe(403);
            expect(queries.managed.deleteBucket).not.toHaveBeenCalled();
        });
    });

    describe('POST /api/v2/projects/:admin/:projectName/s3-bucket/sync', () => {
        it('downloads new objects, registers them as project images, and skips existing files', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    Prefix: 'images/',
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'secret',
                },
            });
            s3Client.listImageObjects.mockResolvedValueOnce([
                'images/cat.jpg',
                'images/already-here.jpg',
            ]);
            global.readdirAsync.mockResolvedValueOnce(['already-here.jpg']);

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.syncedCount).toBe(1);
            expect(res.body.skippedCount).toBe(1);
            expect(res.body.images).toEqual(['cat.jpg']);
            expect(s3Client.downloadObjectToFile).toHaveBeenCalledTimes(1);
            expect(queries.project.addImages).toHaveBeenCalledWith(
                expect.stringContaining('testuser-test-project'),
                'cat.jpg',
                0,
                0,
            );
            expect(queries.managed.touchBucketSyncedAt).toHaveBeenCalled();
        });

        it('returns 404 when the project has no attached bucket', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({ row: undefined });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
            expect(s3Client.listImageObjects).not.toHaveBeenCalled();
        });

        it('returns 404 when the project directory does not exist on disk', async () => {
            fs.existsSync.mockReturnValue(false);

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
            expect(queries.managed.getBucket).not.toHaveBeenCalled();
        });
    });
});
