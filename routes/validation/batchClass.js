const queries = require("../../queries/queries");

async function batchChangeClass(req, res) {
    var projectName = req.body.PName,
        admin = req.body.Admin,
        class1 = req.body.class1,
        class2 = req.body.class2;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + admin + "-" + projectName; // $LABELING_TOOL_PATH/public/projects/project_name

    try {
        await queries.project.sql(
            projectPath,
            "UPDATE Labels SET CName = ? WHERE CName = ?",
            [class2, class1],
        );
        await queries.project.sql(
            projectPath,
            "UPDATE Validation SET CName = ? WHERE CName = ?",
            [class2, class1],
        );
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error batching classes");
    }

    res.send({ Success: "Yes" });
}

module.exports = batchChangeClass;
