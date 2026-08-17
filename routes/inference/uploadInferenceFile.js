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

    const validFileNames = ["png", "tif", "jpg", "jpeg", "gif", "mp4", "mov"];

    if (!validFileNames.includes(inferenceFile.name.split(".").pop())) {
        res.send({
            Success:
                "ERROR: Wrong filetype. Must be type .png, .jpg, jpeg, tif or .gif",
        });
    } else {
        if (!fs.existsSync(inferencePath)) {
            fs.mkdirSync(inferencePath);
        }

        if (!fs.existsSync(inferenceUploadPath)) {
            fs.mkdir(inferenceUploadPath);
        }

        await inferenceFile.mv(inferenceFilePath);

        res.send({
            Success: "Your inference file has been uploaded and saved",
        });
    }
}

module.exports = uploadInferenceFile;
