const queries = require("../../queries/queries");

async function boostrap(req, res) {
    var projectName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        darknetPath = req.body.darknet_path,
        runNumber = req.body.run_number,
        uploadImages = req.files.upload_images,
        IDX = parseInt(req.body.IDX);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + projectName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        mergePath = projectPath + "/merge/",
        mergeImages = mergePath + "images/",
        yoloScript = publicPath + "controllers/training/bootstrap.py",
        runPath = logsPath + runNumber;

    if (fs.existsSync(mergePath)) {
        rimraf(mergePath, (err) => {
            if (err) {
                global.logger.error(err);
            } else {
            }
        });
    }

    try {
        fs.mkdirSync(mergePath);
        fs.mkdirSync(mergeImages);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error making merge directories");
    }

    var aidb = new sqlite3.Database(
        projectPath + "/" + projectName + ".db",
        (err) => {
            if (err) {
                return global.logger.error(err.message);
            }
            global.logger.info("Connected to aidb.")
        },
    );

    var newImages = [];
    var bootstrapString = "";

    var zipPath = projectPath + "/" + uploadImages.name; // $LABELING_TOOL_PATH/public/projects/{project_name}/{zip_file_name}
    await uploadImages.mv(zipPath);

    var zip = new StreamZip.async({ file: zipPath });

    await zip.extract(mergeImages);
    await zip.close();

    rimraf(zipPath, (err) => {
        if (err) {
            global.logger.error(err);
            return res.send("ERROR! " + err);
        }
    });

    let files = await readdirAsync(imagesPath);
    let newFiles = await readdirAsync(mergeImages);

    for (var i = 0; i < newFiles.length; i++) {
        var temp = mergeImages + "/" + newFiles[i];
        newFiles[i] = newFiles[i].trim();
        newFiles[i] = newFiles[i].split(" ").join("_");
        newFiles[i] = newFiles[i].split("+").join("_");
        fs.rename(temp, mergeImages + "/" + newFiles[i], () => {});
        if (newFiles[i] == "__MACOSX") {
            continue;
        } else if (!files.includes(newFiles[i])) {
            try {
                fs.renameSync(
                    mergeImages + "/" + newFiles[i],
                    imagesPath + "/" + newFiles[i],
                );

                await queries.project.addImages(projectPath, newFiles[i], 0, 1);

                newImages.push(newFiles[i]);
                bootstrapString += newFiles[i] + "\n";
            } catch (err) {
                global.logger.error(err);
                return res.stauts(500).send("Error inserting images");
            }
        }
    }

    fs.writeFileSync(
        trainingPath + "/images_to_bootstrap.txt",
        bootstrapString,
    );

    rimraf(mergePath, (err) => {
        if (err) {
            global.logger.error(err);
        }
    });

    res.send({ Success: "Yes" });
}

module.exports = boostrap;
