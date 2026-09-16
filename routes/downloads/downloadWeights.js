const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

async function downloadWeights(req, res) {
    var PName = req.body ? req.body.PName : undefined,
        admin = req.body ? req.body.Admin : undefined,
        IDX = parseInt(req.body ? req.body.IDX : 0),
        user = (req.cookies && req.cookies.Username) ? req.cookies.Username : (req.body ? (req.body.Username || admin || "user") : "user");

    var weightsArr = [];
    if (req.body && req.body["weights[]"]) {
        weightsArr.push(req.body["weights[]"]);
    }
    var weights = [];
    weights = weights.concat.apply(weights, weightsArr).filter(Boolean);

    var publicPath = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd()),
        mainPath = path.join(publicPath, "public", "projects"),
        projectPath = path.join(mainPath, (admin ? admin + "-" : "") + PName),
        downloadsPath = path.join(mainPath, user + "_Downloads"),
        trainingPath = path.join(projectPath, "training"),
        weightsPath = path.join(trainingPath, "weights");

    if (!fs.existsSync(downloadsPath)) {
        try {
            fs.mkdirSync(downloadsPath, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating download directory:", err);
        }
    }

    var zipFilePath = path.join(downloadsPath, "weights.zip");
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

    for (var i = 0; i < weights.length; i++) {
        var weightsFile = path.join(weightsPath, weights[i]);
        if (fs.existsSync(weightsFile)) {
            archive.file(weightsFile, { name: weights[i] });
        }
    }

    archive.finalize();
}

module.exports = downloadWeights;
