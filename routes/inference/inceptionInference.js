const queries = require("../../queries/queries");
const { exec } = require("child_process");

async function inceptionInference(req, res) {
    try {
        let date = Date.now();

        let PName = req.body.PName,
            Admin = req.body.Admin,
            user = req.cookies.Username,
            log = `${date}.log`,
            inferenceFile = req.body.inference_file,
            device = req.body.device,
            options = req.body.options,
            weightName = req.body.weights,
            topK = req.body.topK,
            usingImageNetClasses = req.body.using_imagenet_classes;

        var errFile = `${date}-error.log`;

        var publicPath = currentPath,
            mainPath = publicPath + "public/projects/",
            projectPath = mainPath + Admin + "-" + PName,
            imagesPath = projectPath + "/images",
            trainingPath = projectPath + "/training",
            inferencePath = projectPath + "/inference",
            inferenceUploadPath = projectPath + "/inference/uploads/",
            inferenceFilePath = inferenceFile,
            logsPath = inferencePath + "/logs",
            runPath = `${logsPath}/${date}`,
            classesPath = runPath + "/coco_classes.yaml",
            weightPath = trainingPath + "/weights/" + weightName,
            inferenceScript = publicPath + "controllers/inference/inception.py";

        if (!fs.existsSync(logsPath)) {
            fs.mkdirSync(logsPath);
        }

        if (!fs.existsSync(runPath)) {
            fs.mkdirSync(runPath);
        }

        fs.writeFileSync(`${runPath}/${log}`, "");
        fs.writeFileSync(`${runPath}/type.txt`, "inception");

        inferenceScriptCopyPath = runPath + "/inception.py";

        if (!fs.existsSync(inferenceScriptCopyPath)) {
            fs.copyFileSync(inferenceScript, inferenceScriptCopyPath);
        }

        let existingClasses;

        try {
            existingClasses = await queries.project.getAllClasses(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error fetching classes");
        }

        for (let i = 0; i < existingClasses.rows.length; i++) {
            fs.appendFileSync(`${runPath}/classes.txt`, `${existingClasses.rows[i].CName}\n`);
        }

        let cmd = `python3 ${inferenceScript} -i ${inferenceFilePath} -n ${runPath}/classes.txt -w ${usingImageNetClasses ? "imagenet" : weightPath} -o ${runPath}/output -k ${topK}`;

        let success = "";
        let error = "";

        fs.writeFileSync(`${runPath}/${log}`, `${cmd}\n\n`);

        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                global.logger.error(err);
                global.logger.debug(`Error: ${err.message}`);

                if (err.message != "stdout maxBuffer length exceeded") {
                    success = err.message;

                    fs.writeFileSync(
                        `${runPath}/${errFile}`,
                        success,
                    );
                }
            } else if (stderr) {
                global.logger.debug(`stderr: ${stderr}`);

                if (stderr != "stdout maxBuffer length exceeded") {
                    fs.writeFileSync(
                        `${runPath}/${errFile}`,
                        stderr,
                    );
                }
            }

            const completionData = {
                status: err ? 'error' : 'success',
                timestamp: date,
                zipAvailable: fs.existsSync(`${runPath}/inference_results.zip`),
                csvAvailable: fs.existsSync(`${runPath}/inference_stats.csv`)
            };

            fs.writeFileSync(`${runPath}/done.log`, success);
            fs.writeFileSync(`${runPath}/done.log`, JSON.stringify(completionData, null, 2));
        });


        res.send({ Success: `Inception Inference Started` });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error running inference");
    }
}

module.exports = inceptionInference;
