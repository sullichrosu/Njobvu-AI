async function darknet(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        darknetPath = req.body.darknetPath;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        darknetPathFile = trainingPath + "/darknetPaths.txt";

    if (fs.existsSync(darknetPath)) {
        fs.writeFileSync(darknetPathFile, darknetPath + "\n", { flag: "a" });

        res.send({ Success: "Darknet Path Saved" });
    } else {
        res.send({ Success: `ERROR! ${darknetPath} is not a valid path` });
    }
}

module.exports = darknet;
