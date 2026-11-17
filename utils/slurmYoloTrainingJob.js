const path = require("path");
const fs = require("fs");
const queries = require("../queries/queries");
const config = require("./config");
const formatRunOptionsHeader = require("./formatRunOptionsHeader");
const { ensureTrainingImagesLocal } = require("./jitTrainingImages");

// --- Label geometry helpers, mirrored from routes/training/yoloRun.js so the
// Slurm-submitted dataset matches byte-for-byte what the local `exec` path
// would have produced for the same request. routes/training/yoloRun.js is
// left untouched (strangler pattern), so these are intentionally duplicated
// rather than imported from it.

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function parseCoordinateList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    }

    if (typeof value !== "string") {
        return [];
    }

    return value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
}

function getStoredPolygonPoints(label) {
    const xs = parseCoordinateList(label.X);
    const ys = parseCoordinateList(label.Y);

    if (xs.length < 3 || xs.length !== ys.length) {
        return [];
    }

    return xs.map((x, idx) => ({ x, y: ys[idx] }));
}

function getRectanglePoints(label) {
    const left = Number(label.X);
    const top = Number(label.Y);
    const width = Number(label.W);
    const height = Number(label.H);

    if (![left, top, width, height].every(Number.isFinite) || width < 0 || height < 0) {
        return [];
    }

    return [
        { x: left, y: top },
        { x: left + width, y: top },
        { x: left + width, y: top + height },
        { x: left, y: top + height },
    ];
}

function getLabelPolygonPoints(label) {
    const polygonPoints = getStoredPolygonPoints(label);
    if (polygonPoints.length >= 3) {
        return polygonPoints;
    }

    return getRectanglePoints(label);
}

function normalizePoints(points, imgW, imgH) {
    if (!imgW || !imgH) {
        return [];
    }

    return points.map((point) => ({
        x: clamp01(point.x / imgW),
        y: clamp01(point.y / imgH),
    }));
}

function polygonToBoundingBox(points) {
    if (!points.length) {
        return null;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function getConvexHull(points) {
    if (points.length <= 1) {
        return points.slice();
    }

    const sortedPoints = points
        .map((point) => ({ x: point.x, y: point.y }))
        .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

    const lower = [];
    for (const point of sortedPoints) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper = [];
    for (let idx = sortedPoints.length - 1; idx >= 0; idx--) {
        const point = sortedPoints[idx];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
}

function rotatePoint(point, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function orderQuadrilateral(points) {
    if (points.length !== 4) {
        return points.slice();
    }

    const center = points.reduce((acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }), { x: 0, y: 0 });

    const ordered = points
        .map((point) => ({ ...point, angle: Math.atan2(point.y - center.y, point.x - center.x) }))
        .sort((a, b) => a.angle - b.angle)
        .map(({ x, y }) => ({ x, y }));

    let startIndex = 0;
    let bestScore = Infinity;
    for (let idx = 0; idx < ordered.length; idx++) {
        const score = ordered[idx].x + ordered[idx].y;
        if (score < bestScore) {
            bestScore = score;
            startIndex = idx;
        }
    }

    return ordered.slice(startIndex).concat(ordered.slice(0, startIndex));
}

function getMinimumAreaRectangle(points) {
    if (points.length === 0) {
        return [];
    }

    if (points.length <= 2) {
        return getRectanglePoints({
            X: points[0]?.x ?? 0,
            Y: points[0]?.y ?? 0,
            W: Math.max(1, (points[1]?.x ?? points[0]?.x ?? 0) - (points[0]?.x ?? 0)),
            H: Math.max(1, (points[1]?.y ?? points[0]?.y ?? 0) - (points[0]?.y ?? 0)),
        });
    }

    const hull = getConvexHull(points);
    if (hull.length === 4) {
        return orderQuadrilateral(hull);
    }

    let bestRectangle = null;
    let bestArea = Infinity;

    for (let idx = 0; idx < hull.length; idx++) {
        const current = hull[idx];
        const next = hull[(idx + 1) % hull.length];
        const angle = -Math.atan2(next.y - current.y, next.x - current.x);
        const rotated = hull.map((point) => rotatePoint(point, angle));
        const xs = rotated.map((point) => point.x);
        const ys = rotated.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const area = (maxX - minX) * (maxY - minY);

        if (area < bestArea) {
            bestArea = area;
            const rect = [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY },
            ].map((point) => rotatePoint(point, -angle));
            bestRectangle = orderQuadrilateral(rect);
        }
    }

    return bestRectangle || [];
}

function formatYoloLabelForTask(label, classId, imgW, imgH, task) {
    const polygonPoints = getLabelPolygonPoints(label);
    const bboxSource = polygonPoints.length ? polygonPoints : getRectanglePoints(label);
    const bbox = polygonToBoundingBox(bboxSource);

    if (!bbox) {
        return null;
    }

    if (task === "segment") {
        const segmentPoints = normalizePoints(polygonPoints.length >= 3 ? polygonPoints : getRectanglePoints(label), imgW, imgH);

        if (segmentPoints.length < 3) {
            return null;
        }

        return `${classId} ${segmentPoints.map((point) => `${point.x} ${point.y}`).join(" ")}`;
    }

    if (task === "obb") {
        const obbPoints = polygonPoints.length === 4
            ? orderQuadrilateral(polygonPoints)
            : getMinimumAreaRectangle(polygonPoints.length ? polygonPoints : getRectanglePoints(label));
        const normalizedPoints = normalizePoints(obbPoints, imgW, imgH);

        if (normalizedPoints.length !== 4) {
            return null;
        }

        return `${classId} ${normalizedPoints.map((point) => `${point.x} ${point.y}`).join(" ")}`;
    }

    const centerX = clamp01((bbox.minX + bbox.width / 2) / imgW);
    const centerY = clamp01((bbox.minY + bbox.height / 2) / imgH);
    const width = clamp01(bbox.width / imgW);
    const height = clamp01(bbox.height / imgH);

    return `${classId} ${centerX} ${centerY} ${width} ${height}`;
}

function parseSelectedClasses(input) {
    if (!input) return null;
    if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean);
    if (typeof input === "string") {
        try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
        } catch (e) { /* fall through to comma-split */ }
        return input.split(",").map((s) => String(s).trim()).filter(Boolean);
    }
    return null;
}

// Mirrors the detect/segment/obb branch of routes/training/yoloRun.js:
// writes YOLO-format label .txt files next to each image, then symlinks
// each image/label pair into train/val/test split directories, and writes
// the Ultralytics data.yaml (classesPath).
async function prepareDetectionDataset(ctx) {
    const probe = global.probe || require("probe-image-size");

    const absDarknetImagesPath = path.join(ctx.runPath, "images");
    const absDarknetImagesTrain = path.join(absDarknetImagesPath, "train");
    const absDarknetImagesVal = path.join(absDarknetImagesPath, "val");
    const absDarknetImagesTest = path.join(absDarknetImagesPath, "test");
    const absDarknetLabelsPath = path.join(ctx.runPath, "labels");
    const absDarknetLabelsTrain = path.join(absDarknetLabelsPath, "train");
    const absDarknetLabelsVal = path.join(absDarknetLabelsPath, "val");
    const absDarknetLabelsTest = path.join(absDarknetLabelsPath, "test");

    [
        absDarknetImagesPath, absDarknetImagesTrain, absDarknetImagesVal, absDarknetImagesTest,
        absDarknetLabelsPath, absDarknetLabelsTrain, absDarknetLabelsVal, absDarknetLabelsTest,
    ].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    const cnames = ctx.existingClasses.rows.map((c) => c.CName);
    const dictImagesLabels = {};

    for (const image of ctx.targetImages) {
        const img = fs.readFileSync(path.join(ctx.imagesPath, image.IName));
        const imgData = probe.sync(img);
        const imgW = imgData.width;
        const imgH = imgData.height;

        const imageLabels = await queries.project.getLabelsForImageName(ctx.projectPath, image.IName);

        for (const label of imageLabels.rows) {
            const classId = cnames.indexOf(label.CName);
            if (classId < 0) {
                continue;
            }

            const labelLine = formatYoloLabelForTask(label, classId, imgW, imgH, ctx.yoloTask);
            if (!labelLine) {
                continue;
            }

            dictImagesLabels[image.IName] = (dictImagesLabels[image.IName] || "") + `${labelLine}\n`;
        }

        if (imageLabels.rows.length === 0) {
            dictImagesLabels[image.IName] = "";
        }
    }

    for (const key of Object.keys(dictImagesLabels)) {
        const removeDotExt = path.parse(key).name;
        fs.writeFileSync(`${ctx.imagesPath}/${removeDotExt}.txt`, dictImagesLabels[key]);
    }

    for (let i = 0; i < ctx.targetImages.length; i++) {
        const imageName = ctx.targetImages[i].IName;
        const filename = imageName.substr(0, imageName.lastIndexOf("."));
        const labelFile = `${filename}.txt`;

        const absDarknetOrgImagesPath = path.join(ctx.imagesPath, imageName);
        const absDarknetOrgLabelsPath = path.join(ctx.imagesPath, labelFile);

        let targetImgDir;
        let targetLblDir;
        if (i < ctx.trainDataImageSplit) {
            targetImgDir = absDarknetImagesTrain;
            targetLblDir = absDarknetLabelsTrain;
        } else if (i < ctx.trainDataImageSplit + ctx.valDataImageSplit) {
            targetImgDir = absDarknetImagesVal;
            targetLblDir = absDarknetLabelsVal;
        } else {
            targetImgDir = absDarknetImagesTest;
            targetLblDir = absDarknetLabelsTest;
        }

        try {
            await fs.promises.symlink(absDarknetOrgImagesPath, path.join(targetImgDir, imageName), "file");
        } catch (err) {
            global.logger && global.logger.debug && global.logger.debug("Error creating image symlink:", err);
        }

        try {
            await fs.promises.symlink(absDarknetOrgLabelsPath, path.join(targetLblDir, labelFile), "file");
        } catch (err) {
            global.logger && global.logger.debug && global.logger.debug("Error creating label symlink:", err);
        }
    }

    const absWeightProjectPath = path.join(ctx.trainingPath, "logs", ctx.date.toString(), ctx.weightName);
    if (!fs.existsSync(absWeightProjectPath)) {
        try {
            await fs.promises.symlink(ctx.weightPath, absWeightProjectPath, "file");
        } catch (err) {
            global.logger && global.logger.debug && global.logger.debug("Error creating weight symlink:", err);
        }
    }

    let classes = "# Train/val/test sets\n";
    classes += `path: ${ctx.runPath}\n`;
    classes += `train: ${absDarknetImagesTrain}\n`;
    classes += `val: ${absDarknetImagesVal}\n`;
    classes += `test: ${ctx.testDataImageSplit > 0 ? absDarknetImagesTest : ""}\n`;
    classes += "\n# Classes (COCO classes)\n";
    classes += "names:\n";

    ctx.existingClasses.rows.forEach((c, i) => {
        classes += `  ${i}: ${c.CName}\n`;
    });

    fs.writeFileSync(ctx.classesPath, classes);
}

// Mirrors the classify branch of routes/training/yoloRun.js: crops each
// labeled region out of its source image into per-class train/val/test
// folders and writes the classification data.yaml.
async function prepareClassificationDataset(ctx) {
    const sharp = global.sharp || require("sharp");

    const cropImage = async (sourcePath, targetPath, xCenterAbs, yCenterAbs, widthAbs, heightAbs, imageWidth, imageHeight) => {
        const x1 = Math.floor(xCenterAbs - widthAbs / 2);
        const y1 = Math.floor(yCenterAbs - heightAbs / 2);

        const cropLeft = Math.max(0, x1);
        const cropTop = Math.max(0, y1);
        const cropWidth = Math.max(1, Math.min(imageWidth - cropLeft, Math.floor(widthAbs)));
        const cropHeight = Math.max(1, Math.min(imageHeight - cropTop, Math.floor(heightAbs)));

        if (cropWidth <= 0 || cropHeight <= 0) {
            return false;
        }

        try {
            await sharp(sourcePath)
                .extract({ left: Math.floor(cropLeft), top: Math.floor(cropTop), width: Math.floor(cropWidth), height: Math.floor(cropHeight) })
                .toFile(targetPath);
            return true;
        } catch (err) {
            global.logger && global.logger.error && global.logger.error(`Error cropping image ${sourcePath} to ${targetPath}: ${err.message}`);
            return false;
        }
    };

    const trainDir = path.join(ctx.runPath, "train");
    const valDir = path.join(ctx.runPath, "val");
    const testDir = path.join(ctx.runPath, "test");

    await fs.promises.mkdir(trainDir, { recursive: true });
    await fs.promises.mkdir(valDir, { recursive: true });
    await fs.promises.mkdir(testDir, { recursive: true });

    const shuffledImages = ctx.targetImages.slice().sort(() => 0.5 - Math.random());

    for (let i = 0; i < shuffledImages.length; i++) {
        const image = shuffledImages[i];
        const sourceImagePath = path.join(ctx.imagesPath, image.IName);

        let targetBaseDir;
        if (i < ctx.trainDataImageSplit) {
            targetBaseDir = trainDir;
        } else if (i < ctx.trainDataImageSplit + ctx.valDataImageSplit) {
            targetBaseDir = valDir;
        } else {
            targetBaseDir = testDir;
        }

        try {
            const imageMetadata = await sharp(sourceImagePath).metadata();
            const originalWidth = imageMetadata.width;
            const originalHeight = imageMetadata.height;

            if (!originalWidth || !originalHeight) {
                continue;
            }

            const imageLabelsResult = await queries.project.getLabelsForImageName(ctx.projectPath, image.IName);
            const imageLabels = imageLabelsResult.rows;

            if (imageLabels.length === 0) {
                continue;
            }

            for (const label of imageLabels) {
                const className = label.CName;
                if (!className || (ctx.selectedClassesList && ctx.selectedClassesList.length > 0 && !ctx.selectedClassesList.includes(className))) {
                    continue;
                }

                const classTargetDir = path.join(targetBaseDir, className);
                await fs.promises.mkdir(classTargetDir, { recursive: true });

                const croppedImageName = `${path.parse(image.IName).name}_crop_${label.LID}${path.parse(image.IName).ext}`;
                const targetCroppedImagePath = path.join(classTargetDir, croppedImageName);

                await cropImage(sourceImagePath, targetCroppedImagePath, label.X, label.Y, label.W, label.H, originalWidth, originalHeight);
            }
        } catch (err) {
            global.logger && global.logger.error && global.logger.error(`Error processing image ${image.IName} for classification:`, err);
        }
    }

    let classificationDataYamlContent = "# Ultralytics YOLOv8 Classification Dataset\n";
    classificationDataYamlContent += `path: ${ctx.runPath}\n`;
    classificationDataYamlContent += "train: train\n";
    classificationDataYamlContent += "val: val\n";
    classificationDataYamlContent += `test: ${ctx.testDataImageSplit > 0 ? "test" : ""}\n\n`;
    classificationDataYamlContent += "names:\n";

    ctx.existingClasses.rows.forEach((c, i) => {
        classificationDataYamlContent += `  ${i}: ${c.CName}\n`;
    });

    fs.writeFileSync(ctx.classesPath, classificationDataYamlContent);
}

// Builds the same YOLO training run (dataset prep, flag-based command) that
// routes/training/yoloRun.js uses for its local `exec` launch, but stops
// short of running it - the caller submits it to Slurm via `sbatch` instead.
// This is a separate builder from utils/slurmTrainingJob.js because YOLO
// training builds a direct flag command into the YOLO script itself, not
// the CSV-export + wrapper-script shape the generic trainer uses.
//
// JIT-downloaded S3 images are left on disk on purpose, same rationale as
// utils/slurmTrainingJob.js: a Slurm job is still queued when this returns,
// so there's no safe "run is done" signal here yet to trigger cleanup.
async function prepareYoloTrainingSubmission(req) {
    const PName = req.body.PName,
        Admin = req.body.Admin,
        darknetPath = req.body.yolovx_path,
        batch = req.body.batch,
        subdiv = req.body.subdiv,
        width = req.body.width,
        height = req.body.height,
        yoloVersion = req.body.yolo_version,
        trainDataPer = req.body.TrainingPercent,
        epochs = req.body.epochs,
        imgsz = req.body.imgsz,
        device = req.body.device,
        options = req.body.options,
        weightName = req.body.weights;

    let yoloTask = req.body.yolo_task;

    if (weightName && (weightName.includes("-cls") || weightName.toLowerCase().includes("classify"))) {
        yoloTask = "classify";
    } else if (weightName && weightName.includes("-pose")) {
        yoloTask = "pose";
    } else if (weightName && weightName.includes("-seg")) {
        yoloTask = "segment";
    } else if (weightName && weightName.includes("-obb")) {
        yoloTask = "obb";
    } else if (!yoloTask) {
        yoloTask = "detect";
    }

    const yoloMode = req.body.yolo_mode || "train";

    if (!PName || !Admin || !darknetPath || !weightName) {
        const err = new Error("Missing required YOLO training job parameters (PName, Admin, yolovx_path, weights)");
        err.statusCode = 400;
        throw err;
    }

    if (yoloMode !== "train") {
        const err = new Error(`Unsupported yolo_mode "${yoloMode}" for Slurm training submission - expected "train"`);
        err.statusCode = 400;
        throw err;
    }

    const date = Date.now();
    const log = `${date}.log`;
    const errFile = `${date}-error.log`;

    const publicPath = global.currentPath || process.cwd() + "/",
        mainPath = publicPath + "public/projects/",
        projectPath = path.normalize(mainPath + Admin + "-" + PName),
        imagesPath = projectPath + "/images",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        runPath = `${logsPath}/${date}`,
        classesPath = `${runPath}/coco_classes.yaml`,
        weightPath = `${trainingPath}/weights/${weightName}`,
        yoloScript = `${publicPath}controllers/training/datatovalues.py`;

    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }

    if (!fs.existsSync(runPath)) {
        fs.mkdirSync(runPath);
    }

    fs.writeFileSync(`${runPath}/${log}`, "");

    try {
        fs.copyFileSync(yoloScript, `${runPath}/datatovalues.py`);
    } catch (err) {
        global.logger && global.logger.error && global.logger.error("Error copying datatovalues.py script snapshot:", err);
    }

    let existingImages;
    let existingClasses;

    try {
        existingImages = await queries.project.getAllImages(projectPath);
        existingClasses = await queries.project.getAllClasses(projectPath);
    } catch (err) {
        err.statusCode = err.statusCode || 500;
        throw err;
    }

    const selectedClassesList = parseSelectedClasses(req.body.selected_classes || req.body.selectedClasses);
    if (selectedClassesList && selectedClassesList.length > 0) {
        existingClasses.rows = existingClasses.rows.filter((c) => selectedClassesList.includes(c.CName));
    }

    let maxImages = parseInt(req.body.max_images || req.body.maxImages, 10);
    let targetImages = existingImages.rows;
    if (Number.isFinite(maxImages) && maxImages > 0 && maxImages < targetImages.length) {
        targetImages = targetImages.slice(0, maxImages);
    }

    try {
        await ensureTrainingImagesLocal(PName, Admin, projectPath, targetImages);
    } catch (err) {
        err.statusCode = err.statusCode || 500;
        throw err;
    }

    let trainPct = parseFloat(req.body.TrainingPercent || req.body.train_percent || 70);
    let valPct = parseFloat(req.body.ValPercent || req.body.val_percent);
    let testPct = parseFloat(req.body.TestPercent || req.body.test_percent);

    if (isNaN(valPct)) {
        valPct = Math.max(0, 100 - trainPct);
        testPct = 0;
    } else if (isNaN(testPct)) {
        testPct = Math.max(0, 100 - trainPct - valPct);
    }

    const totalPct = trainPct + valPct + testPct || 100;
    const dictImagesCount = targetImages.length;

    const trainDataImageSplit = Math.round((trainPct / totalPct) * dictImagesCount);
    const valDataImageSplit = Math.round((valPct / totalPct) * dictImagesCount);
    const testDataImageSplit = Math.max(0, dictImagesCount - trainDataImageSplit - valDataImageSplit);

    const datasetCtx = {
        runPath, imagesPath, classesPath, projectPath, trainingPath, date,
        targetImages, existingClasses, selectedClassesList,
        trainDataImageSplit, valDataImageSplit, testDataImageSplit,
        weightPath, weightName, yoloTask,
    };

    if (["detect", "segment", "obb"].includes(yoloTask)) {
        await prepareDetectionDataset(datasetCtx);
    } else if (yoloTask === "classify") {
        await prepareClassificationDataset(datasetCtx);
    }

    const darknetProjectRun = runPath;
    const darknetImagesPath = path.join(runPath, "images");

    // slurm_python_path (an interpreter provisioned on the HPC cluster
    // itself) wins over default_python_path when set - the local
    // workstation's interpreter has no reason to exist at that same path
    // on a compute node.
    const pythonBin = config["slurm_python_path"] || config["default_python_path"] || "python3";
    const cmd = `${pythonBin} ${yoloScript} -d ${runPath} -t ${yoloTask} -m ${yoloMode} -i ${darknetImagesPath} -n ${classesPath} -p ${trainDataPer} -l ${darknetProjectRun}/${log} -f ${darknetPath} -w ${weightPath} -b ${batch} -s ${subdiv} -x ${width} -y ${height} -v ${yoloVersion} -e ${epochs} -I ${imgsz} -D ${device} -o "${options}"`;

    const runOptionsHeader = formatRunOptionsHeader({
        project: PName,
        task: yoloTask,
        mode: yoloMode,
        yolo_version: yoloVersion,
        yolovx_path: darknetPath,
        training_percent: trainDataPer,
        val_percent: valPct,
        test_percent: testPct,
        selected_classes: selectedClassesList ? selectedClassesList.join(", ") : null,
        max_images: Number.isFinite(maxImages) ? maxImages : null,
        batch,
        subdiv,
        width,
        height,
        epochs,
        imgsz,
        device,
        options,
        weights: weightName,
        launch_target: "Slurm (HPC)",
    });

    fs.writeFileSync(`${runPath}/${log}`, `${runOptionsHeader}${cmd}\n\n`);

    return {
        command: cmd,
        runPath,
        jobName: `train_yolo_${PName}_${date}`,
        logFile: `${runPath}/sbatch.out`,
        errFile: `${runPath}/${errFile}`,
        PName,
        Admin,
    };
}

module.exports = { prepareYoloTrainingSubmission };
