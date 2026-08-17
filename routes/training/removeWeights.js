async function removeWeights(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        weightsArr = [];
    weightsArr.push(req.body["weights[]"]);
    weights = [];
    weights = weights.concat.apply(weights, weightsArr).filter(Boolean);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        scriptPath = trainingPath + "/python",
        weightsPath = trainingPath + "/weights",
        pythonPathFile = trainingPath + "/Paths.txt";

    for (var i = 0; i < weights.length; i++) {
        weight = `${weightsPath}/${weights[i]}`;

        fs.unlink(weight, (error) => {
            if (error) {
                global.logger.error(error);
            }
        });
    }

    return res.redirect("/config?IDX=" + IDX);
}

module.exports = removeWeights;
