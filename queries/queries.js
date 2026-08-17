const access = require("./access/access");
const user = require("./user/user");
const projects = require("./projects/projects");
const classes = require("./classes/classes");
const images = require("./images/images");
const labelling = require("./labelling/labelling");
const validation = require("./validation/validation");
const s3 = require("./s3/s3");
const getDbClient = require("./getDbClient");

module.exports = {
    managed: {
        ...user.managed,
        ...access.managed,
        ...projects.managed,
        ...s3.managed,
        sql: async function (sql, params) {
            try {
                const trimmed = (sql || "").trim().toUpperCase();
                if (trimmed.startsWith("SELECT")) {
                    if (global.managedDbClient && typeof global.managedDbClient.get === "function") {
                        const getRes = await global.managedDbClient.get(sql, params);
                        if (getRes && (getRes.row !== undefined || getRes.rows !== undefined)) {
                            return getRes;
                        }
                    }
                    if (global.managedDbClient && typeof global.managedDbClient.all === "function") {
                        const allRes = await global.managedDbClient.all(sql, params);
                        if (allRes) {
                            return allRes;
                        }
                    }
                }
                const result = await global.managedDbClient.run(sql, params);
                return result;
            } catch (err) {
                return err;
            }
        },
    },
    project: {
        ...projects.project,
        ...classes.project,
        ...images.project,
        ...labelling.project,
        ...validation.project,
        sql: async function (projectPath, sql, params) {
            try {
                const db = getDbClient(projectPath);
                const trimmed = (sql || "").trim().toUpperCase();
                if (trimmed.startsWith("SELECT")) {
                    if (typeof db.all === "function") {
                        const rows = await db.all(sql, params);
                        return { rows: Array.isArray(rows) ? rows : (rows && rows.rows ? rows.rows : []) };
                    } else if (typeof db.get === "function") {
                        const row = await db.get(sql, params);
                        return { row: row && row.row ? row.row : row, rows: [row] };
                    }
                }
                const result = await db.run(sql, params);
                return result;
            } catch (err) {
                return err;
            }
        },
    },
};
