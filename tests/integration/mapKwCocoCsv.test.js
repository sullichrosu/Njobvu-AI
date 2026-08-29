const request = require('supertest');
const fs = require('fs');
const path = require('path');
const os = require('os');
const app = require('../../app');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');

describe('POST /api/projects/map-kwcoco-csv', () => {
    let tmpDir;
    let projectDir;
    let originalProjectsPath;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'map-kwcoco-test-'));
        projectDir = path.join(__dirname, '..', '..', 'public', 'projects', 'admin-testproj');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.mkdirSync(path.join(projectDir, 'images'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'images', 'img1.jpg'), 'fake-image-data');
        fs.writeFileSync(path.join(projectDir, 'images', 'img2.jpg'), 'fake-image-data');

        const mockClient = {
            open: jest.fn(),
            all: jest.fn().mockImplementation((sql) => {
                if (sql.includes('Classes')) return Promise.resolve({ success: true, rows: [] });
                if (sql.includes('Images')) return Promise.resolve({ success: true, rows: global.__mockExistingImages || [] });
                if (sql.includes('Labels')) return Promise.resolve({ success: true, rows: [] });
                return Promise.resolve({ success: true, rows: [] });
            }),
            get: jest.fn().mockResolvedValue({ success: true, row: null }),
            run: jest.fn().mockResolvedValue({ success: true, changes: 1, lastID: 1 }),
        };

        global.projectDbClients = {
            [projectDir]: mockClient
        };
        global.__mockExistingImages = [];
    });

    afterEach(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns 400 when project name is missing', async () => {
        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .set('Cookie', ['Username=admin']);

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/Project name is required/i);
    });

    test('returns 400 when no annotation file is uploaded', async () => {
        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin');

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/No annotation file was uploaded/i);
    });

    test('returns 404 when project path does not exist', async () => {
        const csvContent = 'filename,class,xmin,ymin,xmax,ymax\nimg1.jpg,dolphin,10,10,50,50';
        const csvPath = path.join(tmpDir, 'test.csv');
        fs.writeFileSync(csvPath, csvContent);

        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'nonexistent_project')
            .field('Admin', 'admin')
            .attach('kwcoco_csv', csvPath);

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test('successfully maps KW COCO CSV annotations', async () => {
        const csvContent = `filename,class,xmin,ymin,xmax,ymax
img1.jpg,dolphin,10,20,100,150
img2.jpg,shark,30,40,80,120`;
        const csvPath = path.join(tmpDir, 'test.csv');
        fs.writeFileSync(csvPath, csvContent);

        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin')
            .attach('kwcoco_csv', csvPath);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.labelsInserted).toBe(2);
    });

    test('successfully maps KW COCO JSON annotations', async () => {
        const jsonContent = JSON.stringify({
            images: [
                { id: 1, file_name: 'img1.jpg' },
                { id: 2, file_name: 'img2.jpg' }
            ],
            annotations: [
                { id: 1, image_id: 1, category_id: 1, bbox: [10, 20, 90, 130] },
                { id: 2, image_id: 2, category_id: 2, bbox: [30, 40, 50, 80] }
            ],
            categories: [
                { id: 1, name: 'dolphin' },
                { id: 2, name: 'shark' }
            ]
        });
        const jsonPath = path.join(tmpDir, 'test.json');
        fs.writeFileSync(jsonPath, jsonContent);

        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin')
            .attach('kwcoco_json', jsonPath);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.labelsInserted).toBe(2);
    });

    test('skips annotations whose image file is not on disk instead of 404-ing later', async () => {
        const csvContent = `filename,class,xmin,ymin,xmax,ymax
img1.jpg,dolphin,10,20,100,150
missing.jpg,shark,30,40,80,120`;
        const csvPath = path.join(tmpDir, 'test.csv');
        fs.writeFileSync(csvPath, csvContent);

        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin')
            .attach('kwcoco_csv', csvPath);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.labelsInserted).toBe(1);
        expect(res.body.labelsSkipped).toBe(1);
        expect(res.body.missingImages).toEqual(['missing.jpg']);
    });

    test('maps annotations for images already registered via S3 streaming (no local file)', async () => {
        // Mirrors what routes/api/v2/s3Buckets.js's "stream" sync mode leaves behind:
        // an Images row with Source = "s3" and no file under images/.
        global.__mockExistingImages = [
            { IName: 'streamed.jpg', Source: 's3', SourceKey: 'raw/streamed.jpg' },
        ];

        const csvContent = 'filename,class,xmin,ymin,xmax,ymax\nstreamed.jpg,dolphin,10,20,100,150';
        const csvPath = path.join(tmpDir, 'test.csv');
        fs.writeFileSync(csvPath, csvContent);

        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin')
            .attach('kwcoco_csv', csvPath);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.labelsInserted).toBe(1);
        expect(res.body.labelsSkipped).toBe(0);
        expect(res.body.missingImages).toEqual([]);
    });
});
