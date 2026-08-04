const queries = require("../../queries/queries");
const path = require("path");

async function yoloInference(req, res) {
    try {
        const { exec } = require("child_process");

        var date = Date.now();

        var PName = req.body.PName,
            Admin = req.body.Admin,
            user = req.cookies.Username,
            ultralyticsPath = req.body.yolovx_path,
            yolovxPath = req.body.yolovx_path,
            log = `${date}.log`,
            inferenceFile = req.body.inference_file,
            device = req.body.device,
            options = req.body.options,
            yoloTask = req.body.yolo_task,
            weightName = req.body.weights;

        var errFile = `${date}-error.log`;

        var publicPath = currentPath,
            mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
            projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
            imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
            trainingPath = projectPath + "/training",
            inferencePath = projectPath + "/inference",
            inferenceUploadPath = projectPath + "/inference/uploads/",
            inferenceFilePath = inferenceFile,
            // inferenceFilePath = inferenceUploadPath + inferenceFile,
            logsPath = inferencePath + "/logs",
            runPath = `${logsPath}/${date}`,
            classesPath = runPath + "/coco_classes.yaml",
            weightPath = trainingPath + "/weights/" + weightName,
            yoloScript = publicPath + "controllers/inference/datatovalues.py";

        if (!fs.existsSync(logsPath)) {
            fs.mkdirSync(logsPath);
        }

        if (!fs.existsSync(runPath)) {
            fs.mkdirSync(runPath);
        }

        fs.writeFileSync(`${runPath}/${log}`, "");
        fs.writeFileSync(`${runPath}/type.txt`, "yolo");

        ultralyticsCfgScript = runPath + "/datatovalues.py";

        if (!fs.existsSync(ultralyticsCfgScript)) {
            fs.copyFileSync(yoloScript, ultralyticsCfgScript);
        }

        var cnames = [];

        let existingClasses;
        let existingImages;

        try {
            existingClasses = await queries.project.getAllClasses(projectPath);
            existingImages = await queries.project.getAllImages(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error fetching images or classes");
        }

        for (var i = 0; i < existingClasses.rows.length; i++) {
            cnames.push(existingClasses.rows[i].CName);
        }

        const yamlContent = `names:\n${cnames.map(n => `  - ${n}`).join("\n")}\n`;
        fs.writeFileSync(classesPath, yamlContent);

        var dictImagesLabels = {};

        for (var i = 0; i < existingImages.rows.length; i++) {
            var img = fs.readFileSync(
                `${imagesPath}/${existingImages.rows[i].IName}`,
            ),
                imgData = probe.sync(img),
                imgW = imgData.width,
                imgH = imgData.height;

            let existingLabels;

            try {
                existingLabels = await queries.project.getLabelsForImageName(
                    projectPath,
                    existingImages.rows[i].IName,
                );
            } catch (err) {
                global.logger.error(err);
                continue;
            }

            for (var j = 0; j < existingLabels.rows.length; j++) {
                var centerX =
                    (existingLabels.rows[j].X + existingLabels.rows[j].W / 2) /
                    imgW;
                var centerY =
                    (existingLabels.rows[j].Y + existingLabels.rows[j].H / 2) /
                    imgH;

                toStringValue = `${cnames.indexOf(existingLabels.rows[j].CName)} ${centerX} ${centerY} ${existingLabels.rows[j].W / imgW} ${existingLabels.rows[j].H / imgH}\n`;

                if (
                    dictImagesLabels[existingImages.rows[i].IName] == undefined
                ) {
                    dictImagesLabels[existingImages.rows[i].IName] =
                        toStringValue;
                } else {
                    dictImagesLabels[existingImages.rows[i].IName] +=
                        toStringValue;
                }
            }

            if (existingLabels.rows.length == 0) {
                dictImagesLabels[existingImages.rows[i].IName] = "";
            }
        }

        for (var key in dictImagesLabels) {
            removeDotExt = path.parse(key).name;

            fs.writeFileSync(
                `${imagesPath}/${removeDotExt}.txt`,
                dictImagesLabels[key],
            );
        }

        absUltralyticsProjectPath = runPath;

        absUltralyticsProjectRun = absUltralyticsProjectPath;

        absWeightProjectPath = path.join(
            inferencePath,
            "logs",
            date.toString(),
            weightName,
        );

        if (!fs.existsSync(absWeightProjectPath)) {
            fs.symlinkSync(weightPath, absWeightProjectPath, "file");
        }

        ultralyticsProjectRun = runPath;

        if (!fs.existsSync(inferenceFilePath)) {
            const fallbackInferenceFilePath = path.join(inferenceUploadPath, inferenceFilePath);
            if (fs.existsSync(fallbackInferenceFilePath)) {
                inferenceFilePath = fallbackInferenceFilePath;
            }
        }

        var cmd = `python3 ${yoloScript} -d ${runPath} -i ${inferenceFilePath} -n ${classesPath} -l ${absUltralyticsProjectRun}/${log} -f ${ultralyticsPath} -w ${weightPath} -t ${yoloTask}`;

        var success = "";
        var error = "";

        fs.writeFileSync(`${absUltralyticsProjectRun}/${log}`, `${cmd}\n\n`);

        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                global.logger.error(err);
                global.logger.debug(`This is the error: ${err.message}`);

                if (err.message != "stdout maxBuffer length exceeded") {
                    success = err.message;

                    fs.writeFile(
                        `${ultralyticsProjectRun}/${errFile}`,
                        success,
                        (err) => {
                            if (err) throw err;
                        },
                    );
                }
            } else if (stderr) {
                global.logger.debug(`This is the stderr: ${stderr}`);

                if (stderr != "stdout maxBuffer length exceeded") {
                    fs.writeFile(
                        `${ultralyticsProjectRun}/${errFile}`,
                        stderr,
                        (err) => {
                            if (err) throw err;
                        },
                    );
                }
            }

            const completionData = {
                status: err ? 'error' : 'success',
                timestamp: date,
                zipAvailable: fs.existsSync(`${runPath}/inference_results.zip`),
                csvAvailable: fs.existsSync(`${runPath}/inference_stats.csv`),
                message: success
            };

            fs.writeFileSync(
                `${runPath}/done.log`,
                `${cmd}\n\n${JSON.stringify(completionData, null, 2)}`
            );
        });


        res.send({ Success: `YOLO Inference Started` });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error running inference");
    }
}

module.exports = yoloInference;
