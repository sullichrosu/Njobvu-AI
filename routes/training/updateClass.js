const queries = require("../../queries/queries");
const path = require("path");

async function updateClass(req, res) {
    const className = req.body.currentClassName;
    const updateClassName = req.body.updatedValue;

    var IDX = parseInt(req.body.IDX),
        PName = req.body.PName,
        admin = req.body.Admin,
        user = req.cookies.Username;

    var publicPath = __dirname.replace("routes", "").replace("training", ""),
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + user + "-" + PName;

    projectPath = path.normalize(projectPath);

    const updateLabels = `UPDATE Labels SET CName = ? WHERE CName = ?`;
    const updateValidation = `UPDATE Validation SET CName = ? WHERE CName = ?`;
    const updateClasses = `UPDATE Classes SET CName = ? WHERE CName = ?`;

    try {
        await queries.project.sql(projectPath, updateLabels, [
            updateClassName,
            className,
        ]);

        await queries.project.sql(projectPath, updateValidation, [
            updateClassName,
            className,
        ]);

        await queries.project.sql(projectPath, updateClasses, [
            updateClassName,
            className,
        ]);

        return res.status(200).send("Success");
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating labels");
    }
}

module.exports = updateClass;
