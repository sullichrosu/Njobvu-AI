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
        getAllImages: jest.fn().mockResolvedValue({ success: true, rows: [] }),
        getImage: jest.fn(),
    },
}));

jest.mock('../../utils/s3Client', () => ({
    buildS3Client: jest.fn(() => ({ fakeClient: true })),
    verifyBucketAccess: jest.fn().mockResolvedValue(undefined),
    listImageObjects: jest.fn().mockResolvedValue([]),
    downloadObjectToFile: jest.fn().mockResolvedValue(undefined),
    getObjectStream: jest.fn(),
}));

const { Readable } = require('stream');
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
    getProjectImage,
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
    // `fs` is mocked module-wide down to just existsSync (below), so stub
    // res.sendFile here rather than letting Express's real implementation
    // reach for fs.stat/createReadStream, which don't exist on the mock.
    app.get(
        '/api/v2/projects/:admin/:projectName/images/:imageName',
        (req, res, next) => {
            res.sendFile = jest.fn((filePath) => res.status(200).send(`local-file:${filePath}`));
            next();
        },
        getProjectImage,
    );

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
                '',
                'download',
            );
        });

        it('defaults SyncMode to "download" when omitted or invalid, and passes through "stream" when requested', async () => {
            await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send({ ...validBody, SyncMode: 'not-a-real-mode' });

            expect(queries.managed.attachBucket).toHaveBeenNthCalledWith(
                1,
                'test-project', 'testuser', 'my-bucket', 'us-east-1', 'images/', 'AKIA...', 'secret', '', 'download',
            );

            await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser'])
                .send({ ...validBody, SyncMode: 'stream' });

            expect(queries.managed.attachBucket).toHaveBeenNthCalledWith(
                2,
                'test-project', 'testuser', 'my-bucket', 'us-east-1', 'images/', 'AKIA...', 'secret', '', 'stream',
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
                    SyncMode: 'stream',
                },
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.bucket.BucketName).toBe('my-bucket');
            expect(res.body.bucket.SyncMode).toBe('stream');
            expect(res.body.bucket.hasCredentials).toBe(true);
            expect(res.body.bucket.SecretAccessKey).toBeUndefined();
            expect(res.body.bucket.AccessKeyId).toBeUndefined();
        });

        it('defaults SyncMode to "download" for buckets attached before the column existed', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: { BucketName: 'my-bucket', Region: 'us-east-1', Prefix: '', SyncMode: null },
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/s3-bucket')
                .set('Cookie', ['Username=testuser']);

            expect(res.body.bucket.SyncMode).toBe('download');
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
                's3',
                'images/cat.jpg',
            );
            expect(queries.managed.touchBucketSyncedAt).toHaveBeenCalled();
        });

        it('skips an object already synced by key, even if its name is no longer the only file on disk', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    Prefix: 'images/',
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'secret',
                },
            });
            s3Client.listImageObjects.mockResolvedValueOnce(['images/cat.jpg']);
            global.readdirAsync.mockResolvedValueOnce(['cat.jpg']);
            queries.project.getAllImages.mockResolvedValueOnce({
                success: true,
                rows: [{ IName: 'cat.jpg', Source: 's3', SourceKey: 'images/cat.jpg' }],
            });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.syncedCount).toBe(0);
            expect(res.body.skippedCount).toBe(1);
            expect(s3Client.downloadObjectToFile).not.toHaveBeenCalled();
            expect(queries.project.addImages).not.toHaveBeenCalled();
        });

        it('disambiguates two different keys that sanitize to the same basename instead of dropping one', async () => {
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
                '2024/img.jpg',
                '2025/img.jpg',
            ]);
            global.readdirAsync.mockResolvedValueOnce([]);
            queries.project.getAllImages.mockResolvedValueOnce({ success: true, rows: [] });

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.syncedCount).toBe(2);
            expect(res.body.skippedCount).toBe(0);
            expect(res.body.images[0]).toBe('img.jpg');
            expect(res.body.images[1]).not.toBe('img.jpg');
            expect(res.body.images[1]).toMatch(/^img_[0-9a-f]{8}\.jpg$/);

            expect(queries.project.addImages).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('testuser-test-project'),
                'img.jpg',
                0,
                0,
                's3',
                '2024/img.jpg',
            );
            expect(queries.project.addImages).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('testuser-test-project'),
                res.body.images[1],
                0,
                0,
                's3',
                '2025/img.jpg',
            );

            // Deterministic: re-running sync against the same key must reproduce the
            // same disambiguated name, not draw a fresh suffix each time.
            const crypto = require('crypto');
            const expectedHash = crypto
                .createHash('sha1')
                .update('2025/img.jpg')
                .digest('hex')
                .slice(0, 8);
            expect(res.body.images[1]).toBe(`img_${expectedHash}.jpg`);
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

        it('registers images without downloading them when SyncMode is "stream"', async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    Prefix: 'images/',
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'secret',
                    SyncMode: 'stream',
                },
            });
            s3Client.listImageObjects.mockResolvedValueOnce(['images/cat.jpg']);
            global.readdirAsync.mockResolvedValueOnce([]);

            const res = await request(app)
                .post('/api/v2/projects/testuser/test-project/s3-bucket/sync')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.body.syncedCount).toBe(1);
            expect(s3Client.downloadObjectToFile).not.toHaveBeenCalled();
            expect(queries.project.addImages).toHaveBeenCalledWith(
                expect.stringContaining('testuser-test-project'),
                'cat.jpg',
                0,
                0,
                's3',
                'images/cat.jpg',
            );
        });
    });

    describe('GET /api/v2/projects/:admin/:projectName/images/:imageName', () => {
        it('serves a locally-present file from disk without touching S3', async () => {
            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/images/cat.jpg')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.text).toContain('local-file:');
            expect(res.text).toContain('cat.jpg');
            expect(s3Client.getObjectStream).not.toHaveBeenCalled();
        });

        it('streams a "stream"-mode image live from S3 when no local file exists', async () => {
            fs.existsSync.mockReturnValue(false);
            queries.project.getImage.mockResolvedValueOnce({
                row: { IName: 'cat.jpg', Source: 's3', SourceKey: 'images/cat.jpg' },
            });
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'secret',
                    SyncMode: 'stream',
                },
            });
            s3Client.getObjectStream.mockResolvedValueOnce({
                body: Readable.from([Buffer.from('fake-image-bytes')]),
                contentType: 'image/jpeg',
            });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/images/cat.jpg')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('image/jpeg');
            expect(Buffer.from(res.body).toString()).toBe('fake-image-bytes');
            expect(s3Client.getObjectStream).toHaveBeenCalledWith(
                { fakeClient: true },
                'my-bucket',
                'images/cat.jpg',
            );
        });

        it('returns 404 when neither a local file nor an S3-backed row exists', async () => {
            fs.existsSync.mockReturnValue(false);
            queries.project.getImage.mockResolvedValueOnce({ row: undefined });

            const res = await request(app)
                .get('/api/v2/projects/testuser/test-project/images/missing.jpg')
                .set('Cookie', ['Username=testuser']);

            expect(res.statusCode).toBe(404);
        });

        it('rejects requests from a logged-out client', async () => {
            const res = await request(app).get(
                '/api/v2/projects/testuser/test-project/images/cat.jpg',
            );

            expect(res.statusCode).toBe(403);
        });
    });
});
