const fs = require("fs");
const path = require("path");
const queries = require("../../queries/queries");

async function downloadClasses(req, res) {
    var PName = req.body ? req.body.PName : undefined;
    var admin = req.body ? req.body.Admin : undefined;
    var username = (req.cookies && req.cookies.Username) ? req.cookies.Username : (req.body ? (req.body.Username || admin || "user") : "user");

    var publicPath = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd()),
        mainPath = path.join(publicPath, "public", "projects"),
        projectPath = path.join(mainPath, (admin ? admin + "-" : "") + PName);

    if (!fs.existsSync(projectPath) && fs.existsSync(mainPath)) {
        const dirs = fs.readdirSync(mainPath);
        const match = dirs.find((d) => d.endsWith("-" + PName) || d === PName);
        if (match) {
            projectPath = path.join(mainPath, match);
        }
    }

    var downloadPath = path.join(mainPath, username + "_Downloads");

    if (!fs.existsSync(downloadPath)) {
        try {
            fs.mkdirSync(downloadPath, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating download directory:", err);
        }
    }

    let existingClasses;
    try {
        existingClasses = await queries.project.getAllClasses(projectPath);
    } catch (err) {
        if (global.logger) global.logger.error(err);
        return res
            .status(500)
            .json({ success: false, message: "Error fetching classes" });
    }

    if (!existingClasses || !existingClasses.rows || !existingClasses.rows.length) {
        return res.json({
            success: false,
            message: "No classes found for this project",
        });
    }

    var classList =
        existingClasses.rows.map((row) => row.CName).join("\n") + "\n";
    var classListFile = `${PName}_ClassList.txt`;
    var classListPath = path.join(downloadPath, classListFile);

    try {
        fs.writeFileSync(classListPath, classList);
    } catch (err) {
        if (global.logger) global.logger.error(err);
        return res
            .status(500)
            .json({ success: false, message: "Error writing class list" });
    }

    return res.download(classListPath);
}

module.exports = downloadClasses;
