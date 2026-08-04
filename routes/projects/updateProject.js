const queries = require("../../queries/queries");

async function updateProject(req, res) {
    var admin;
    admin = req.body.Admin;
    const { PName, IDX, project_name, project_description } = req.body;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName;

    var db = new sqlite3.Database(projectPath + "/" + PName + ".db", (err) => {
        global.logger.debug(db);
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to db.")
    });

    try {
        await queries.managed.updateProjectName(project_name, PName, admin);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error transferring admin");
    }
}

module.exports = updateProject;
