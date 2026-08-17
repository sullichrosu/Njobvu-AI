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

        const mockClient = {
            open: jest.fn(),
            all: jest.fn().mockImplementation((sql) => {
                if (sql.includes('Classes')) return Promise.resolve([]);
                if (sql.includes('Images')) return Promise.resolve([]);
                if (sql.includes('Labels')) return Promise.resolve([]);
                return Promise.resolve([]);
            }),
            get: jest.fn().mockResolvedValue(null),
            run: jest.fn().mockResolvedValue({ changes: 1 }),
        };

        global.projectDbClients = {
            [projectDir]: mockClient
        };
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

    test('returns 400 when no CSV file is uploaded', async () => {
        const res = await request(app)
            .post('/api/projects/map-kwcoco-csv')
            .field('PName', 'testproj')
            .field('Admin', 'admin');

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/No CSV file was uploaded/i);
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
});
