async function removeDarknetPath(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var removePaths = req.body["darknet_paths[]"];
    global.logger.debug("remove_paths: ", removePaths);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        darknetPathFile = trainingPath + "/darknetPaths.txt",
        pythonPathFile = trainingPath + "/Paths.txt";

    var currentPathsArr = [];
    currentPathsArr.push(
        fs.readFileSync(darknetPathFile, "utf-8").split("\n").filter(Boolean),
    );
    var currentPaths = [];
    currentPaths = currentPaths.concat
        .apply(currentPaths, currentPathsArr)
        .filter(Boolean);

    var newPaths = "";

    var darknetPath = new Set();

    for (var i = 0; i < currentPaths.length; i++) {
        if (removePaths.includes(currentPaths[i])) {
            darknetPath.add(currentPaths[i]);
            continue;
        }
        newPaths = `${newPaths}${currentPaths[i]}\n`;
    }

    fs.writeFile(darknetPathFile, newPaths, (err) => {
        if (err) throw err;

        const drkntTemp = darknetPath.values();
        for (var i = 0; i < darknetPath.size; i++) {
            var currentDarknetPath = drkntTemp.next().value;
            var darknetFiles = readdirSync(currentDarknetPath);
            for (var i = 0; i < darknetFiles.length; i++) {
                if (darknetFiles[i].split("-")[0] == user) {
                    rimraf(
                        currentDarknetPath + "/" + darknetFiles[i],
                        (err) => {
                            if (err) {
                                console.error(
                                    "there was an error with the user contents: ",
                                    err,
                                );
                            } else {
                                console.log(
                                    "Darknet user project contents successfuly deleted",
                                );
                            }
                        },
                    );
                }
            }
        }
        return res.redirect("/config?IDX=" + IDX);
    });
}

module.exports = removeDarknetPath;
