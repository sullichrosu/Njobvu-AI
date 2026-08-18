// Unit tests for routes/pages/getAnnotatePage.js's S3 "stream" mode handling.
//
// Calls the handler directly (bypassing the full Express app/static
// middleware) since that stack is heavily mocked elsewhere for unrelated
// tests in a way that intercepts every route with an empty static response -
// exercising the real branching logic here needs a narrower harness.

jest.mock('../../queries/queries', () => ({
    managed: {
        getBucket: jest.fn(),
    },
}));

jest.mock('../../utils/s3Client', () => ({
    buildS3Client: jest.fn(() => ({ fakeClient: true })),
    getObjectStream: jest.fn(),
}));

const { Readable } = require('stream');
const queries = require('../../queries/queries');
const s3Client = require('../../utils/s3Client');
const getAnnotatePage = require('../../routes/pages/getAnnotatePage');

// Mirrors the real sqlite3 driver's callback style, since getAnnotatePage.js
// wraps `this.get`/`this.all` in its own Promise-returning getAsync/allAsync
// right after construction - only the raw callback methods are ever called.
function makeFakeProjectDb({ classesRows = [], labelsRows = [], imagesRows = [], displayRow }) {
    return {
        get: jest.fn((sql, cb) => {
            if (sql.includes('display_id')) return cb(null, displayRow);
            return cb(null, undefined);
        }),
        all: jest.fn((sql, cb) => {
            if (sql.includes('Classes')) return cb(null, classesRows);
            if (sql.includes('Labels')) return cb(null, labelsRows);
            if (sql.includes('Images')) return cb(null, imagesRows);
            return cb(null, []);
        }),
        each: jest.fn((sql, cb) => cb(null, undefined)),
        close: jest.fn((cb) => cb && cb(null)),
    };
}

describe('getAnnotatePage - S3-backed image serving', () => {
    let res;
    let req;

    beforeEach(() => {
        jest.clearAllMocks();

        global.logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn() };
        global.currentPath = '/app/';
        global.colorsJSON = [{ value: '#FF0000' }];
        global.db = {
            allAsync: jest.fn().mockResolvedValue([{ PName: 'test-project', Admin: 'testuser' }]),
            getAsync: jest.fn().mockResolvedValue({ AutoSave: 1 }),
        };

        req = {
            query: { IDX: '0', IName: 'image1.jpg', curr_class: 'class1' },
            cookies: { Username: 'testuser' },
        };
        res = { redirect: jest.fn(), render: jest.fn() };
    });

    it('serves a "stream"-mode image with no local file via the on-demand S3 proxy, without touching disk', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: 's3', SourceKey: 'images/image1.jpg' };

        global.fs = { existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() };
        global.sqlite3 = {
            Database: jest.fn((dbPath, cb) => {
                cb && cb(null);
                return makeFakeProjectDb({
                    imagesRows: [imageRow],
                    displayRow: { IName: 'image1.jpg', display_id: 1 },
                });
            }),
        };
        global.probe = jest.fn().mockResolvedValue({ width: 400, height: 300 });
        global.probe.sync = jest.fn();

        queries.managed.getBucket.mockResolvedValueOnce({
            row: { BucketName: 'my-bucket', Region: 'us-east-1', AccessKeyId: 'AKIA...', SecretAccessKey: 'secret' },
        });
        s3Client.getObjectStream.mockResolvedValueOnce({
            body: Readable.from([Buffer.from('fake-image-bytes')]),
            contentType: 'image/jpeg',
        });

        await getAnnotatePage(req, res);

        expect(global.fs.readFileSync).not.toHaveBeenCalled();
        expect(global.probe.sync).not.toHaveBeenCalled();
        expect(s3Client.getObjectStream).toHaveBeenCalledWith(
            { fakeClient: true },
            'my-bucket',
            'images/image1.jpg',
        );
        expect(res.render).toHaveBeenCalledWith('annotate', expect.objectContaining({
            image_path: 'api/v2/projects/testuser/test-project/images/image1.jpg',
            image_width: 400,
            image_height: 300,
        }));
    });

    it('still reads a locally-present file straight from disk, unaffected by the S3 changes', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: null, SourceKey: null };

        global.fs = {
            existsSync: jest.fn().mockReturnValue(true),
            readFileSync: jest.fn().mockReturnValue(Buffer.from('img-bytes')),
        };
        global.sqlite3 = {
            Database: jest.fn((dbPath, cb) => {
                cb && cb(null);
                return makeFakeProjectDb({
                    imagesRows: [imageRow],
                    displayRow: { IName: 'image1.jpg', display_id: 1 },
                });
            }),
        };
        global.probe = jest.fn();
        global.probe.sync = jest.fn().mockReturnValue({ width: 800, height: 600 });

        await getAnnotatePage(req, res);

        expect(s3Client.getObjectStream).not.toHaveBeenCalled();
        expect(queries.managed.getBucket).not.toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('annotate', expect.objectContaining({
            image_path: 'projects/testuser-test-project/images/image1.jpg',
            image_width: 800,
            image_height: 600,
        }));
    });

    it('renders 404 when there is no local file and the image is not S3-backed', async () => {
        const imageRow = { IName: 'image1.jpg', reviewImage: 0, Source: null, SourceKey: null };

        global.fs = { existsSync: jest.fn().mockReturnValue(false), readFileSync: jest.fn() };
        global.sqlite3 = {
            Database: jest.fn((dbPath, cb) => {
                cb && cb(null);
                return makeFakeProjectDb({
                    imagesRows: [imageRow],
                    displayRow: { IName: 'image1.jpg', display_id: 1 },
                });
            }),
        };

        await getAnnotatePage(req, res);

        expect(queries.managed.getBucket).not.toHaveBeenCalled();
        expect(res.render).toHaveBeenCalledWith('404', expect.any(Object));
    });
});
