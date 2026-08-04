const queries = require("../../queries/queries");

async function run(req, res) {
    const { exec } = require("child_process");

    global.logger.debug("date: ", Date.now());
    var date = Date.now();

    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        pythonPath = req.body.python_path,
        script = req.body.script,
        log = `${date}.log`,
        weights = req.body.weights,
        TrainingPercent = parseFloat(req.body.TrainingPercent);

    if (TrainingPercent > 1) {
        TrainingPercent = TrainingPercent / 100;
    }
    var options = "";

    if (req.body.options) {
        options = req.body.options;
    } else {
        options = "EMPTY";
    }
    global.logger.debug("options: ", options);
    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        absImagesPath = path.join(__dirname, imagesPath),
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        runPath = `${logsPath}/${date}`,
        weightsFile = trainingPath + "/weights/" + weights,
        pythonScript = trainingPath + "/python/" + script,
        wrapperPath =
            publicPath + "controllers/training/train_data_from_project.py",
        projectDb = `${projectPath}/${PName}.db`;

    if (!fs.existsSync(runPath)) {
        fs.mkdirSync(runPath);
    }

    fs.writeFile(`${runPath}/${log}`, "", (err) => {
        if (err) throw err;
    });

    let existingLabels;
    try {
        existingLabels = await queries.project.getAllLabels(projectPath);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error fetching labels");
    }
    const labels = existingLabels.rows;
    var xmin = 0;
    var xmax = 0;
    var ymin = 0;
    var ymax = 0;
    var data = "filename,width,height,class,xmin,ymin,xmax,ymax\n";
    var i = 0;
    var image = "";
    for (i = 0; i < Math.floor(labels.length * TrainingPercent); i++) {
        image = path.join(absImagesPath, labels[i].IName);
        xmin = labels[i].X;
        xmax = xmin + labels[i].W;
        ymin = labels[i].Y;
        ymax = ymin + labels[i].Y;
        data =
            data +
            image +
            "," +
            labels[i].W +
            "," +
            labels[i].H +
            "," +
            labels[i].CName +
            "," +
            xmin +
            "," +
            ymin +
            "," +
            xmax +
            "," +
            ymax +
            "\n";
    }
    var trainingCsv = runPath + "/" + PName + "_train.csv";
    fs.writeFile(trainingCsv, data, (err) => {
        if (err) throw err;
    });

    ///////////////Create Tensorflow Validate csv /////////////////////////////////
    var data = "filename,width,height,class,xmin,ymin,xmax,ymax\n";
    for (var j = i; j < labels.length; j++) {
        image = path.join(absImagesPath, labels[j].IName);
        xmin = labels[j].X;
        xmax = xmin + labels[j].W;
        ymin = labels[j].Y;
        ymax = ymin + labels[j].Y;
        data =
            data +
            image +
            "," +
            labels[j].W +
            "," +
            labels[j].H +
            "," +
            labels[j].CName +
            "," +
            xmin +
            "," +
            ymin +
            "," +
            xmax +
            "," +
            ymax +
            "\n";
    }
    var validationCsv = runPath + "/" + PName + "_validate.csv";
    fs.writeFile(validationCsv, data, (err) => {
        if (err) throw err;
    });

    //Create error file name
    var errFile = `${date}-error.log`;

    //TODO: Add weights, training.csv, and validate.csv options to command
    options = options.replace("<data_dir>", imagesPath);
    options = options.replace("<training_csv>", trainingCsv);
    options = options.replace("<validation_csv>", validationCsv);
    options = options.replace("<output_dir>", runPath);
    options = options.replace("<weights>", weightsFile);

    var cmd = `${wrapperPath} -p ${pythonPath} -s ${pythonScript} -l ${runPath}/${log} -o "${options}"`;
    var success = "Training complete";
    var error = "";
    process.chdir(runPath);

    var child = exec(cmd, (err, stdout, stderr) => {
        if (err) {
            global.logger.debug(`This is the error: ${err.message}`);
            success = err.message;
            fs.writeFile(`${runPath}/${errFile}`, success, (err) => {
                if (err) throw err;
            });
        } else if (stderr) {
            global.logger.debug(`This is the stderr: ${stderr}`);
            fs.writeFile(`${runPath}/${errFile}`, stderr, (err) => {
                if (err) throw err;
            });
            //return;
        }
        global.logger.debug("stdout: ", stdout);
        global.logger.debug("stderr: ", stderr);
        global.logger.debug("err: ", err);
        fs.writeFile(`${runPath}/done.log`, success, (err) => {
            if (err) throw err;
        });
    });

    res.send({ Success: `Training Started` });
    process.chdir(`${publicPath}routes`);
}

module.exports = run;
