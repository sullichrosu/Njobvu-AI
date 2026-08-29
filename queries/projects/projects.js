const client = require("../client");
const getDbClient = require("../getDbClient");

module.exports = {
    managed: {
        updateProjectName: async function (newName, projectName, admin) {
            await global.managedDbClient.run("BEGIN TRANSACTION", []);

            try {
                const projectsQuery =
                    "UPDATE Projects SET PName = ? WHERE PName = ? AND Admin = ?";
                const result = await global.managedDbClient.run(projectsQuery, [
                    newName,
                    projectName,
                    admin,
                ]);

                const accessQuery =
                    "UPDATE Access SET PName = ? WHERE PName = ? AND Admin = ?";
                await global.managedDbClient.run(accessQuery, [
                    newName,
                    projectName,
                    admin,
                ]);

                const s3Query =
                    "UPDATE S3Buckets SET PName = ? WHERE PName = ? AND Admin = ?";
                await global.managedDbClient.run(s3Query, [
                    newName,
                    projectName,
                    admin,
                ]);

                await global.managedDbClient.run("COMMIT", []);

                return result;
            } catch (err) {
                await global.managedDbClient
                    .run("ROLLBACK", [])
                    .catch(() => {});
                throw err;
            }
        },
        deleteProject: async function(projectName, username) {
            const query = "DELETE FROM Projects WHERE PName = ? AND Admin = ?";
            const result = await global.managedDbClient.run(query, [
                projectName,
                username,
            ]);

            return result;
        },
        createProject: async function(
            projectName,
            projectDescription,
            autoSave,
            username,
        ) {
            const query =
                "INSERT INTO Projects (PName, PDescription, AutoSave, Admin) VALUES (?, ?, ?, ?)";
            const result = await global.managedDbClient.run(query, [
                projectName,
                projectDescription,
                autoSave,
                username,
            ]);

            return result;
        },
        updateAllProjectsForAdmin: async function(oldUsername, newUsername) {
            const query = "UPDATE Projects SET Admin = ? WHERE Admin = ?";
            const result = await global.managedDbClient.run(query, [
                oldUsername,
                newUsername,
            ]);

            return result;
        },
        deleteAllProjectsForAdmin: async function(username) {
            const query = "DELETE FROM Projects WHERE Admin = ?";
            const result = await global.managedDbClient.run(query, [username]);

            return result;
        },
        filterProjects: function(projectList, options = {}) {
            const {
                search = "",
                admin = "",
                needsReview = "all",
                sortBy = "name",
                sortOrder = "asc"
            } = options;

            let filtered = [...projectList];

            if (search && search.trim() !== "") {
                const query = search.trim().toLowerCase();
                filtered = filtered.filter(item => {
                    const proj = Array.isArray(item) ? item[0] : item;
                    if (!proj) return false;
                    const pName = (proj.PName || "").toLowerCase();
                    const pAdmin = (proj.Admin || "").toLowerCase();
                    return pName.includes(query) || pAdmin.includes(query);
                });
            }

            if (admin && admin.trim() !== "") {
                const adminQuery = admin.trim().toLowerCase();
                filtered = filtered.filter(item => {
                    const proj = Array.isArray(item) ? item[0] : item;
                    if (!proj) return false;
                    return (proj.Admin || "").toLowerCase().includes(adminQuery);
                });
            }

            if (needsReview === "true" || needsReview === "1" || needsReview === 1 || needsReview === "needsReview" || needsReview === "Needs Review Only") {
                filtered = filtered.filter(item => {
                    const hasReview = Array.isArray(item) ? item[2] : (item.needsReview !== undefined ? item.needsReview : item.review);
                    return Number(hasReview) > 0;
                });
            } else if (needsReview === "false" || needsReview === "0" || needsReview === 0 || needsReview === "noReview" || needsReview === "No Review Needed") {
                filtered = filtered.filter(item => {
                    const hasReview = Array.isArray(item) ? item[2] : (item.needsReview !== undefined ? item.needsReview : item.review);
                    return Number(hasReview) === 0;
                });
            }

            const isDesc = String(sortOrder).toLowerCase() === "desc" ? -1 : 1;
            filtered.sort((a, b) => {
                let valA, valB;
                if (Array.isArray(a)) {
                    switch (sortBy) {
                        case "admin":
                            valA = (a[0] && a[0].Admin ? a[0].Admin : "").toLowerCase();
                            valB = (b[0] && b[0].Admin ? b[0].Admin : "").toLowerCase();
                            break;
                        case "numImages":
                            valA = Number(a[3]) || 0;
                            valB = Number(b[3]) || 0;
                            break;
                        case "numLabels":
                            valA = Number(a[5]) || 0;
                            valB = Number(b[5]) || 0;
                            break;
                        case "percentLabeled":
                        case "percent":
                            valA = Number(a[4]) || 0;
                            valB = Number(b[4]) || 0;
                            break;
                        case "name":
                        default:
                            valA = (a[0] && a[0].PName ? a[0].PName : "").toLowerCase();
                            valB = (b[0] && b[0].PName ? b[0].PName : "").toLowerCase();
                            break;
                    }
                } else {
                    switch (sortBy) {
                        case "admin":
                            valA = (a && a.Admin ? a.Admin : "").toLowerCase();
                            valB = (b && b.Admin ? b.Admin : "").toLowerCase();
                            break;
                        case "numImages":
                            valA = Number(a.numImages) || 0;
                            valB = Number(b.numImages) || 0;
                            break;
                        case "numLabels":
                            valA = Number(a.numLabels) || 0;
                            valB = Number(b.numLabels) || 0;
                            break;
                        case "percentLabeled":
                        case "percent":
                            valA = Number(a.percentLabeled) || 0;
                            valB = Number(b.percentLabeled) || 0;
                            break;
                        case "name":
                        default:
                            valA = (a && a.PName ? a.PName : "").toLowerCase();
                            valB = (b && b.PName ? b.PName : "").toLowerCase();
                            break;
                    }
                }

                if (typeof valA === "string") {
                    return valA.localeCompare(valB) * isDesc;
                }
                return (valA - valB) * isDesc;
            });

            return filtered;
        },
    },
    project: {
        checkTableExists: async function(projectPath, tableName) {
            const db = getDbClient(projectPath);
            const query = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?";
            const result = await db.get(query, [tableName]);
            return { rows: [result] };
        },
        migrateProjectDb: async function(projectPath) {
            const db = getDbClient(projectPath);
            await db.run(
                "CREATE TABLE IF NOT EXISTS Classes (CName VARCHAR NOT NULL PRIMARY KEY)",
            );
            await db.run(
                "CREATE TABLE IF NOT EXISTS Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0, validateImage INTEGER NOT NULL DEFAULT 0, Source VARCHAR DEFAULT NULL, SourceKey VARCHAR DEFAULT NULL)",
            );
            await db.run(
                "CREATE TABLE IF NOT EXISTS Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X VARCHAR NOT NULL, Y VARCHAR NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName))",
            );
            await db.run(
                "CREATE TABLE IF NOT EXISTS Validation (Confidence INTEGER NOT NULL, LID INTEGER NOT NULL PRIMARY KEY, CName VARCHAR NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(LID) REFERENCES Labels(LID), FOREIGN KEY(IName) REFERENCES Images(IName), FOREIGN KEY(CName) REFERENCES Classes(CName))",
            );

            // Images predates the reviewImage/validateImage/Source/SourceKey columns, so
            // CREATE TABLE IF NOT EXISTS above is a no-op on any project database created
            // before this change. Back-fill them here, guarded by a PRAGMA check since
            // SQLite has no ADD COLUMN IF NOT EXISTS. SourceKey holds the literal S3 object
            // key (which may differ from IName once collisions are disambiguated), decoupled
            // from the display name.
            const imageColumnsResult = await db.all("PRAGMA table_info(Images)");
            const imageColumns = Array.isArray(imageColumnsResult)
                ? imageColumnsResult
                : (imageColumnsResult && imageColumnsResult.rows) || [];
            const existingColumnNames = new Set(
                imageColumns.map((column) => column.name),
            );

            const backfillColumns = [
                { name: "reviewImage", ddl: "reviewImage INTEGER NOT NULL DEFAULT 0" },
                { name: "validateImage", ddl: "validateImage INTEGER NOT NULL DEFAULT 0" },
                { name: "Source", ddl: "Source VARCHAR DEFAULT NULL" },
                { name: "SourceKey", ddl: "SourceKey VARCHAR DEFAULT NULL" },
            ];

            for (const column of backfillColumns) {
                if (!existingColumnNames.has(column.name)) {
                    await db.run(`ALTER TABLE Images ADD COLUMN ${column.ddl}`);
                }
            }
        },
        addImages: async function(
            projectPath,
            imageName,
            reviewImage,
            validateImage,
            source = null,
            sourceKey = null,
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT OR IGNORE INTO Images (IName, reviewImage, validateImage, Source, SourceKey) VALUES (?, ?, ?, ?, ?)";
            const results = await db.run(query, [
                imageName,
                reviewImage,
                validateImage,
                source,
                sourceKey,
            ]);

            return results;
        },
    },
};