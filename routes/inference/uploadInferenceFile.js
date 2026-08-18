const path = require("path");
const fs = require("fs");
const unzipFile = require("../../utils/unzipFile");

async function uploadInferenceFile(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies && req.cookies.Username,
        inferenceFile = req.files && req.files.upload_inference;

    if (!inferenceFile) {
        return res.status(400).send({ Success: "ERROR: No file uploaded" });
    }

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + Admin + "-" + PName,
        inferencePath = projectPath + "/inference/",
        inferenceUploadPath = inferencePath + "/uploads/",
        inferenceFilePath = inferenceUploadPath + inferenceFile.name;

    const validFileNames = ["png", "tif", "jpg", "jpeg", "gif", "mp4", "mov", "zip", "7z"];
    const ext = (inferenceFile.name.split(".").pop() || "").toLowerCase();

    if (!validFileNames.includes(ext)) {
        res.send({
            Success:
                "ERROR: Wrong filetype. Must be type .png, .jpg, .jpeg, .tif, .gif, .mp4, .mov, .zip, or .7z",
        });
    } else {
        if (!fs.existsSync(inferencePath)) {
            fs.mkdirSync(inferencePath, { recursive: true });
        }

        if (!fs.existsSync(inferenceUploadPath)) {
            fs.mkdirSync(inferenceUploadPath, { recursive: true });
        }

        if (inferenceFile && typeof inferenceFile.mv === "function") {
            await new Promise((resolve, reject) => {
                try {
                    const ret = inferenceFile.mv(inferenceFilePath, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                    if (ret && typeof ret.then === "function") {
                        ret.then(resolve).catch(reject);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }

        let extractedPath = null;
        if (ext === "zip" || ext === "7z") {
            const folderName = path.parse(inferenceFile.name).name;
            const outputDir = path.join(inferenceUploadPath, folderName);
            try {
                await unzipFile(inferenceFilePath, outputDir);
                extractedPath = outputDir;
            } catch (err) {
                if (global.logger) {
                    global.logger.error(err);
                }
            }
        }

        res.send({
            Success: "Your inference file has been uploaded and saved",
            filename: inferenceFile.name,
            extractedPath,
        });
    }
}

module.exports = uploadInferenceFile;
