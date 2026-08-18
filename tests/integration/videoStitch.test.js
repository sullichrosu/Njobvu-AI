jest.mock('../../queries/queries', () => ({
    project: {
        addImages: jest.fn().mockResolvedValue({ success: true }),
    },
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const sharp = require('sharp');
const queries = require('../../queries/queries');
const { stitchFrames } = require('../../routes/api/v2/videoStitch');

// Exercised against a minimal app (rather than the full app.js -> routes/api.js
// chain) for the same reason as s3Buckets.test.js: that chain pulls in an
// ESM-only package Jest can't transform, which is pre-existing and unrelated
// to this feature.
function buildTestApp() {
    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use(cookieParser());
    app.post('/api/v2/projects/:admin/:projectName/videos/stitch', stitchFrames);
    return app;
}

async function makeFrameDataUrl(width, height, color) {
    const buffer = await sharp({
        create: { width, height, channels: 4, background: color },
    })
        .png()
        .toBuffer();
    return `data:image/png;base64,${buffer.toString('base64')}`;
}

describe('POST /api/v2/projects/:admin/:projectName/videos/stitch', () => {
    let app;
    let tmpRoot;
    let imagesPath;

    beforeAll(() => {
        global.logger = { error: jest.fn(), debug: jest.fn() };
        app = buildTestApp();
    });

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'njobvu-stitch-'));
        global.currentPath = tmpRoot + path.sep;
        imagesPath = path.join(tmpRoot, 'public', 'projects', 'testuser-test-project', 'images');
        fs.mkdirSync(imagesPath, { recursive: true });
        jest.clearAllMocks();
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('stitches two frames horizontally, saves the file, and registers it as a project image', async () => {
        const frameA = await makeFrameDataUrl(10, 20, { r: 255, g: 0, b: 0, alpha: 1 });
        const frameB = await makeFrameDataUrl(10, 20, { r: 0, g: 255, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frameA }, { dataUrl: frameB }], layout: 'horizontal' });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.width).toBe(20);
        expect(res.body.height).toBe(20);
        expect(res.body.frameCount).toBe(2);

        const savedPath = path.join(imagesPath, res.body.fileName);
        expect(fs.existsSync(savedPath)).toBe(true);

        const savedMeta = await sharp(savedPath).metadata();
        expect(savedMeta.width).toBe(20);
        expect(savedMeta.height).toBe(20);

        expect(queries.project.addImages).toHaveBeenCalledWith(
            expect.stringContaining(path.join('testuser-test-project')),
            res.body.fileName,
            0,
            0,
        );
    });

    it('stacks frames vertically when layout=vertical', async () => {
        const frameA = await makeFrameDataUrl(10, 10, { r: 255, g: 0, b: 0, alpha: 1 });
        const frameB = await makeFrameDataUrl(10, 30, { r: 0, g: 0, b: 255, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frameA }, { dataUrl: frameB }], layout: 'vertical' });

        expect(res.statusCode).toBe(200);
        expect(res.body.width).toBe(10);
        expect(res.body.height).toBe(40);
    });

    it('arranges frames into a grid when layout=grid', async () => {
        const frames = await Promise.all(
            [0, 1, 2, 3].map(() => makeFrameDataUrl(10, 10, { r: 1, g: 2, b: 3, alpha: 1 })),
        );

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: frames.map((dataUrl) => ({ dataUrl })), layout: 'grid' });

        expect(res.statusCode).toBe(200);
        // ceil(sqrt(4)) = 2 columns, 2 rows, at 10x10 per cell
        expect(res.body.width).toBe(20);
        expect(res.body.height).toBe(20);
    });

    it('rejects requests from a user who does not own the project', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=someone-else'])
            .send({ frames: [{ dataUrl: frame }, { dataUrl: frame }] });

        expect(res.statusCode).toBe(403);
        expect(queries.project.addImages).not.toHaveBeenCalled();
    });

    it('rejects fewer than two frames', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frame }] });

        expect(res.statusCode).toBe(400);
        expect(queries.project.addImages).not.toHaveBeenCalled();
    });

    it('rejects more than twelve frames', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });
        const frames = new Array(13).fill({ dataUrl: frame });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames });

        expect(res.statusCode).toBe(400);
    });

    it('rejects an invalid layout value', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frame }, { dataUrl: frame }], layout: 'diagonal' });

        expect(res.statusCode).toBe(400);
    });

    it('rejects a frame that is not a valid image data URL', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/test-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frame }, { dataUrl: 'not-a-data-url' }] });

        expect(res.statusCode).toBe(400);
        expect(queries.project.addImages).not.toHaveBeenCalled();
    });

    it('returns 404 when the project does not exist on disk', async () => {
        const frame = await makeFrameDataUrl(5, 5, { r: 0, g: 0, b: 0, alpha: 1 });

        const res = await request(app)
            .post('/api/v2/projects/testuser/nonexistent-project/videos/stitch')
            .set('Cookie', ['Username=testuser'])
            .send({ frames: [{ dataUrl: frame }, { dataUrl: frame }] });

        expect(res.statusCode).toBe(404);
    });
});
