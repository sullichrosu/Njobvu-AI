const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const queries = require("../../queries/queries");

async function downloadProject(req, res) {
    var PName = req.body ? req.body.PName : undefined;
    var admin = req.body ? req.body.Admin : undefined;
    var username = (req.cookies && req.cookies.Username) ? req.cookies.Username : (req.body ? (req.body.Username || admin || "user") : "user");

    if (!PName) {
        return res.status(400).json({ success: false, message: "Project name is required" });
    }

    var publicPath = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd());
    var mainPath = path.join(publicPath, "public", "projects");
    var projectPath = path.join(mainPath, (admin ? admin + "-" : "") + PName);

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

    let tableExists;

    try {
        tableExists = await queries.project.checkTableExists(projectPath, 'Labels');
    } catch (err) {
        if (global.logger) global.logger.debug("Error checking table existence:", err);
        return res.json({ success: false, message: "Database error occurred" });
    }

    if (!tableExists || !tableExists.rows || !tableExists.rows[0] || tableExists.rows[0].count == 0) {
        return res.json({ success: false, message: "No Labels table found" });
    } else {
        var zipFilePath = path.join(downloadPath, PName + ".zip");
        var output = fs.createWriteStream(zipFilePath);
        var archive = archiver("zip");

        output.on("close", function() {
            return res.download(zipFilePath, (err) => {
                if (err) {
                    if (global.logger) global.logger.debug("Download error:", err);
                    if (!res.headersSent) {
                        return res.json({ success: false, message: "Download failed" });
                    }
                }
            });
        });

        output.on("error", function(err) {
            if (global.logger) global.logger.error("WriteStream error:", err);
            if (!res.headersSent) {
                return res.json({ success: false, message: "Archive creation failed" });
            }
        });

        archive.on("error", function(err) {
            if (global.logger) global.logger.error("Archive error:", err);
            if (!res.headersSent) {
                return res.json({ success: false, message: "Archive creation failed" });
            }
        });

        archive.pipe(output);
        archive.directory(projectPath, false);
        archive.finalize();
    }
}

module.exports = downloadProject;
