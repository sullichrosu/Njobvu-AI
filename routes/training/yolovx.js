async function yolovx(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        yolovxPath = req.body.yolovx_path;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        yolovxPathFile = trainingPath + "/yolovxPaths.txt";

    if (fs.existsSync(yolovxPath)) {
        fs.writeFile(
            yolovxPathFile,
            yolovxPath + "\n",
            { flag: "a" },
            function (err) {
                if (err) {
                    global.logger.error(err);
                }
            },
        );

        res.send({ Success: "YOLO Path Saved" });
    } else {
        res.send({ Success: `ERROR! ${yolovxPath} is not a valid path` });
    }
}

module.exports = yolovx;
