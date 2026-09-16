// Unit tests for queries/projects/projects.js#migrateProjectDb, covering the nullable
// Images.Source/SourceKey columns added so an image's row can record where its bytes
// live (e.g. local disk vs. an S3 bucket) and, for S3-backed images, the literal object
// key (decoupled from IName, since two different keys can sanitize to the same display
// name and need disambiguating - see s3Buckets.test.js). Project databases created
// before these columns existed only get them via the PRAGMA-guarded ALTER TABLE below,
// since CREATE TABLE IF NOT EXISTS is a no-op on an existing table.

jest.mock('../../queries/getDbClient');

const getDbClient = require('../../queries/getDbClient');
const projects = require('../../queries/projects/projects');

describe('queries/projects migrateProjectDb Source/SourceKey column backfill', () => {
    let mockRun;
    let mockAll;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRun = jest.fn().mockResolvedValue({ success: true, changes: 0, lastID: 0 });
        mockAll = jest.fn();
        getDbClient.mockReturnValue({ run: mockRun, all: mockAll });
    });

    it('adds both columns when an existing Images table predates them', async () => {
        mockAll.mockResolvedValue({
            success: true,
            rows: [
                { name: 'IName' },
                { name: 'reviewImage' },
                { name: 'validateImage' },
            ],
        });

        await projects.project.migrateProjectDb('/projects/testuser-test-project');

        expect(mockAll).toHaveBeenCalledWith('PRAGMA table_info(Images)');
        expect(mockRun).toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN Source VARCHAR DEFAULT NULL',
        );
        expect(mockRun).toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN SourceKey VARCHAR DEFAULT NULL',
        );
    });

    it('only adds the column that is missing when one already exists', async () => {
        mockAll.mockResolvedValue({
            success: true,
            rows: [
                { name: 'IName' },
                { name: 'reviewImage' },
                { name: 'validateImage' },
                { name: 'Source' },
            ],
        });

        await projects.project.migrateProjectDb('/projects/testuser-test-project');

        expect(mockRun).not.toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN Source VARCHAR DEFAULT NULL',
        );
        expect(mockRun).toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN SourceKey VARCHAR DEFAULT NULL',
        );
    });

    it('does not re-add either column when both are already present', async () => {
        mockAll.mockResolvedValue({
            success: true,
            rows: [
                { name: 'IName' },
                { name: 'reviewImage' },
                { name: 'validateImage' },
                { name: 'Source' },
                { name: 'SourceKey' },
            ],
        });

        await projects.project.migrateProjectDb('/projects/testuser-test-project');

        expect(mockRun).not.toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN Source VARCHAR DEFAULT NULL',
        );
        expect(mockRun).not.toHaveBeenCalledWith(
            'ALTER TABLE Images ADD COLUMN SourceKey VARCHAR DEFAULT NULL',
        );
    });
});

describe('queries/projects addImages Source/SourceKey parameters', () => {
    let mockRun;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRun = jest.fn().mockResolvedValue({ success: true, changes: 1, lastID: 1 });
        getDbClient.mockReturnValue({ run: mockRun });
    });

    it('defaults Source and SourceKey to null for callers that do not pass them', async () => {
        await projects.project.addImages('/projects/testuser-test-project', 'cat.jpg', 0, 0);

        expect(mockRun).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO Images'),
            ['cat.jpg', 0, 0, null, null],
        );
    });

    it('passes through Source and SourceKey when a caller (e.g. S3 sync) provides them', async () => {
        await projects.project.addImages(
            '/projects/testuser-test-project',
            'cat.jpg',
            0,
            0,
            's3',
            'images/cat.jpg',
        );

        expect(mockRun).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO Images'),
            ['cat.jpg', 0, 0, 's3', 'images/cat.jpg'],
        );
    });
});
