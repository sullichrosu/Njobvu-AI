const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

async function downloadScript(req, res) {
    var PName = req.body ? req.body.PName : undefined,
        admin = req.body ? req.body.Admin : undefined,
        IDX = parseInt(req.body ? req.body.IDX : 0),
        user = (req.cookies && req.cookies.Username) ? req.cookies.Username : (req.body ? (req.body.Username || admin || "user") : "user");

    var scriptsArr = [];
    if (req.body && req.body["scripts[]"]) {
        scriptsArr.push(req.body["scripts[]"]);
    }

    var scripts = [];
    scripts = scripts.concat.apply(scripts, scriptsArr).filter(Boolean);

    var publicPath = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd()),
        mainPath = path.join(publicPath, "public", "projects"),
        projectPath = path.join(mainPath, (admin ? admin + "-" : "") + PName),
        imagesPath = path.join(projectPath, "images"),
        downloadsPath = path.join(mainPath, user + "_Downloads"),
        trainingPath = path.join(projectPath, "training"),
        pythonPath = path.join(trainingPath, "python"),
        logsPath = path.join(trainingPath, "logs");

    if (!fs.existsSync(downloadsPath)) {
        try {
            fs.mkdirSync(downloadsPath, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating download directory:", err);
        }
    }

    var zipFilePath = path.join(downloadsPath, "scripts.zip");
    var output = fs.createWriteStream(zipFilePath);
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
    for (var i = 0; i < scripts.length; i++) {
        let script = path.join(pythonPath, scripts[i]);
        if (fs.existsSync(script)) {
            archive.file(script, { name: scripts[i] });
        }
    }
    archive.finalize();
}

module.exports = downloadScript;
