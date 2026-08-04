async function deleteRun(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = req.body.IDX,
        weights = req.body.weights,
        user = req.cookies.Username,
        runPath = req.body.run_path,
        logFile = req.body.log_file;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + user + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs/";

    rimraf(runPath, function (err) {
        if (err) {
            global.logger.error(err);
        }
        global.logger.debug(`${runPath} deleted`);
    });
    return res.redirect("/training?IDX=" + IDX);
}

module.exports = deleteRun;
