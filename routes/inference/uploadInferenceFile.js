const fs = require("fs");

async function uploadInferenceFile(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        inferenceFile = req.files.upload_inference;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        trainingPath = projectPath + "/training",
        inferencePath = projectPath + "/inference/",
        inferenceUploadPath = inferencePath + "/uploads/",
        inferenceFilePath = inferenceUploadPath + inferenceFile.name;

    const validFileNames = ["png", "tif", "jpg", "jpeg", "gif", "mp4", "mov", "zip"];
    const fileExt = (inferenceFile.name.split(".").pop() || "").toLowerCase();

    if (!validFileNames.includes(fileExt)) {
        res.send({
            Success:
                "ERROR: Wrong filetype. Must be type .png, .jpg, .jpeg, .tif, .gif, .mp4, .mov, or .zip",
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

        res.send({
            Success: "Your inference file has been uploaded and saved",
        });
    }
}

module.exports = uploadInferenceFile;
