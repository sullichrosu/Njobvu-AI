const queries = require("../../queries/queries");

async function deleteImagesWithoutLabel(req, res) {
    try {
        global.logger.debug(req.body);
        let projectName = req.body.PName,
            admin = req.body.Admin,
            user = req.cookies.Username,
            projectIndex = req.body.IDX;

        let publicPath = currentPath,
            mainPath = publicPath + "public/projects/",
            projectPath = mainPath + admin + "-" + projectName;

        await queries.project.sql(
            projectPath,
            "DELETE FROM Images WHERE IName NOT IN (SELECT IName FROM Labels)",
        );

        return res.redirect(`/project?IDX=${projectIndex}`);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error deleting images");
    }
}

module.exports = deleteImagesWithoutLabel;
