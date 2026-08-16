const path = require("path");
const formatRunOptionsHeader = require("../../utils/formatRunOptionsHeader");
const config = require("../../config.json");

async function megadetectorInference(req, res) {
    try {
        const { exec } = require("child_process");

        var date = Date.now();

        var PName = req.body.PName,
            Admin = req.body.Admin,
            yolovxPath = req.body.yolovx_path,
            log = `${date}.log`,
            inferenceFile = req.body.inference_file,
            device = req.body.device,
            options = req.body.options,
            mode = req.body.mode || "predict",
            modelSource = req.body.model_source,
            prebuiltModel = req.body.prebuilt_model,
            weightName = req.body.weights;

        var errFile = `${date}-error.log`;

        var publicPath = currentPath,
            mainPath = publicPath + "public/projects/",
            projectPath = mainPath + Admin + "-" + PName,
            trainingPath = projectPath + "/training",
            inferencePath = projectPath + "/inference",
            inferenceUploadPath = projectPath + "/inference/uploads/",
            inferenceFilePath = inferenceFile,
            logsPath = inferencePath + "/logs",
            runPath = `${logsPath}/${date}`,
            megadetectorScript = publicPath + "controllers/inference/megadetector.py";

        var weightPath;

        if (modelSource === "prebuilt") {
            var registry = (configFile && configFile.megadetector_models) || {};
            weightPath = registry[prebuiltModel];

            if (!weightPath) {
                return res.status(400).send(
                    `Unknown or unconfigured prebuilt MegaDetector model: ${prebuiltModel}. Ask an admin to set megadetector_models.${prebuiltModel} in config.json.`,
                );
            }
        } else {
            weightPath = trainingPath + "/weights/" + weightName;
        }

        if (!fs.existsSync(logsPath)) {
            fs.mkdirSync(logsPath);
        }

        if (!fs.existsSync(runPath)) {
            fs.mkdirSync(runPath);
        }

        fs.writeFileSync(`${runPath}/${log}`, "");
        fs.writeFileSync(`${runPath}/type.txt`, "megadetector");

        var megadetectorScriptCopyPath = runPath + "/megadetector.py";

        if (!fs.existsSync(megadetectorScriptCopyPath)) {
            fs.copyFileSync(megadetectorScript, megadetectorScriptCopyPath);
        }

        if (!fs.existsSync(inferenceFilePath)) {
            const fallbackInferenceFilePath = path.join(inferenceUploadPath, inferenceFilePath);
            if (fs.existsSync(fallbackInferenceFilePath)) {
                inferenceFilePath = fallbackInferenceFilePath;
            }
        }

        var cmd = `${config["default_python_path"]} ${megadetectorScript} -d ${runPath} -i ${inferenceFilePath} -l ${runPath}/${log} -f ${yolovxPath} -w ${weightPath} -D ${device || "cpu"} -o "${options || ""}" -m ${mode}`;

        var success = "";

        const runOptionsHeader = formatRunOptionsHeader({
            project: PName,
            model_source: modelSource,
            prebuilt_model: prebuiltModel,
            weights: weightName,
            yolovx_path: yolovxPath,
            inference_file: inferenceFile,
            device,
            options,
            mode,
        });

        fs.writeFileSync(`${runPath}/${log}`, `${runOptionsHeader}${cmd}\n\n`);

        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                global.logger.error(err);
                global.logger.debug(`This is the error: ${err.message}`);

                if (err.message != "stdout maxBuffer length exceeded") {
                    success = err.message;

                    fs.writeFile(`${runPath}/${errFile}`, success, (err) => {
                        if (err) throw err;
                    });
                }
            } else if (stderr) {
                global.logger.debug(`This is the stderr: ${stderr}`);

                if (stderr != "stdout maxBuffer length exceeded") {
                    fs.writeFile(`${runPath}/${errFile}`, stderr, (err) => {
                        if (err) throw err;
                    });
                }
            }

            const completionData = {
                status: err ? "error" : "success",
                timestamp: date,
                zipAvailable: fs.existsSync(`${runPath}/inference_results.zip`),
                csvAvailable: fs.existsSync(`${runPath}/inference_stats.csv`),
                message: success,
            };

            fs.writeFileSync(
                `${runPath}/done.log`,
                `${cmd}\n\n${JSON.stringify(completionData, null, 2)}`,
            );
        });

        res.send({ Success: `MegaDetector Inference Started` });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error running inference");
    }
}

module.exports = megadetectorInference;
