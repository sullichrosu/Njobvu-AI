const StreamZip = require("node-stream-zip");
const rimraf = require("../../public/libraries/rimraf");
const queries = require("../../queries/queries");
const { Client } = require("../../queries/client");

async function importProject(req, res) {
    req.setTimeout(600000);

    var uploadImages = req.files["upload_file"],
        projectName = req.body.project_name,
        username = req.cookies.Username,
        autoSave = 1,
        projectDescription = "none";

    var publicPath = currentPath.replace("projects"),
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + username + "-" + projectName, // $LABELING_TOOL_PATH/public/projects/projectName
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/projectName/images
        boostrapPath = projectPath + "/bootstrap", // $LABELING_TOOL_PATH/public/projects/projectName/bootstrap
        downloadsPath = mainPath + username + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        pythonPath = trainingPath + "/python",
        weightsPath = trainingPath + "/weights",
        pythonPathFile = trainingPath + "/Paths.txt",
        darknetPathsFile = trainingPath + "/darknetPaths.txt";

    var names = [];

    let projects;
    try {
        projects = await queries.managed.getUserProjects(username);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error fetching projects");
    }

    for (var i = 0; i < projects.rows.length; i++) {
        names.push(projects.rows[i].PName);
    }

    if (names.includes(projectName)) {
        return res.send({ Success: "That project name already exists" });
    }

    if (!fs.existsSync(mainPath)) {
        fs.mkdirSync(mainPath);
    }

    if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath);
    }

    var zipPath = projectPath + "/" + uploadImages.name; // $LABELING_TOOL_PATH/public/projects/{projectName}/{zip_file_name}
    await uploadImages.mv(zipPath);

    var found = 0;

    var zip = new StreamZip.async({ file: zipPath });

    await zip.extract(null, projectPath);
    await zip.close();

    files = await readdirAsync(projectPath);

    for (var i = 0; i < files.length; i++) {
        if (files[i].substr(-3) == ".db") {
            found = 1;
            var idb = files[i];
            if (idb.substr(0, idb.length - 3) != projectName) {
                fs.rename(
                    `${projectPath}/${idb}`,
                    `${projectPath}/${projectName}.db`,
                    (error) => {
                        if (error) {
                            global.logger.error(error);
                        }
                    },
                );
            }

            try {
                await queries.managed.createProject(
                    projectName,
                    projectDescription,
                    autoSave,
                    username,
                );

                var dbPath = `${projectPath}/${projectName}.db`;
                global.projectDbClients[projectPath] = new Client(dbPath);

                await queries.project.migrateProjectDb(projectPath);
                await queries.managed.grantUserAccess(
                    username,
                    projectName,
                    username,
                );
            } catch (err) {
                global.logger.error(err);
                await res.status(500).send("Error creating project");
            }

            try {
                fs.unlinkSync(zipPath);
            } catch (err) {
                global.logger.error(err);
                return res.status(500).send("Error removing .zip file");
            }

            let images = await readdirAsync(imagesPath);
            let oldImages;

            try {
                oldImages = await queries.project.getAllImages(projectPath);
            } catch (err) {
                global.logger.error(err);
                await res.status(500).send("Could not fetch old images");
            }

            global.logger.debug(oldImages);

            var oldDbImages = [];
            var fileTypes = [
                "jpeg",
                "JPEG",
                "jpg",
                "JPG",
                "png",
                "PNG",
                "tiff",
                "TIFF",
            ];

            for (let j = 0; j < oldImages.rows.length; j++) {
                oldDbImages.push(oldImages.rows[j].IName);
            }

            for (let j = 0; j < images.length; j++) {
                var oldImg = oldDbImages.find((oldImg) => oldImg === image);
                var image = images[j];
                image = image.trim();
                image = image.split(" ").join("_");
                image = image.split("+").join("_");
                let ext = image.split(".").pop();

                if (image != oldImg) {
                    fs.renameSync(
                        imagesPath + "/" + images[j],
                        imagesPath + "/" + image,
                    );
                }

                if (oldDbImages.includes(oldImg) && image != oldImg) {
                    try {
                        await queries.project.updateImageName(
                            projectPath,
                            images[j],
                            image,
                        );
                        await queries.project.updateLabelImageName(
                            projectPath,
                            images[j],
                            image,
                        );
                        await queries.project.updateValidationImageName(
                            projectPath,
                            images[j],
                            image,
                        );
                    } catch (err) {
                        global.logger.error(err);
                        await res.status(500).send("Error renaming old image");
                    }
                } else if (
                    !oldDbImages.includes(oldImg) &&
                    fileTypes.includes(ext)
                ) {
                    try {
                        await queries.project.addImages(
                            projectPath,
                            image,
                            1,
                            0,
                        );
                    } catch (err) {
                        global.logger.error(err);
                        return res.status(500).send("Error adding image");
                    }
                }
            }

            let classes;
            try {
                classes = await queries.project.getAllClasses(projectPath);
            } catch (err) {
                global.logger.error(err);
                return res
                    .status(500)
                    .send("Error retrieveing existing classes");
            }

            for (let j = 0; j < classes.rows.length; j++) {
                let CName = classes.rows[j].CName;

                CName = CName.trim();
                CName = CName.split(" ").join("_");

                try {
                    await queries.project.updateClassName(
                        projectPath,
                        classes.rows[j].CName,
                        CName,
                    );
                    await queries.project.updateLabelClassName(
                        projectPath,
                        classes.rows[j].CName,
                        CName,
                    );
                    await queries.project.updateValidationClassName(
                        projectPath,
                        classes.rows[j].CName,
                        CName,
                    );
                } catch (err) {
                    global.logger.error(err);
                    return res
                        .status(500)
                        .send("Error normalizing class names");
                }
            }

            let labels;
            let confidence;

            try {
                labels = await queries.project.getAllLabels(projectPath);
                confidence =
                    await queries.project.getAllValidations(projectPath);
            } catch (err) {
                global.logger.error(err);
                await res.status(500).send("Error getting validation & labels");
            }

            var conf = {};
            for (let j = 0; j < confidence.rows.length; j++) {
                conf[confidence.rows[j].LID] = confidence.rows[j];
            }

            var currentLabels = [];
            var currentConfidence = [];

            for (let j = 0; j < labels.rows.length; j++) {
                const label = labels.rows[j];
                if (label.W > 0 && label.H > 0) {
                    currentLabels.push([
                        label.CName,
                        label.X,
                        label.Y,
                        label.W,
                        label.H,
                        label.IName,
                    ]);

                    if (label.LID in conf) {
                        currentConfidence.push([conf[label.LID]]);
                    } else {
                        currentConfidence.push([]);
                    }
                }
            }

            try {
                await queries.project.deleteAllLabels(projectPath);
                await queries.project.deleteAllValidations(projectPath);
            } catch (err) {
                return err;
            }

            for (let j = 0; j < currentLabels.length; j++) {
                const currentLabel = currentLabels[j];
                const currentConf = currentConfidence[j];

                try {
                    await queries.project.createLabel(
                        projectPath,
                        Number(j + 1),
                        currentLabel[0],
                        currentLabel[1],
                        currentLabel[2],
                        currentLabel[3],
                        currentLabel[4],
                        currentLabel[5],

                    );

                    if (currentConf.length != 0) {
                        await queries.project.createValidation(
                            projectPath,
                            Number(currentConf[0].Confidence),
                            Number(j + 1),
                            currentConf[0].CName,
                            currentConf[0].IName,
                        );
                    }
                } catch (err) {
                    global.logger.error(err);
                    return res
                        .status(500)
                        .send("Error creating label or validation");
                }
            }
            if (!fs.existsSync(boostrapPath)) {
                fs.mkdirSync(boostrapPath);
            }

            if (!fs.existsSync(trainingPath)) {
                fs.mkdirSync(trainingPath);
                fs.mkdirSync(logsPath);
                fs.mkdirSync(pythonPath);
                fs.mkdirSync(weightsPath);

                fs.writeFileSync(pythonPathFile, "");
                fs.writeFileSync(darknetPathsFile, "");
            } else {
                if (!fs.existsSync(logsPath)) {
                    fs.mkdirSync(logsPath);
                }

                if (!fs.existsSync(pythonPath)) {
                    fs.mkdirSync(pythonPath);
                }

                if (!fs.existsSync(weightsPath)) {
                    fs.mkdirSync(weightsPath);
                }

                if (!fs.existsSync(pythonPathFile)) {
                    fs.writeFileSync(pythonPathFile, "");
                }

                if (!fs.existsSync(darknetPathsFile)) {
                    fs.writeFileSync(darknetPathsFile, "");
                }
            }

            res.send("Import Finished");

            break;
        }
    }

    if (found == 0) {
        rimraf(projectPath, function (err) {
            if (err) {
                global.logger.error(err);
            }
        });

        res.send({ Success: "No .db file found" });
    }
}

module.exports = importProject;
