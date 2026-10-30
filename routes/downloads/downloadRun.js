const fs = require("fs");
const path = require("path");

async function downloadRun(req, res) {
    var PName = req.body ? req.body.PName : undefined,
        Admin = req.body ? req.body.Admin : undefined,
        IDX = req.body ? req.body.IDX : undefined,
        weights = req.body ? req.body.weights : undefined,
        user = (req.cookies && req.cookies.Username) ? req.cookies.Username : (req.body ? (req.body.Username || Admin || "user") : "user"),
        logFile = req.body ? req.body.log_file : undefined,
        runPath = req.body ? req.body.run_path : undefined;

    var publicPath = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd()),
        mainPath = path.join(publicPath, "public", "projects"),
        projectPath = path.join(mainPath, (Admin ? Admin + "-" : "") + PName),
        imagesPath = path.join(projectPath, "images"),
        downloadsPath = path.join(mainPath, user + "_Downloads"),
        trainingPath = path.join(projectPath, "training"),
        logsPath = path.join(trainingPath, "logs");

    if (!fs.existsSync(downloadsPath)) {
        try {
            fs.mkdirSync(downloadsPath, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating download directory:", err);
        }
    }

    var baseFileName = (logFile && logFile.length > 4) ? logFile.substring(0, logFile.length - 4) : "run";
    var zipFilePath = path.join(downloadsPath, baseFileName + ".zip");

    var output = fs.createWriteStream(zipFilePath);
    const archiver = require("archiver");
    var archive = archiver("zip");

    output.on("close", function () {
        res.download(zipFilePath);
    });
    archive.on("error", function (err) {
        if (global.logger) global.logger.error("Archive error:", err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Download failed" });
        }
    });

    archive.pipe(output);

    if (runPath && fs.existsSync(runPath)) {
        var logs = fs.readdirSync(runPath);
        for (var i = 0; i < logs.length; i++) {
            archive.file(path.join(runPath, logs[i]), { name: logs[i] });
        }
    }

    archive.finalize();
}

module.exports = downloadRun;
