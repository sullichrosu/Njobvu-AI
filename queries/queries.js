const access = require("./access/access");
const user = require("./user/user");
const projects = require("./projects/projects");
const classes = require("./classes/classes");
const images = require("./images/images");
const labelling = require("./labelling/labelling");
const validation = require("./validation/validation");
const getDbClient = require("./getDbClient");

module.exports = {
    managed: {
        ...user.managed,
        ...access.managed,
        ...projects.managed,
        sql: async function (sql, params) {
            try {
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
                const result = await db.run(sql, params);

                return result;
            } catch (err) {
                return err;
            }
        },
    },
};
