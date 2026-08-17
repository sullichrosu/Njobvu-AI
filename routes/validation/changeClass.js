const queries = require("../../queries/queries");

async function soloChangeClass(req, res) {
    var LID = parseInt(req.body.LID),
        selectedClass = req.body.selectedClass,
        projectName = req.body.PName,
        admin = req.body.Admin;

    var publicPath = __dirname.replace("routes", ""),
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + admin + "-" + projectName; // $LABELING_TOOL_PATH/public/projects/project_name

    try {
        await queries.project.sql(
            projectPath,
            "UPDATE Labels SET CName = ? WHERE LID = ?",
            [selectedClass, LID],
        );
        await queries.project.sql(
            projectPath,
            "UPDATE Validation SET CName = ? WHERE LID = ?",
            [selectedClass, LID],
        );
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error switching class");
    }

    res.send({ Success: "Yes" });
}

module.exports = soloChangeClass;

