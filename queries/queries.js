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
        sql: async function(sql, params) {
            const trimmed = (sql || "").trim().toUpperCase();

            let result;
            if (trimmed.startsWith("SELECT")) {
                if (global.managedDbClient && typeof global.managedDbClient.all === "function") {
                    result = await global.managedDbClient.all(sql, params);
                }

                if ((!result || !result.rows || result.rows.length === 0) && global.managedDbClient && typeof global.managedDbClient.get === "function") {
                    const getRes = await global.managedDbClient.get(sql, params);
                    if (getRes && (getRes.row !== undefined || getRes.rows !== undefined)) {
                        result = getRes;
                    }
                }

                if (result) {
                    if (result.row !== undefined && result.rows === undefined) {
                        result.rows = result.row ? [result.row] : [];
                    } else if (result.rows !== undefined && result.row === undefined) {
                        result.row = (result.rows && result.rows.length > 0) ? result.rows[0] : null;
                    }
                }
            } else {
                result = await global.managedDbClient.run(sql, params);
            }

            if (result && result.error) {
                throw result.error instanceof Error ? result.error : new Error(result.error);
            }

            return result;
        },
    },
    project: {
        ...projects.project,
        ...classes.project,
        ...images.project,
        ...labelling.project,
        ...validation.project,
        sql: async function(projectPath, sql, params) {
            const db = getDbClient(projectPath);
            const trimmed = (sql || "").trim().toUpperCase();

            const result = trimmed.startsWith("SELECT")
                ? await db.all(sql, params)
                : await db.run(sql, params);

            if (result && result.error) {
                throw result.error instanceof Error ? result.error : new Error(result.error);
            }

            return result;
        },
    },
};
