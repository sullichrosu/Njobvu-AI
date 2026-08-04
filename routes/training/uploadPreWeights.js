async function uploadPreWeights(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.body.user,
        weightsFile = req.files.upload_weights;

    global.logger.debug("Admin: ", Admin);
    global.logger.debug("User: ", user);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        weightsPath = trainingPath + "/weights/",
        weightsFilePath = weightsPath + weightsFile.name;

    global.logger.debug("weightsFilePath: ", weightsFilePath);

    const validExtensions = ["137", "weights", "pt", "h5"]

    if (
        !validExtensions.includes(weightsFile.name.split(".").pop())
    ) {
        res.send({
            Success:
                "ERROR: Wrong filetype. Must be type .137 or weights or .pt or .h5",
        });
    } else {
        // move python file and check of python path exists
        await weightsFile.mv(weightsFilePath);

        // create trainging path if does not exist
        if (!fs.existsSync(trainingPath)) {
            fs.mkdir(trainingPath, (error) => {
                if (error) {
                    global.logger.debug(errror);
                }
            });
        }

        res.send({ Success: "Your weight file has been uploaded and saved" });
    }
}

module.exports = uploadPreWeights;
