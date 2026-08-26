const path = require("path");
const queries = require("../../queries/queries");


async function getFrameData(req, res) {
    try {
        const user = req.cookies.Username || req.query.username || req.query.user;
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: Username cookie required",
            });
        }

        const PName = req.query.PName;
        const admin = req.query.Admin || req.query.admin;
        const IName = req.query.IName;

        if (!PName || !admin || !IName) {
            return res.status(400).json({
                success: false,
                error: "PName, Admin, and IName are required",
            });
        }

        let accessRows = [];
        if (global.managedDbClient && global.managedDbClient.all) {
            const dbRes = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
            accessRows = (dbRes && dbRes.rows) ? dbRes.rows : (Array.isArray(dbRes) ? dbRes : []);
        }

        const hasAccess = accessRows.some((row) => row.PName === PName && row.Admin === admin);
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: "Forbidden: You do not have access to this project",
            });
        }

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        const projectPath = path.join(publicPath, "public", "projects", admin + "-" + PName);
        const relImagePath = "projects/" + admin + "-" + PName + "/images/" + IName;

        const imageResult = await queries.project.getImage(projectPath, IName);
        if (!imageResult || !imageResult.row) {
            return res.status(404).json({
                success: false,
                error: "Image not found",
            });
        }

        const labelsResult = await queries.project.getLabelsForImageName(projectPath, IName);

        return res.status(200).json({
            success: true,
            IName,
            imagePath: relImagePath,
            reviewImage: imageResult.row.reviewImage,
            labels: labelsResult.rows || [],
        });
    } catch (err) {
        global.logger.error("Error in getFrameData: " + err);
        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error",
        });
    }
}

module.exports = getFrameData;
