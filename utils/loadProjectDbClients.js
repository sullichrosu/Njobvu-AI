const fs = require("fs");
const path = require("path");

/**
 * Opens a database client for every project database found under
 * `allProjectsPath` and migrates its schema.
 *
 * A single bad entry - a stray file such as .DS_Store sitting next to the
 * project folders, an unreadable directory, a database that fails to open -
 * is logged and skipped instead of aborting server start-up and taking every
 * other project down with it.
 */
function loadProjectDbClients(allProjectsPath, { createClient, migrateProjectDb, clients, logger = global.logger }) {
    let entries;
    try {
        entries = fs.readdirSync(allProjectsPath);
    } catch (err) {
        logger.error(`Unable to list projects in ${allProjectsPath}: ${err.message}`);
        return 0;
    }

    let loaded = 0;

    for (const project of entries) {
        const projectPath = path.join(allProjectsPath, project);

        let files;
        try {
            if (!fs.statSync(projectPath).isDirectory()) {
                logger.debug(`Skipping '${project}': not a project directory.`);
                continue;
            }
            files = fs.readdirSync(projectPath);
        } catch (err) {
            logger.error(`Skipping project at ${projectPath}: ${err.message}`);
            continue;
        }

        for (const file of files) {
            if (!file.endsWith(".db")) {
                continue;
            }

            try {
                clients[projectPath] = createClient(path.join(projectPath, file));
                loaded++;

                Promise.resolve(migrateProjectDb(projectPath)).catch((err) => {
                    // Every statement in migrateProjectDb is DDL (even a no-op
                    // CREATE TABLE IF NOT EXISTS), so SQLite opens the file for
                    // write regardless of whether a change is actually needed.
                    // A read-only project database - by design, or a permissions
                    // quirk of wherever it's deployed - can't be migrated, but
                    // that's expected and not a failure worth an error-level log
                    // on every server start.
                    if (err && err.error && err.error.code === "SQLITE_READONLY") {
                        logger.warn(`Project database at ${projectPath} is read-only; skipping schema migration.`);
                        return;
                    }

                    logger.error(`Failed to migrate project database at ${projectPath}: ${err}`);
                });
            } catch (err) {
                logger.error(`Failed to open project database ${file} in ${projectPath}: ${err.message}`);
            }
        }
    }

    return loaded;
}

module.exports = loadProjectDbClients;
