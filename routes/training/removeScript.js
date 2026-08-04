async function removeScript(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        scripts = req.body["scripts[]"].split(",");

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        scriptPath = trainingPath + "/python",
        pythonPathFile = trainingPath + "/Paths.txt";

    var newPaths = "";
    for (var i = 0; i < scripts.length; i++) {
        script = `${scriptPath}/${scripts[i]}`;
        fs.unlink(script, (error) => {
            global.logger.error(error);
        });
    }

    return res.redirect("/config?IDX=" + IDX);
}

module.exports = removeScript;
