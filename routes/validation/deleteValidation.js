const queries = require("../../queries/queries");

async function deleteLabelValidation(req, res) {
    var IDX = parseInt(req.body.IDX),
        PName = req.body.PName,
        admin = req.body.Admin,
        user = req.cookies.Username,
        labels = req.body.LabelArray;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName;

    labels = labels.split(",");

    for (const label of labels) {
        await queries.project.sql(
            projectPath,
            "DELETE FROM Labels WHERE LID = ?",
            [label],
        );
        await queries.project.sql(
            projectPath,
            "DELETE FROM Validation WHERE LID = ?",
            [label],
        );
    }
}

module.exports = deleteLabelValidation;

