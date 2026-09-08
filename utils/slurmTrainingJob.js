const path = require("path");
const fs = require("fs");
const queries = require("../queries/queries");
const formatRunOptionsHeader = require("./formatRunOptionsHeader");
const { ensureTrainingImagesLocal } = require("./jitTrainingImages");

function buildCsv(rows, imagesPath) {
    let data = "filename,width,height,class,xmin,ymin,xmax,ymax\n";

    for (const row of rows) {
        const image = path.join(imagesPath, row.IName);
        const xmin = row.X;
        const ymin = row.Y;
        const xmax = xmin + row.W;
        const ymax = ymin + row.H;

        data += `${image},${row.W},${row.H},${row.CName},${xmin},${ymin},${xmax},${ymax}\n`;
    }

    return data;
}

// Builds the same training run (CSV export, wrapper command) that
// routes/training/run.js uses for the local `exec` launch, but stops short
// of running it - the caller submits it to Slurm via `sbatch` instead.
//
// JIT-downloaded S3 images are left on disk on purpose: the local path
// cleans them up once `exec` reports the run finished, but a Slurm job is
// still queued (maybe for hours) when this function returns, so there's no
// safe "run is done" signal here yet to trigger cleanup.
async function prepareTrainingSubmission(req) {
    const PName = req.body.PName,
        Admin = req.body.Admin,
        pythonPath = req.body.python_path,
        script = req.body.script,
        weights = req.body.weights;

    let TrainingPercent = parseFloat(req.body.TrainingPercent);

    if (!PName || !Admin || !pythonPath || !script) {
        const err = new Error("Missing required training job parameters (PName, Admin, python_path, script)");
        err.statusCode = 400;
        throw err;
    }

    if (TrainingPercent > 1) {
        TrainingPercent = TrainingPercent / 100;
    }

    const options0 = req.body.options ? req.body.options : "EMPTY";

    const date = Date.now();
    const log = `${date}.log`;
    const errFile = `${date}-error.log`;

    const publicPath = global.currentPath || process.cwd() + "/",
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + Admin + "-" + PName,
        imagesPath = projectPath + "/images",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        runPath = `${logsPath}/${date}`,
        weightsFile = trainingPath + "/weights/" + weights,
        pythonScript = trainingPath + "/python/" + script,
        wrapperPath = publicPath + "controllers/training/train_data_from_project.py";

    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }

    if (!fs.existsSync(runPath)) {
        fs.mkdirSync(runPath);
    }

    const runOptionsHeader = formatRunOptionsHeader({
        project: PName,
        python_path: pythonPath,
        script,
        training_percent: TrainingPercent,
        weights,
        options: options0,
        launch_target: "Slurm (HPC)",
    });

    fs.writeFileSync(`${runPath}/${log}`, runOptionsHeader);

    let existingImages;
    let existingLabels;

    try {
        existingImages = await queries.project.getAllImages(projectPath);
        await ensureTrainingImagesLocal(PName, Admin, projectPath, existingImages.rows);
        existingLabels = await queries.project.getAllLabels(projectPath);
    } catch (err) {
        err.statusCode = err.statusCode || 500;
        throw err;
    }

    const labels = existingLabels.rows;
    const splitIndex = Math.floor(labels.length * TrainingPercent);

    const trainingCsv = `${runPath}/${PName}_train.csv`;
    const validationCsv = `${runPath}/${PName}_validate.csv`;

    fs.writeFileSync(trainingCsv, buildCsv(labels.slice(0, splitIndex), imagesPath));
    fs.writeFileSync(validationCsv, buildCsv(labels.slice(splitIndex), imagesPath));

    const options = options0
        .replace("<data_dir>", imagesPath)
        .replace("<training_csv>", trainingCsv)
        .replace("<validation_csv>", validationCsv)
        .replace("<output_dir>", runPath)
        .replace("<weights>", weightsFile);

    const cmd = `"${wrapperPath}" -p "${pythonPath}" -s "${pythonScript}" -l "${runPath}/${log}" -o "${options}"`;

    return {
        cmd,
        runPath,
        jobName: `train_${PName}_${date}`,
        logFile: `${runPath}/sbatch.out`,
        errFile: `${runPath}/${errFile}`,
        PName,
        Admin,
    };
}

module.exports = { prepareTrainingSubmission };
