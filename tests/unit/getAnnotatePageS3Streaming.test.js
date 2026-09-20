// Unit tests for routes/pages/getAnnotatePage.js's S3 "stream" mode handling.
//
// getAnnotatePage.js is built entirely on the async queries library
// (queries.managed.* / queries.project.*), not raw sqlite3/global.db, so
// every project/image lookup it makes is mocked at that layer.

jest.mock('../../queries/queries', () => ({
    managed: {
        getUserProjects: jest.fn(),
        getBucket: jest.fn(),
        sql: jest.fn(),
    },
    project: {
        getAllClasses: jest.fn(),
        getAllImages: jest.fn(),
        getLabelsForImageName: jest.fn(),
        getImage: jest.fn(),
        sql: jest.fn(),
    },
}));

jest.mock('../../utils/s3Client', () => ({
    buildS3Client: jest.fn(() => ({ fakeClient: true })),
    getObjectStream: jest.fn(),
}));
jest.mock('fs', () => {
    const actualFs = jest.requireActual('fs');
    return {
        ...actualFs,
        existsSync: jest.fn(),
        readFileSync: jest.fn(),
    };
});
jest.mock('probe-image-size', () => {
    const probe = jest.fn();
    probe.sync = jest.fn();
    return probe;
});

const { Readable } = require('stream');
const fs = require('fs');
const probe = require('probe-image-size');
const queries = require('../../queries/queries');
const s3Client = require('../../utils/s3Client');
const getAnnotatePage = require('../../routes/pages/getAnnotatePage');

function setupCommonQueries({ imageRow, classRows = [{ CName: 'class1' }] }) {
    queries.managed.getUserProjects.mockResolvedValue({
        rows: [{ PName: 'test-project', Admin: 'testuser' }],
    });
    queries.project.getAllClasses.mockResolvedValue({ rows: classRows });
    queries.project.getAllImages.mockResolvedValue({ rows: [imageRow] });
    queries.project.sql.mockResolvedValue({ rows: [{ IName: imageRow.IName, display_id: 1 }] });
    queries.project.getLabelsForImageName.mockResolvedValue({ rows: [] });
    queries.project.getImage.mockResolvedValue({ row: imageRow });
    queries.managed.sql.mockImplementation((sql) => {
        if (sql.includes('AutoSave')) return Promise.resolve({ rows: [{ AutoSave: 1 }], row: { AutoSave: 1 } });
        if (sql.includes('Access')) return Promise.resolve({ rows: [], row: null });
        return Promise.resolve({ rows: [], row: null });
    });
}

describe('getAnnotatePage - S3-backed image serving', () => {
    let res;
    let req;

    beforeEach(() => {
        jest.clearAllMocks();

        global.logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn() };
        global.currentPath = '/app/';
        global.colorsJSON = [{ value: '#FF0000' }];

        req = {
            query: { IDX: '0', IName: 'image1.jpg', curr_class: 'class1' },
            cookies: { Username: 'testuser' },
        };
        res = { redirect: jest.fn(), render: jest.fn() };
    });

    it('serves a "stream"-mode image with no local file via the on-demand S3 proxy, without touching disk', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: 's3', SourceKey: 'images/image1.jpg' };
        setupCommonQueries({ imageRow });

        fs.existsSync.mockReturnValue(false);
        fs.readFileSync.mockReset();
        probe.mockResolvedValue({ width: 400, height: 300 });
        probe.sync.mockReset();

        queries.managed.getBucket.mockResolvedValueOnce({
            row: { BucketName: 'my-bucket', Region: 'us-east-1', AccessKeyId: 'AKIA...', SecretAccessKey: 'secret' },
        });
        s3Client.getObjectStream.mockResolvedValueOnce({
            body: Readable.from([Buffer.from('fake-image-bytes')]),
            contentType: 'image/jpeg',
        });

        await getAnnotatePage(req, res);

        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(probe.sync).not.toHaveBeenCalled();
        expect(s3Client.getObjectStream).toHaveBeenCalledWith(
            { fakeClient: true },
            'my-bucket',
            'images/image1.jpg',
        );
        expect(res.render).toHaveBeenCalledWith('annotate', expect.objectContaining({
            image_path: '/api/v2/projects/testuser/test-project/images/image1.jpg',
            image_width: 400,
            image_height: 300,
        }));
    });

    it('still reads a locally-present file straight from disk, unaffected by the S3 changes', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: null, SourceKey: null };
        setupCommonQueries({ imageRow });

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(Buffer.from('img-bytes'));
        probe.mockReset();
        probe.sync.mockReturnValue({ width: 800, height: 600 });

        await getAnnotatePage(req, res);

        expect(s3Client.getObjectStream).not.toHaveBeenCalled();
        expect(queries.managed.getBucket).not.toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('annotate', expect.objectContaining({
            image_path: '/projects/testuser-test-project/images/image1.jpg',
            image_width: 800,
            image_height: 600,
        }));
    });

    it('renders 404 when there is no local file and the image is not S3-backed', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: null, SourceKey: null };
        setupCommonQueries({ imageRow });

        fs.existsSync.mockReturnValue(false);
        fs.readFileSync.mockReset();

        await getAnnotatePage(req, res);

        expect(queries.managed.getBucket).not.toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('404', expect.any(Object));
    });
});
