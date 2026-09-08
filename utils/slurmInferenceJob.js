const path = require("path");
const fs = require("fs");
const queries = require("../queries/queries");
const config = require("./config");
const formatRunOptionsHeader = require("./formatRunOptionsHeader");
const { prepareInferenceDataset } = require("./inferenceDatasetPipeline");

const SUPPORTED_TYPES = ["yolo", "megadetector", "inception"];

function commonPaths(req) {
    const PName = req.body.PName,
        Admin = req.body.Admin;

    if (!PName || !Admin) {
        const err = new Error("Missing required inference job parameters (PName, Admin)");
        err.statusCode = 400;
        throw err;
    }

    const date = Date.now();
    const publicPath = global.currentPath || process.cwd() + "/",
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + Admin + "-" + PName,
        imagesPath = projectPath + "/images",
        trainingPath = projectPath + "/training",
        inferencePath = projectPath + "/inference",
        inferenceUploadPath = projectPath + "/inference/uploads/",
        logsPath = inferencePath + "/logs",
        runPath = `${logsPath}/${date}`;

    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }

    if (!fs.existsSync(runPath)) {
        fs.mkdirSync(runPath);
    }

    return { PName, Admin, date, publicPath, mainPath, projectPath, imagesPath, trainingPath, inferencePath, inferenceUploadPath, logsPath, runPath };
}

async function resolveInferenceFilePath(ctx, req) {
    const datasetResult = await prepareInferenceDataset({
        PName: ctx.PName,
        Admin: ctx.Admin,
        inference_file: req.body.inference_file,
        use_s3_bucket: req.body.use_s3_bucket || req.body.s3_bucket || req.body.inference_source === "s3",
        max_images: req.body.max_images || req.body.maxImages || req.body.limit,
        projectPath: ctx.projectPath,
        inferenceUploadPath: ctx.inferenceUploadPath,
    });

    let inferenceFilePath = datasetResult.inferenceFilePath || req.body.inference_file;

    if (!fs.existsSync(inferenceFilePath)) {
        const fallbackInferenceFilePath = path.join(ctx.inferenceUploadPath, inferenceFilePath);
        if (fs.existsSync(fallbackInferenceFilePath)) {
            inferenceFilePath = fallbackInferenceFilePath;
        }
    }

    return inferenceFilePath;
}

async function buildYoloSubmission(req) {
    const ctx = commonPaths(req);
    const probe = global.probe || require("probe-image-size");

    const log = `${ctx.date}.log`,
        errFile = `${ctx.date}-error.log`,
        yolovxPath = req.body.yolovx_path,
        yoloTask = req.body.yolo_task,
        weightName = req.body.weights,
        classesPath = ctx.runPath + "/coco_classes.yaml",
        weightPath = ctx.trainingPath + "/weights/" + weightName,
        yoloScript = ctx.publicPath + "controllers/inference/datatovalues.py";

    fs.writeFileSync(`${ctx.runPath}/${log}`, "");
    fs.writeFileSync(`${ctx.runPath}/type.txt`, "yolo");

    const ultralyticsCfgScript = ctx.runPath + "/datatovalues.py";
    if (!fs.existsSync(ultralyticsCfgScript)) {
        fs.copyFileSync(yoloScript, ultralyticsCfgScript);
    }

    let existingClasses;
    let existingImages;

    try {
        existingClasses = await queries.project.getAllClasses(ctx.projectPath);
        existingImages = await queries.project.getAllImages(ctx.projectPath);
    } catch (err) {
        err.statusCode = err.statusCode || 500;
        throw err;
    }

    const cnames = existingClasses.rows.map((c) => c.CName);
    fs.writeFileSync(classesPath, `names:\n${cnames.map((n) => `  - ${n}`).join("\n")}\n`);

    const dictImagesLabels = {};

    for (const image of existingImages.rows) {
        const imgPath = path.join(ctx.imagesPath, image.IName);
        if (!fs.existsSync(imgPath)) {
            continue;
        }

        const img = fs.readFileSync(imgPath);
        const imgData = probe.sync(img);
        const imgW = imgData.width,
            imgH = imgData.height;

        let existingLabels;
        try {
            existingLabels = await queries.project.getLabelsForImageName(ctx.projectPath, image.IName);
        } catch (err) {
            continue;
        }

        for (const label of existingLabels.rows) {
            const centerX = (label.X + label.W / 2) / imgW;
            const centerY = (label.Y + label.H / 2) / imgH;
            const line = `${cnames.indexOf(label.CName)} ${centerX} ${centerY} ${label.W / imgW} ${label.H / imgH}\n`;

            dictImagesLabels[image.IName] = (dictImagesLabels[image.IName] || "") + line;
        }

        if (existingLabels.rows.length === 0) {
            dictImagesLabels[image.IName] = "";
        }
    }

    for (const key of Object.keys(dictImagesLabels)) {
        const removeDotExt = path.parse(key).name;
        fs.writeFileSync(`${ctx.imagesPath}/${removeDotExt}.txt`, dictImagesLabels[key]);
    }

    const absWeightProjectPath = path.join(ctx.inferencePath, "logs", ctx.date.toString(), weightName);
    if (!fs.existsSync(absWeightProjectPath)) {
        fs.symlinkSync(weightPath, absWeightProjectPath, "file");
    }

    const inferenceFilePath = await resolveInferenceFilePath(ctx, req);

    const cmd = `${config["default_python_path"] || "python3"} ${yoloScript} -d ${ctx.runPath} -i ${inferenceFilePath} -n ${classesPath} -l ${ctx.runPath}/${log} -f ${yolovxPath} -w ${weightPath} -t ${yoloTask}`;

    const runOptionsHeader = formatRunOptionsHeader({
        project: ctx.PName,
        task: yoloTask,
        yolovx_path: yolovxPath,
        inference_file: req.body.inference_file,
        options: req.body.options,
        weights: weightName,
        launch_target: "Slurm (HPC)",
    });

    fs.writeFileSync(`${ctx.runPath}/${log}`, `${runOptionsHeader}${cmd}\n\n`);

    return { cmd, runPath: ctx.runPath, jobName: `inference_yolo_${ctx.PName}_${ctx.date}`, logFile: `${ctx.runPath}/sbatch.out`, errFile: `${ctx.runPath}/${errFile}`, PName: ctx.PName, Admin: ctx.Admin };
}

async function buildMegadetectorSubmission(req) {
    const ctx = commonPaths(req);

    const log = `${ctx.date}.log`,
        errFile = `${ctx.date}-error.log`,
        model = req.body.model || "MDV5A",
        threshold = req.body.threshold || "0.2",
        fps = req.body.fps || "1.0",
        megadetectorScript = ctx.publicPath + "controllers/inference/megadetector.py";

    fs.writeFileSync(`${ctx.runPath}/${log}`, "");
    fs.writeFileSync(`${ctx.runPath}/type.txt`, "megadetector");

    const megadetectorScriptCopyPath = ctx.runPath + "/megadetector.py";
    if (!fs.existsSync(megadetectorScriptCopyPath)) {
        fs.copyFileSync(megadetectorScript, megadetectorScriptCopyPath);
    }

    const inferenceFilePath = await resolveInferenceFilePath(ctx, req);

    const pythonPath = path.resolve(ctx.publicPath, config["default_python_path"]);
    const cmd = `"${pythonPath}" ${megadetectorScript} -i ${inferenceFilePath} -m ${model} -o ${ctx.runPath} -t ${threshold} -f ${fps}`;

    const runOptionsHeader = formatRunOptionsHeader({
        project: ctx.PName,
        model,
        inference_file: req.body.inference_file,
        threshold,
        fps,
        launch_target: "Slurm (HPC)",
    });

    fs.writeFileSync(`${ctx.runPath}/${log}`, `${runOptionsHeader}${cmd}\n\n`);

    return { cmd, runPath: ctx.runPath, jobName: `inference_megadetector_${ctx.PName}_${ctx.date}`, logFile: `${ctx.runPath}/sbatch.out`, errFile: `${ctx.runPath}/${errFile}`, PName: ctx.PName, Admin: ctx.Admin };
}

async function buildInceptionSubmission(req) {
    const ctx = commonPaths(req);

    const log = `${ctx.date}.log`,
        errFile = `${ctx.date}-error.log`,
        weightName = req.body.weights,
        topK = req.body.topK,
        usingImageNetClasses = req.body.using_imagenet_classes,
        weightPath = ctx.trainingPath + "/weights/" + weightName,
        inferenceScript = ctx.publicPath + "controllers/inference/inception.py";

    fs.writeFileSync(`${ctx.runPath}/${log}`, "");
    fs.writeFileSync(`${ctx.runPath}/type.txt`, "inception");

    const inferenceScriptCopyPath = ctx.runPath + "/inception.py";
    if (!fs.existsSync(inferenceScriptCopyPath)) {
        fs.copyFileSync(inferenceScript, inferenceScriptCopyPath);
    }

    const inferenceFilePath = await resolveInferenceFilePath(ctx, req);

    let existingClasses;
    try {
        existingClasses = await queries.project.getAllClasses(ctx.projectPath);
    } catch (err) {
        err.statusCode = err.statusCode || 500;
        throw err;
    }

    for (const cls of existingClasses.rows) {
        fs.appendFileSync(`${ctx.runPath}/classes.txt`, `${cls.CName}\n`);
    }

    const cmd = `python3 ${inferenceScript} -i ${inferenceFilePath} -n ${ctx.runPath}/classes.txt -w ${usingImageNetClasses ? "imagenet" : weightPath} -o ${ctx.runPath}/output -k ${topK}`;

    const runOptionsHeader = formatRunOptionsHeader({
        project: ctx.PName,
        inference_file: req.body.inference_file,
        weights: weightName,
        top_k: topK,
        using_imagenet_classes: usingImageNetClasses,
        launch_target: "Slurm (HPC)",
    });

    fs.writeFileSync(`${ctx.runPath}/${log}`, `${runOptionsHeader}${cmd}\n\n`);

    return { cmd, runPath: ctx.runPath, jobName: `inference_inception_${ctx.PName}_${ctx.date}`, logFile: `${ctx.runPath}/sbatch.out`, errFile: `${ctx.runPath}/${errFile}`, PName: ctx.PName, Admin: ctx.Admin };
}

// Builds the same inference run (dataset prep, wrapper command) that the
// corresponding routes/inference/*.js file uses for its local `exec`
// launch, but stops short of running it - the caller submits it to Slurm
// via `sbatch` instead. `inferenceType` selects which of the three
// inference pipelines (yolo / megadetector / inception) to mirror.
async function prepareInferenceSubmission(req) {
    const inferenceType = req.body.inference_type;

    if (!SUPPORTED_TYPES.includes(inferenceType)) {
        const err = new Error(`Unsupported inference_type "${inferenceType}" - expected one of: ${SUPPORTED_TYPES.join(", ")}`);
        err.statusCode = 400;
        throw err;
    }

    if (inferenceType === "yolo") {
        return buildYoloSubmission(req);
    }

    if (inferenceType === "megadetector") {
        return buildMegadetectorSubmission(req);
    }

    return buildInceptionSubmission(req);
}

module.exports = { prepareInferenceSubmission, SUPPORTED_TYPES };
