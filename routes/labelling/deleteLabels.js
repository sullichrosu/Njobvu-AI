const queries = require("../../queries/queries");
const path = require("path");

async function deleteLabels(req, res) {
    try {
        const admin = req.params.Admin;
        const PName = req.params.PName;
        const Lid = req.params.Lid.split(",");

        global.logger.debug("admin: ", admin);
        global.logger.debug("Lid", Lid);

        var publicPath = currentPath,
            mainPath = publicPath + "public/projects/",
            projectPath = mainPath + admin + "-" + PName;

        global.logger.debug("ProjectPath", projectPath);

        const placeholders = Lid.map(() => "?").join(",");
        const sql = `DELETE FROM Labels WHERE LID IN (${placeholders})`;
        const result = await queries.project.sql(projectPath, sql, Lid);

        // await queries.project.sql(projectPath, sql);

        if (result.changes === 0) {
            console.warn("No labels were updated - check if the labels exist and match the criteria");
            return res.json({
                message: "No labels were updated - labels may not exist or already have the target class",
                labelsAffected: 0,
                body: req.body,
            });
        }

        return res.status(200).json({
            message: "Deleted labels",
            labelsAffected: result.changes,
            body: req.body,
        });
    } catch (error) {
        global.logger.error(error);
        if (!res.headersSent) {
            res.status(500).json({ message: error.message });
        }
    }
}

module.exports = deleteLabels;
