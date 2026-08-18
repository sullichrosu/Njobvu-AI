// Unit tests for queries/projects/projects.js#migrateProjectDb, covering the nullable
// Images.Source column added so an image's row can record where its bytes live (e.g.
// local disk vs. an S3 bucket) once storage backends other than local disk are supported.
// Project databases created before this column existed only get it via the PRAGMA-guarded
// ALTER TABLE below, since CREATE TABLE IF NOT EXISTS is a no-op on an existing table.

jest.mock('../../queries/getDbClient');

const getDbClient = require('../../queries/getDbClient');
const projects = require('../../queries/projects/projects');

describe('queries/projects migrateProjectDb Source column backfill', () => {
    let mockRun;
    let mockAll;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRun = jest.fn().mockResolvedValue({ success: true, changes: 0, lastID: 0 });
        mockAll = jest.fn();
        getDbClient.mockReturnValue({ run: mockRun, all: mockAll });
    });

    it('adds the Source column when an existing Images table predates it', async () => {
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
    });

    it('does not re-add the Source column when it is already present', async () => {
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
    });
});
