const path = require("path");
const queries = require("../../queries/queries");

async function deleteClass(req, res) {
    var IDX = parseInt(req.body.IDX),
        PName = req.body.PName,
        admin = req.body.Admin,
        user = req.cookies.Username,
        classes = req.body["classArray[]"];

    var publicPath = __dirname.replace("routes", "").replace("training", ""),
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName;

    projectPath = path.normalize(projectPath);

    if (!Array.isArray(classes)) {
        classes = classes.split(",");
    }

    for (var i = 0; i < classes.length; i++) {
        let deleteLabels = `DELETE FROM Labels WHERE CName = ?`;
        let deleteClasses = `DELETE FROM Classes WHERE CName = ?`;
        let deleteValid = `DELETE FROM Validation WHERE CName = ?`;

        try {
            await queries.project.sql(projectPath, deleteLabels, [classes[i]]);
            await queries.project.sql(projectPath, deleteClasses, [classes[i]]);
            await queries.project.sql(projectPath, deleteValid, [classes[i]]);
        } catch (err) {
            global.logger.error(err);
            continue;
        }
    }

    return res.redirect("/config?IDX=" + IDX);
}

module.exports = deleteClass;
