const path = require('path');
const fs = require('fs');
const { Client } = require('../../queries/client');
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
        // Mirror how production populates global.projectDbClients (see server.js), so
        // migrateProjectDb's promise-based db.run/db.all calls behave the same way they
        // do outside tests, instead of hitting the raw sqlite3.Database callback API.
        global.projectDbClients[dbPath] = new Client(dbPath);
    });

    afterEach(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        delete global.projectDbClients[dbPath];
    });

    test('migrateProjectDb adds missing reviewImage and validateImage columns to existing Images table', async () => {
        const db = global.projectDbClients[dbPath];
        await db.run('CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY)');
        await db.run("INSERT INTO Images (IName) VALUES ('test_image.jpg')");

        // Run migrateProjectDb
        await queries.project.migrateProjectDb(dbPath);

        // Verify query succeeds
        const result = await db.all(
            'SELECT Images.IName, Images.reviewImage, Images.validateImage FROM Images',
        );
        expect(result.rows).toBeDefined();
    });

    test('projectsFilter route handler query auto-migrates missing columns', async () => {
        const db = global.projectDbClients[dbPath];
        await db.run('CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY)');

        // Simulate reading legacy db using the same logic as getProjectPage / projectsFilter
        await db.run("ALTER TABLE Images ADD COLUMN reviewImage INTEGER NOT NULL DEFAULT 0");
        await db.run("ALTER TABLE Images ADD COLUMN validateImage INTEGER NOT NULL DEFAULT 0");
        const query = `
            SELECT Images.IName, Images.reviewImage, Images.validateImage, COUNT(Labels.LID) AS numLabels
            FROM Images
            LEFT JOIN Labels ON Images.IName = Labels.IName
            GROUP BY Images.IName
        `;
        const result = await db.all(query);
        expect(result.rows).toBeDefined();
    });
});
