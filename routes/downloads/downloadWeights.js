async function downloadWeights(req, res) {
    var PName = req.body.PName,
        admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var weightsArr = [];
    weightsArr.push(req.body["weights[]"]);
    var weights = [];
    weights = weights.concat.apply(weights, weightsArr).filter(Boolean);

    var publicPath = __dirname.replace("routes", "").replace("downloads", ""),
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        weightsPath = trainingPath + "/weights";

    var output = fs.createWriteStream(downloadsPath + "/weights.zip");
    var archive = archiver("zip");

    output.on("close", function () {
        res.download(downloadsPath + "/weights.zip");
    });

    archive.on("error", function (err) {
        throw err;
    });

    archive.pipe(output);

    for (var i = 0; i < weights.length; i++) {
        var weightsFile = weightsPath + "/" + weights[i];
        archive.file(weightsFile, { name: weights[i] });
    }

    archive.finalize();
}

module.exports = downloadWeights;
