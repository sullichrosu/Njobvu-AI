async function script(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        pythonFile = req.files.upload_python;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        pythonFilePath = trainingPath + "/python/" + pythonFile.name;

    if (pythonFile.name.split(".").pop() != "py") {
        res.send({ Success: "ERROR: Wrong filetype. Must by type .py" });
    } else {
        await pythonFile.mv(pythonFilePath);

        if (!fs.existsSync(trainingPath)) {
            fs.mkdirSync(trainingPath);
        }

        res.send({ Success: "Your script has been uploaded and saved" });
    }
}

module.exports = script;
