const fs = require("fs");
const { exec } = require("child_process");
const ffmpeg = require("ffmpeg");
const StreamZip = require("node-stream-zip");
const queries = require("../../queries/queries");
const rimraf = require("../../public/libraries/rimraf");
const { Client } = require("../../queries/client");

async function createProject(req, res) {
    const files = req.files || {};

    const uploadImages = files["upload_images"] || null;
    const uploadVideo = files["upload_video"] || null;
    const uploadBootstrap = files["upload_bootstrap"] ?? null;

    var publicPath = currentPath;
    var projectName = req.body["project_name"],
        frameRate = req.body["frame_rate"],
        inputClasses = req.body["input_classes"],
        autoSave = 1,
        username = req.cookies.Username,
        projectDescription = "none";

    inputClasses = inputClasses.split(",");

    var mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + username + "-" + projectName, // $LABELING_TOOL_PATH/public/projects/projectName
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/projectName/images
        bootstrapPath = projectPath + "/bootstrap",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        weightsPath = trainingPath + "/weights",
        pythonPath = trainingPath + "/python",
        pythonPathFile = trainingPath + "/Paths.txt";
    darknetPathFile = trainingPath + "/darknetPaths.txt";

    if (!fs.existsSync(mainPath)) {
        fs.mkdirSync(mainPath);
    }
    if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath);
        fs.mkdirSync(imagesPath);
        fs.mkdirSync(bootstrapPath);
        fs.mkdirSync(trainingPath);
        fs.mkdirSync(weightsPath);
        fs.mkdirSync(logsPath);
        fs.mkdirSync(pythonPath);

        fs.writeFile(pythonPathFile, "", function(err) {
            if (err) {
                global.logger.error(err);
            }
        });
        fs.writeFile(darknetPathFile, "", function(err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }

    try {
        await queries.managed.createProject(
            projectName,
            projectDescription,
            autoSave,
            username,
        );

        global.projectDbClients[projectPath] = new Client(
            projectPath + `/${projectName}.db`,
        );

        await queries.project.migrateProjectDb(projectPath);
        await queries.managed.grantUserAccess(username, projectName, username);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error creating project");
    }

    try {
        global.logger.debug(projectPath);
        const classes = await queries.project.getAllClasses(projectPath);

        global.logger.debug(classes);

        const currentClasses = [];
        for (var i = 0; i < classes.rows.length; i++) {
            currentClasses.push(classes.rows[i].CName);
        }

        for (let classValue of inputClasses) {
            if (!currentClasses.includes(classValue)) {
                await queries.project.createClass(projectPath, classValue);
            }
        }
    } catch (err) {
        global.logger.error(err);
        return res.send("Error creating project");
    }

    if (uploadImages) {
        var zipPath = imagesPath + "/" + uploadImages.name; // $LABELING_TOOL_PATH/public/projects/{projectName}/{zip_file_name}

        await uploadImages.mv(zipPath);
        global.logger.debug("File Uploaded", uploadImages.name);

        var zip = new StreamZip.async({ file: zipPath });

        try {
            await zip.extract(null, imagesPath);
            await zip.close();

            rimraf(zipPath, (err) => {
                if (err) {
                    global.logger.error(err);
                    res.status(500).send("Error removing zip file");
                }
            });

            const files = fs.readdirSync(imagesPath);

            for (var i = 0; i < files.length; i++) {
                if (files[i] == "__MACOSX") {
                    continue;
                }

                if (files[i].endsWith(".zip")) {
                    fs.unlink(imagesPath + "/" + files[i], () => { });
                    continue;
                }

                if (files[i].endsWith(".zip") || files[i] === "blob") {
                    continue;
                }

                var temp = imagesPath + "/" + files[i];

                files[i] = files[i].trim();
                files[i] = files[i].split(" ").join("_");
                files[i] = files[i].split("+").join("_");

                fs.rename(temp, imagesPath + "/" + files[i], () => { });

                try {
                    await queries.project.addImages(
                        projectPath,
                        files[i],
                        0,
                        0,
                    );
                } catch (err) {
                    global.logger.error(err);
                    return await res.status(500).send("Error uploading images");
                }
            }

            if (!uploadBootstrap) res.send("Project creation successful");
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error extracting zip");
        }
    }

    if (uploadVideo) {
        var videoPath = imagesPath + "/" + uploadVideo.name; // $LABELING_TOOL_PATH/public/projects/{projectName}/{zip_file_name}
        frameRate *= 30;

        await uploadVideo.mv(videoPath);

        try {
            const video = await new ffmpeg(videoPath);

            await video.fnExtractFrameToJPG(imagesPath, {
                every_n_frames: frameRate,
            });

            cleanFiles();
        } catch (e) {
            global.logger.debug("ERROR " + e);
        }

        async function cleanFiles() {
            let files = fs.readdirSync(imagesPath);

            for (let i = 0; i < files.length; i++) {
                if (files[i] == "__MACOSX") {
                    if (i + 1 == files.length) {
                        res.send("Project creation successful");
                    }
                    continue;
                }

                if (
                    files[i].endsWith(".mp4") ||
                    files[i].endsWith(".avi") ||
                    files[i].endsWith(".mov")
                ) {
                    fs.unlink(imagesPath + "/" + files[i], () => { });
                }

                if (files[i] === "blob") {
                    continue;
                }

                var temp = imagesPath + "/" + files[i];

                files[i] = files[i].trim();
                files[i] = files[i].split(" ").join("_");
                files[i] = files[i].split("+").join("_");

                fs.rename(temp, imagesPath + "/" + files[i], () => { });

                await queries.project.addImages(projectPath, files[i], 0, 0);
            }
        }

        if (!uploadBootstrap) res.send("Project creation successful");
    }

    if (!uploadVideo && !uploadImages) {
        return res.send("Project creation successful");
    }

    if (uploadBootstrap !== undefined && uploadBootstrap !== null) {
        const bootstrapFiles = Array.isArray(uploadBootstrap) ? uploadBootstrap : [uploadBootstrap];
        const outJsonFiles = [];
        const modelFormat = req.body["model_format"] || "darknet";

        for (let idx = 0; idx < bootstrapFiles.length; idx++) {
            const file = bootstrapFiles[idx];
            const modelDir = bootstrapPath + "/model_" + idx;

            if (!fs.existsSync(modelDir)) {
                fs.mkdirSync(modelDir);
            }

            const tempZipPath = modelDir + "/" + file.name;
            await file.mv(tempZipPath);

            const bzip = new StreamZip.async({ file: tempZipPath });

            try {
                let weightBootstrapPath = "",
                    cfgBootstrapPath = "",
                    dataBootstrapPath = "";

                await bzip.extract(null, modelDir);
                await bzip.close();

                rimraf(tempZipPath, (err) => {
                    if (err) {
                        global.logger.error(err);
                    }
                });

                let bfiles = fs.readdirSync(modelDir);

                for (var i = 0; i < bfiles.length; i++) {
                    if (bfiles[i] === "__MACOSX") {
                        continue;
                    }
                    if (bfiles[i].endsWith(".zip")) {
                        continue;
                    }

                    let temp = modelDir + "/" + bfiles[i];

                    bfiles[i] = bfiles[i].trim();
                    bfiles[i] = bfiles[i].split(" ").join("_");
                    bfiles[i] = bfiles[i].split("+").join("_");

                    const fullPath = modelDir + "/" + bfiles[i];

                    if (modelFormat === "darknet") {
                        switch (bfiles[i].split(".").at(-1)) {
                            case "weights":
                                weightBootstrapPath = fullPath;
                                fs.rename(temp, fullPath, () => { });

                                break;
                            case "cfg":

                                cfgBootstrapPath = fullPath;
                                fs.rename(temp, fullPath, () => { });
                                break;
                            case ".data":
                                dataBootstrapPath = fullPath;
                                fs.rename(temp, fullPath, () => { });

                                break;
                            default:
                                fs.unlink(fullPath, () => { });

                                break;
                        }
                    } else if (modelFormat === "ultralytics") {
                        if (bfiles[i].endsWith(".pt")) {
                            weightBootstrapPath = fullPath;
                            fs.rename(temp, fullPath, () => { });
                        } else {
                            fs.unlink(fullPath, () => { });
                        }
                    }
                }

                const imagesToWrite = await readdirAsync(imagesPath);

                let runData = imagesToWrite
                    .map((img) => imagesPath + "/" + img)
                    .join("\n");

                let runTxtPath = modelDir + "/run.txt";

                fs.writeFileSync(runTxtPath, runData);

                var yoloScript = publicPath + "controllers/training/bootstrap.py";
                const outBootstrapJson = modelDir + "/out.json";
                outJsonFiles.push(outBootstrapJson);

                let pythonBin = "python3";

                if (global.configFile && global.configFile["default_python_venv_path"] && fs.existsSync(global.configFile["default_python_venv_path"])) {
                    pythonBin = global.configFile["default_python_venv_path"];
                }

                var cmd;
                if (modelFormat === "darknet") {
                    let darknetPath = "/export/darknet";
                    cmd = `python3 ${yoloScript} -d ${dataBootstrapPath} -c ${cfgBootstrapPath} -t ${runTxtPath} -y ${darknetPath} -w ${weightBootstrapPath} -o ${outBootstrapJson} -f ${modelFormat}`;
                    process.chdir(darknetPath);
                } else {
                    cmd = `${pythonBin} ${yoloScript} -t ${runTxtPath} -w ${weightBootstrapPath} -o ${outBootstrapJson} -f ${modelFormat}`;
                }

                await new Promise((resolve) => {
                    var child = exec(cmd, (err, stdout, stderr) => {
                        if (err) {
                            global.logger.debug(`This is the error: ${err.message}`);
                        } else if (stderr) {
                            global.logger.debug(`This is the stderr: ${stderr}`);
                        }
                    });

                    child.on("error", (err) => {
                        global.logger.error(`Error occurred: ${err.message}`);
                        resolve();
                    });

                    child.on("exit", (code) => {
                        global.logger.debug(`Child process exited with code ${code}`);
                        resolve();
                    });
                });
            } catch (err) {
                global.logger.error(err);
                return res.status(500).send("Error bootstrapping model " + file.name);
            }
        }

        try {
            await applyBootstrapLabels(outJsonFiles);
            res.send("Project creation successful");
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error bootstrapping");
        }

        async function applyBootstrapLabels(outJsonFiles) {
            let imageResults;
            let classList;

            try {
                imageResults = await queries.project.getAllImages(projectPath);
                classList = await queries.project.getAllClasses(projectPath);
            } catch (err) {
                global.logger.error(err);
                throw err;
            }

            imageResults = imageResults.rows;
            classList = classList.rows;

            var classSet = new Set();

            for (let i = 0; i < classList.length; i++) {
                classSet.add(classList[i].CName);
            }

            var labelID = 0;

            for (let i = 0; i < imageResults.length; i++) {
                var imageName = imageResults[i].IName;
                var img = fs.readFileSync(
                    `${imagesPath}/${imageName}`,
                ),
                    imgData = global.probe.sync(img),
                    imgW = imgData.width,
                    imgH = imgData.height;

                for (const outJsonFile of outJsonFiles) {
                    if (!fs.existsSync(outJsonFile)) continue;
                    let rawLabelBootstrapData = fs.readFileSync(outJsonFile);
                    let labelBootstrapData = JSON.parse(rawLabelBootstrapData);

                    if (labelBootstrapData && labelBootstrapData[i] && labelBootstrapData[i].objects) {
                        for (let j = 0; j < labelBootstrapData[i].objects.length; j++) {
                            var boostrapObj = labelBootstrapData[i].objects[j];
                            var relativeCoords = boostrapObj.relative_coordinates;

                            var labelWidth = imgW * relativeCoords.width;
                            var labelHeight = imgH * relativeCoords.height;
                            var leftX = relativeCoords.center_x * imgW - labelWidth / 2;
                            var bottomY =
                                relativeCoords.center_y * imgH - labelHeight / 2;
                            var className = boostrapObj.name;
                            var confidence = Math.round(
                                Number(boostrapObj.confidence) * 100,
                            );
                            labelID += 1;

                            if (!classSet.has(className)) {
                                try {
                                    await queries.project.createClass(
                                        projectPath,
                                        className,
                                    );
                                    classSet.add(className);
                                } catch (err) {
                                    global.logger.error(err);
                                    throw err;
                                }
                            }

                            try {
                                await queries.project.createLabel(
                                    projectPath,
                                    Number(labelID),
                                    className,
                                    Number(leftX),
                                    Number(bottomY),
                                    Number(labelWidth),
                                    Number(labelHeight),
                                    labelHeight,
                                );
                            } catch (err) {
                                global.logger.error(err);
                                throw err;
                            }

                            try {
                                await queries.project.createValidation(
                                    projectPath,
                                    confidence,
                                    labelID,
                                    className,
                                    imageName,
                                );
                            } catch (err) {
                                global.logger.error(err);
                                throw err;
                            }
                        }
                    }
                }
            }
        }
    }
}

module.exports = createProject;
