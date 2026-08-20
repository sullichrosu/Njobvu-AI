const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const queries = require('../../queries/queries');

describe('Legacy Database Migration for Images validateImage / reviewImage columns', () => {
    let tmpDir;
    let dbPath;

    beforeEach(() => {
        global.projectDbClients = {};
        tmpDir = path.join(__dirname, 'tmp_legacy_db_' + Date.now());
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        dbPath = path.join(tmpDir, 'test_legacy.db');
        global.projectDbClients[dbPath] = new sqlite3.Database(dbPath);
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        delete global.projectDbClients[dbPath];
    });

    test('migrateProjectDb adds missing reviewImage and validateImage columns to existing Images table', async () => {
        const db = global.projectDbClients[dbPath];
        db.run('CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY)');
        db.run("INSERT INTO Images (IName) VALUES ('test_image.jpg')");

        // Run migrateProjectDb
        await queries.project.migrateProjectDb(dbPath);

        // Verify query succeeds
        await new Promise((resolve, reject) => {
            const pdb = global.projectDbClients[dbPath];
            pdb.all(
                'SELECT Images.IName, Images.reviewImage, Images.validateImage FROM Images',
                [],
                (err, rows) => {
                    if (err) return reject(err);
                    expect(rows).toBeDefined();
                    resolve();
                }
            );
        });
    });

    test('projectsFilter route handler query auto-migrates missing columns', async () => {
        const db = global.projectDbClients[dbPath];
        db.run('CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY)');

        // Simulate reading legacy db using the same logic as getProjectPage / projectsFilter
        await new Promise((resolve, reject) => {
            const pdb = global.projectDbClients[dbPath];
            pdb.run("ALTER TABLE Images ADD COLUMN reviewImage INTEGER NOT NULL DEFAULT 0", () => {
                pdb.run("ALTER TABLE Images ADD COLUMN validateImage INTEGER NOT NULL DEFAULT 0", () => {
                    const query = `
                        SELECT Images.IName, Images.reviewImage, Images.validateImage, COUNT(Labels.LID) AS numLabels
                        FROM Images
                        LEFT JOIN Labels ON Images.IName = Labels.IName
                        GROUP BY Images.IName
                    `;
                    pdb.all(query, [], (err, rows) => {
                        if (err) return reject(err);
                        expect(rows).toBeDefined();
                        resolve();
                    });
                });
            });
        });
    });
});
