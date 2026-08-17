async function removePath(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var removePathsArr = [];
    removePathsArr.push(req.body["paths[]"]);
    var removePaths = [];
    removePaths = removePaths.concat
        .apply(removePaths, removePathsArr)
        .filter(Boolean);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        pythonPathFile = trainingPath + "/Paths.txt";

    var currentPathsArr = [];
    currentPathsArr.push(
        fs.readFileSync(pythonPathFile, "utf-8").split("\n").filter(Boolean),
    );
    var currentPaths = [];
    currentPaths = currentPaths.concat
        .apply(currentPaths, currentPathsArr)
        .filter(Boolean);

    var newPaths = "";
    for (var i = 0; i < currentPaths.length; i++) {
        if (removePaths.includes(currentPaths[i])) {
            continue;
        }
        newPaths = `${newPaths}${currentPaths[i]}\n`;
    }

    fs.writeFile(pythonPathFile, newPaths, (err) => {
        if (err) throw err;

        return res.redirect("/config?IDX=" + IDX);
    });
}

module.exports = removePath;
