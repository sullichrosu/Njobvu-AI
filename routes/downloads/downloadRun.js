async function downloadRun(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = req.body.IDX,
        weights = req.body.weights,
        user = req.cookies.Username,
        logFile = req.body.log_file,
        runPath = req.body.run_path;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + user + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs/";

    var output = fs.createWriteStream(
        downloadsPath + "/" + logFile.substr(0, logFile.length - 4) + ".zip",
    );
    var archive = archiver("zip");

    output.on("close", function () {
        res.download(
            downloadsPath +
                "/" +
                logFile.substr(0, logFile.length - 4) +
                ".zip",
        );
    });
    archive.on("error", function (err) {
        throw err;
    });

    archive.pipe(output);

    var logs = await readdirAsync(`${runPath}`);

    for (var i = 0; i < logs.length; i++) {
        archive.file(`${runPath}${logs[i]}`, { name: logs[i] });
    }

    archive.finalize();
}

module.exports = downloadRun;
