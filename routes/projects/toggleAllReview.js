const path = require("path");
const queries = require("../../queries/queries");

async function toggleAllReview(req, res) {
    const PName = req.body.PName;
    const admin = req.body.Admin;
    const targetState = req.body.state;

    if (!PName || !admin) {
        return res.status(400).send({ Success: "No", error: "Missing required fields" });
    }

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const mainPath = path.join(publicPath, "public", "projects");
    const projectPath = path.join(mainPath, admin + "-" + PName);

    try {
        let newState = 1;
        if (targetState !== undefined && targetState !== null && targetState !== "") {
            newState = Number(targetState);
        } else {
            const countRes = await queries.project.sql(
                projectPath,
                "SELECT COUNT(*) as count FROM Images WHERE reviewImage = 0"
            );
            let unreviewedCount = 0;
            if (countRes && countRes.rows && countRes.rows.length > 0) {
                unreviewedCount = countRes.rows[0].count !== undefined ? countRes.rows[0].count : (countRes.rows[0]["COUNT(*)"] || 0);
            } else if (Array.isArray(countRes) && countRes.length > 0) {
                unreviewedCount = countRes[0].count !== undefined ? countRes[0].count : (countRes[0]["COUNT(*)"] || 0);
            }
            newState = unreviewedCount > 0 ? 1 : 0;
        }

        await queries.project.sql(
            projectPath,
            "UPDATE Images SET reviewImage = ?",
            [newState]
        );

        return res.send({ Success: "Yes", newState: newState });
    } catch (err) {
        if (global.logger) global.logger.error("Error toggling all review state:", err);
        return res.status(500).send({ Success: "No", error: err.message });
    }
}

module.exports = toggleAllReview;
