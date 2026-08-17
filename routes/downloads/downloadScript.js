async function downloadScript(req, res) {
    var PName = req.body.PName,
        admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var scriptsArr = [];
    scriptsArr.push(req.body["scripts[]"]);

    var scripts = [];
    scripts = scripts.concat.apply(scripts, scriptsArr).filter(Boolean);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        pythonPath = trainingPath + "/python",
        logsPath = trainingPath + "/logs";

    var output = fs.createWriteStream(downloadsPath + "/scripts.zip");
    var archive = archiver("zip");

    output.on("close", function () {
        res.download(downloadsPath + "/scripts.zip");
    });

    archive.on("error", function (err) {
        throw err;
    });

    archive.pipe(output);
    for (var i = 0; i < scripts.length; i++) {
        let script = `${pythonPath}/${scripts[i]}`;
        archive.file(script, { name: scripts[i] });
    }
    archive.finalize();
}

module.exports = downloadScript;
