const path = require("path");
const queries = require("../../queries/queries");


async function updateReviewImageApi(req, res) {
    try {
        const user = req.cookies.Username;
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: Username cookie required",
            });
        }

        const PName = req.body.PName;
        const admin = req.body.Admin;
        const IName = req.body.IName;
        const reviewImage = req.body.reviewImage;

        if (!PName || !admin || !IName || reviewImage === undefined) {
            return res.status(400).json({
                success: false,
                error: "PName, Admin, IName, and reviewImage are required",
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

        await queries.project.updateReviewImage(projectPath, Number(reviewImage) ? 1 : 0, IName);

        return res.status(200).json({
            success: true,
            IName,
            reviewImage: Number(reviewImage) ? 1 : 0,
        });
    } catch (err) {
        global.logger.error("Error in updateReviewImageApi: " + err);
        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error",
        });
    }
}

module.exports = updateReviewImageApi;
