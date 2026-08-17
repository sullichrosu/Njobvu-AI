const fs = require("fs");
const path = require("path");
const queries = require("../../queries/queries");
const { Client } = require("../../queries/client");

async function updateProject(req, res) {
    const { PName, IDX, project_name, Admin } = req.body;
    const admin = Admin;

    if (!PName || !project_name || !admin) {
        return res.status(400).send("Missing required fields");
    }

    const newName = project_name.trim();

    if (!newName) {
        return res.status(400).send("Project name cannot be empty");
    }

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        oldProjectPath = mainPath + admin + "-" + PName,
        newProjectPath = mainPath + admin + "-" + newName;

    const isRename = newName !== PName;

    if (isRename && fs.existsSync(newProjectPath)) {
        return res.status(409).send("A project with that name already exists");
    }

    try {
        await queries.managed.updateProjectName(newName, PName, admin);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating project");
    }

    if (isRename) {
        try {
            if (global.projectDbClients && global.projectDbClients[oldProjectPath]) {
                const oldClient = global.projectDbClients[oldProjectPath];
                if (oldClient.close) oldClient.close();
                delete global.projectDbClients[oldProjectPath];
            }

            fs.renameSync(oldProjectPath, newProjectPath);

            const oldDbFile = path.join(newProjectPath, PName + ".db");
            const newDbFile = path.join(newProjectPath, newName + ".db");

            if (fs.existsSync(oldDbFile)) {
                fs.renameSync(oldDbFile, newDbFile);
            }

            if (global.projectDbClients) {
                global.projectDbClients[newProjectPath] = new Client(newDbFile);
            }
        } catch (err) {
            global.logger.error(err);

            await queries.managed
                .updateProjectName(PName, newName, admin)
                .catch((rollbackErr) => global.logger.error(rollbackErr));

            return res.status(500).send("Error renaming project files on disk");
        }
    }

    return res.redirect("/home");
}

module.exports = updateProject;
