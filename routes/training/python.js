async function python(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        pythonPath = req.body.python_path;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        pythonPathFile = trainingPath + "/Paths.txt";

    if (fs.existsSync(pythonPath)) {
        fs.writeFile(
            pythonPathFile,
            pythonPath + "\n",
            { flag: "a" },
            function (err) {
                if (err) {
                    global.logger.error(err);
                }
            },
        );

        res.send({ Success: "Python Path Saved" });
    } else {
        res.send({ Success: `ERROR! ${pythonPath} is not a valid path` });
    }
}

module.exports = python;
