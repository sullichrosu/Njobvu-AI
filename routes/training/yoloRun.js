const { exec } = require("child_process");
const queries = require("../../queries/queries");
const path = require("path");
const fs = require("fs");
const probe = require("probe-image-size");
const os = require("os");
const sharp = require("sharp");

// Function to detect the best available device for YOLO training
async function detectBestDevice() {
    return new Promise((resolve) => {
        global.logger.debug("=== DETECTING BEST DEVICE ===");

        // Check system platform
        const platform = os.platform();
        const arch = os.arch();

        global.logger.debug(`System: ${platform} ${arch}`);

        // Create a test Python script to check available devices
        const deviceCheckScript = `
import sys
try:
    import torch
    print(f"PyTorch available: True")
    print(f"CUDA available: {torch.cuda.is_available()}")
    print(f"CUDA device count: {torch.cuda.device_count()}")
    
    // Check for MPS (Apple Silicon)
    mps_available = hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
    print(f"MPS available: {mps_available}")
    
    // Determine best device
    if torch.cuda.is_available() and torch.cuda.device_count() > 0:
        print("BEST_DEVICE:cuda")
    elif mps_available:
        print("BEST_DEVICE:mps") 
    else:
        print("BEST_DEVICE:cpu")
        
except ImportError:
    print("PyTorch not available")
    print("BEST_DEVICE:cpu")
except Exception as e:
    print(f"Error: {e}")
    print("BEST_DEVICE:cpu")
`;

        // Execute the device detection script
        exec(`python3 -c "${deviceCheckScript}"`, { timeout: 10000 }, (err, stdout, stderr) => {
            let bestDevice = "cpu"; // Default fallback

            if (err) {
                global.logger.debug("Device detection error:", err.message);
            } else if (stdout) {
                global.logger.debug("Device detection output:");
                global.logger.debug(stdout);

                // Extract the best device from output
                const lines = stdout.split('\n');
                const deviceLine = lines.find(line => line.startsWith('BEST_DEVICE:'));
                if (deviceLine) {
                    bestDevice = deviceLine.split(':')[1].trim();
                }
            }

            if (stderr) {
                global.logger.debug("Device detection stderr:", stderr);
            }

            global.logger.debug(`Selected device: ${bestDevice}`);
            resolve(bestDevice);
        });
    });
}


// Function to map device values to YOLO-compatible format
function mapDeviceForYolo(device) {
    switch (device) {
        case "mps":
            return "mps";
        case "cuda":
        case "gpu":
            return "0"; // Use first CUDA device
        case "0":
        case "1":
        case "2":
        case "3":
        case 0:
        case 1:
        case 2:
        case 3:
            return device.toString(); // Keep GPU index as string
        case "cpu":
        default:
            return "cpu";
    }
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function parseCoordinateList(value) {
    if (Array.isArray(value)) {
        return value
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item));
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

    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
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

    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos,
    };
}

function orderQuadrilateral(points) {
    if (points.length !== 4) {
        return points.slice();
    }

    const center = points.reduce(
        (acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }),
        { x: 0, y: 0 },
    );

    const ordered = points
        .map((point) => ({
            ...point,
            angle: Math.atan2(point.y - center.y, point.x - center.x),
        }))
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
        const segmentPoints = normalizePoints(
            polygonPoints.length >= 3 ? polygonPoints : getRectanglePoints(label),
            imgW,
            imgH,
        );

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

async function yoloRun(req, res) {
    var date = Date.now();

    var PName = req.body.PName,
        Admin = req.body.Admin,
        user = req.cookies.Username,
        darknetPath = req.body.yolovx_path,
        yolovxPath = req.body.yolovx_path,
        log = `${date}.log`,
        trainDataPer = req.body.TrainingPercent,
        batch = req.body.batch,
        subdiv = req.body.subdiv,
        width = req.body.width,
        height = req.body.height,
        yoloVersion = req.body.yolo_version,
        yoloTask = req.body.yolo_task,
        yoloMode = req.body.yolo_mode,
        epochs = req.body.epochs,
        imgsz = req.body.imgsz,
        requestedDevice = req.body.device, // Original requested device
        options = req.body.options,
        weightName = req.body.weights;
    device = req.body.device;
    var errFile = `${date}-error.log`;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + Admin + "-" + PName, // $LABELING_TOOL_PATH/public/projects/project_name
        imagesPath = projectPath + "/images", // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = mainPath + user + "_Downloads",
        trainingPath = projectPath + "/training",
        logsPath = trainingPath + "/logs",
        runPath = `${logsPath}/${date}`,
        classesPath = runPath + "/coco_classes.yaml",
        weightPath = trainingPath + "/weights/" + weightName,
        yoloScript = publicPath + "controllers/training/datatovalues.py",
        wrapperPath =
            publicPath + "controllers/training/train_data_from_project.py";

    if (!fs.existsSync(runPath)) {
        fs.mkdirSync(runPath);
    }

    fs.writeFile(`${runPath}/${log}`, "", (err) => {
        if (err) throw err;
    });

    cfgTempPath = publicPath + "controllers/training/cfgTemplate.txt";
    cfgTemp = runPath + "/cfgTemplate.txt";
    fs.copyFile(cfgTempPath, cfgTemp, (err) => {
        if (err) {
            global.logger.error(err);
        }
    });

    dataTempPath = publicPath + "controllers/training/dataTemplate.txt";
    dataTemp = runPath + "/dataTemplate.txt";
    fs.copyFile(dataTempPath, dataTemp, (err) => {
        if (err) {
            global.logger.error(err);
        }
    });

    darknetCfgScript = runPath + "/datatovalues.py";
    if (!fs.existsSync(darknetCfgScript)) {
        fs.copyFile(yoloScript, darknetCfgScript, (err) => {
            if (err) {
                global.logger.error(err);
            }
        });
    }

    // Get images and classes for both detect and classify tasks
    let existingImages;
    let existingClasses;

    try {
        existingImages = await queries.project.getAllImages(projectPath);
        existingClasses = await queries.project.getAllClasses(projectPath);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error fetching classes");
    }

    if (["detect", "segment", "obb"].includes(yoloTask)) {
        project = `${Admin}-${PName}`;

        let absDarknetProjectPath = runPath;
        let absDarknetImagesPath = path.join(absDarknetProjectPath, "images");
        let absDarknetImagesTrain = path.join(absDarknetImagesPath, "train");
        let absDarknetImagesVal = path.join(absDarknetImagesPath, "val");
        let absDarknetLabelsPath = path.join(absDarknetProjectPath, "labels");
        let absDarknetLabelsTrain = path.join(absDarknetLabelsPath, "train");
        let absDarknetLabelsVal = path.join(absDarknetLabelsPath, "val");

        if (!fs.existsSync(absDarknetImagesPath)) {
            fs.mkdirSync(absDarknetImagesPath, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            fs.mkdirSync(absDarknetImagesTrain, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            fs.mkdirSync(absDarknetImagesVal, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            fs.mkdirSync(absDarknetLabelsPath, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            fs.mkdirSync(absDarknetLabelsTrain, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            fs.mkdirSync(absDarknetLabelsVal, (err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
        }

        var cnames = [];
        try {
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error finding classes");
        }

        for (var i = 0; i < existingClasses.rows.length; i++) {
            cnames.push(existingClasses.rows[i].CName);
        }
        var dictImagesLabels = {};

        for (var i = 0; i < existingImages.rows.length; i++) {
            var img = fs.readFileSync(
                `${imagesPath}/${existingImages.rows[i].IName}`,
            ),
                imgData = probe.sync(img),
                imgW = imgData.width,
                imgH = imgData.height;

            const imageLabels = await queries.project.getLabelsForImageName(
                projectPath,
                existingImages.rows[i].IName,
            );

            for (var j = 0; j < imageLabels.rows.length; j++) {
                const classId = cnames.indexOf(imageLabels.rows[j].CName);
                if (classId < 0) {
                    continue;
                }

                const labelLine = formatYoloLabelForTask(
                    imageLabels.rows[j],
                    classId,
                    imgW,
                    imgH,
                    yoloTask,
                );

                if (!labelLine) {
                    console.warn(
                        `Skipping unsupported ${yoloTask} label ${imageLabels.rows[j].LID} for ${existingImages.rows[i].IName}`,
                    );
                    continue;
                }

                if (
                    dictImagesLabels[existingImages.rows[i].IName] == undefined
                ) {
                    dictImagesLabels[existingImages.rows[i].IName] =
                        `${labelLine}\n`;
                } else {
                    dictImagesLabels[existingImages.rows[i].IName] +=
                        `${labelLine}\n`;
                }
            }
            if (imageLabels.rows.length == 0) {
                dictImagesLabels[existingImages.rows[i].IName] = "";
            }
        }

        for (var key in dictImagesLabels) {
            // remove_dot_ext = key.split(".")[0]
            removeDotExt = path.parse(key).name;
            fs.writeFileSync(
                `${imagesPath}/${removeDotExt}.txt`,
                dictImagesLabels[key],
                (err) => {
                    if (err) throw err;
                },
            );
        }

        var dictImagesCount = existingImages.rows.length;

        var trainDataImageSplit = Math.round(
            (trainDataPer / 100) * dictImagesCount,
        );

        for (let i = 0; i < existingImages.rows.length; i++) {
            var filename = existingImages.rows[i].IName.substr(
                0,
                existingImages.rows[i].IName.lastIndexOf("."),
            );

            var labelFile = filename + ".txt";

            let absDarknetOrgImagesPath = path.join(
                imagesPath,
                existingImages.rows[i].IName,
            );

            let absDarknetOrgLabelsPath = path.join(imagesPath, labelFile);

            let absDarknetTrainImagesPath = path.join(
                absDarknetImagesTrain,
                existingImages.rows[i].IName,
            );

            let absDarknetTrainLabelsPath = path.join(
                absDarknetLabelsTrain,
                labelFile,
            );

            if (i < trainDataImageSplit) {
                try {
                    await fs.promises.symlink(
                        absDarknetOrgImagesPath,
                        absDarknetTrainImagesPath,
                        "file"
                    );
                } catch (err) {
                    global.logger.debug("Error creating image training symlink:", err);
                }

                try {
                    await fs.promises.symlink(
                        absDarknetOrgLabelsPath,
                        absDarknetTrainLabelsPath,
                        "file"
                    );
                } catch (err) {
                    global.logger.debug("Error creating label training symlink:", err);
                }
            } else {
                let absDarknetValImagesPath = path.join(
                    absDarknetImagesVal,
                    existingImages.rows[i].IName,
                );
                let absDarknetValLabelsPath = path.join(
                    absDarknetLabelsVal,
                    labelFile,
                );

                try {
                    await fs.promises.symlink(
                        absDarknetOrgImagesPath,
                        absDarknetValImagesPath,
                        "file"
                    );
                } catch (err) {
                    global.logger.debug("Error creating image validation symlink:", err);
                }

                try {
                    await fs.promises.symlink(
                        absDarknetOrgLabelsPath,
                        absDarknetValLabelsPath,
                        "file"
                    );
                } catch (err) {
                    global.logger.debug("Error creating label validation symlink:", err);
                }
            }
        }

        ///////////////////Create symbolic link from darknet to run///////////////////////////////
        global.logger.debug(`all path training path: ${trainingPath}, weightname: ${weightName}`);

        absWeightProjectPath = path.join(
            trainingPath,
            "logs",
            date.toString(),
            weightName,
        );

        if (!fs.existsSync(absWeightProjectPath)) {
            try {
                await fs.promises.symlink(weightPath, absWeightProjectPath, "file");
            } catch (err) {
                global.logger.debug("Error creating symlink:", err);
            }
        }

        var classes = "# Train/val/test sets\n";
        classes = classes + "path: " + runPath + "\n";
        classes = classes + "train: " + absDarknetImagesTrain + "\n";
        classes = classes + "val: " + absDarknetImagesVal + "\n";
        classes = classes + "test: \n";
        classes = classes + "\n# Classes (COCO classes)\n";
        classes = classes + "names:\n";

        for (var i = 0; i < existingClasses.rows.length; i++) {
            classes =
                classes +
                "  " +
                i +
                ": " +
                existingClasses.rows[i].CName +
                "\n";
        }

        fs.writeFileSync(classesPath, classes, (err) => {
            if (err) throw err;
        });
    } else if (yoloTask == "classify") {
        // if its classify
        // train val directories
        // for the secific project create the directories of all the labels
        // based on the speciic labels crop it
        const cropImage = async (sourcePath, targetPath, x_center_abs, y_center_abs, width_abs, height_abs, imageWidth, imageHeight) => {
            const x1 = Math.floor(x_center_abs - width_abs / 2);
            const y1 = Math.floor(y_center_abs - height_abs / 2);

            const cropLeft = Math.max(0, x1);
            const cropTop = Math.max(0, y1);
            const cropWidth = Math.max(1, Math.min(imageWidth - cropLeft, Math.floor(width_abs)));
            const cropHeight = Math.max(1, Math.min(imageHeight - cropTop, Math.floor(height_abs)));

            if (cropWidth <= 0 || cropHeight <= 0) {
                console.warn(`Skipping invalid crop for ${sourcePath}. Original absolute bbox: x=${x_center_abs}, y=${y_center_abs}, w=${width_abs}, h=${height_abs}. Resulting crop: left=${cropLeft}, top=${cropTop}, width=${cropWidth}, height=${cropHeight}.`);
                return false;
            }

            try {
                const cropOptions = {
                    left: Math.floor(cropLeft),
                    top: Math.floor(cropTop),
                    width: Math.floor(cropWidth),
                    height: Math.floor(cropHeight),
                };

                await sharp(sourcePath)
                    .extract(cropOptions)
                    .toFile(targetPath);
                global.logger.debug(`Image cropped successfully: ${targetPath}`);
                return true;
            } catch (err) {
                global.logger.error(`Error cropping image ${sourcePath} to ${targetPath}: ${err.message}`);
                return false;
            }
        };

        global.logger.debug("Preparing data for classification task...");

        const absDarknetClassificationDatasetRoot = runPath;
        const absDarknetClassificationTrainImagesDir = path.join(absDarknetClassificationDatasetRoot, "train");
        const absDarknetClassificationValImagesDir = path.join(absDarknetClassificationDatasetRoot, "val");

        try {
            await fs.promises.mkdir(absDarknetClassificationTrainImagesDir, { recursive: true });
            await fs.promises.mkdir(absDarknetClassificationValImagesDir, { recursive: true });
            global.logger.debug(`Created base classification directories: ${absDarknetClassificationTrainImagesDir}, ${absDarknetClassificationValImagesDir}`);
        } catch (err) {
            global.logger.error("Error creating base classification train/val directories:", err);
            return res.status(500).send("Error setting up classification directories.");
        }

        const trainDataImageSplit = Math.round((trainDataPer / 100) * existingImages.rows.length);
        const shuffledImages = existingImages.rows.sort(() => 0.5 - Math.random());

        for (let i = 0; i < shuffledImages.length; i++) {
            const image = shuffledImages[i];
            const sourceImagePath = path.join(imagesPath, image.IName);
            const isTrain = i < trainDataImageSplit;

            const targetBaseDir = isTrain
                ? absDarknetClassificationTrainImagesDir
                : absDarknetClassificationValImagesDir;

            try {
                const imageMetadata = await sharp(sourceImagePath).metadata();
                const originalWidth = imageMetadata.width;
                const originalHeight = imageMetadata.height;

                if (!originalWidth || !originalHeight) {
                    console.warn(`Could not get dimensions for image ${image.IName}, skipping.`);
                    continue;
                }

                const imageLabelsResult = await queries.project.getLabelsForImageName(projectPath, image.IName);
                const imageLabels = imageLabelsResult.rows;

                if (imageLabels.length === 0) {
                    console.warn(`Image ${image.IName} has no labels, skipping for classification training.`);
                    continue;
                }

                let croppedCount = 0;
                for (const label of imageLabels) {
                    const className = label.CName;
                    if (!className) {
                        console.warn(`Label for image ${image.IName} has no class name, skipping.`);
                        continue;
                    }

                    const classTargetDir = path.join(targetBaseDir, className);
                    await fs.promises.mkdir(classTargetDir, { recursive: true });

                    const croppedImageName = `${path.parse(image.IName).name}_crop_${label.LID}${path.parse(image.IName).ext}`;
                    const targetCroppedImagePath = path.join(classTargetDir, croppedImageName);

                    global.logger.debug(`Debug label values for label ID ${label.LID} in image ${image.IName}:`);
                    global.logger.debug(`  label.X: ${label.X} (Type: ${typeof label.X})`);
                    global.logger.debug(`  label.Y: ${label.Y} (Type: ${typeof label.Y})`);
                    global.logger.debug(`  label.W: ${label.W} (Type: ${typeof label.W})`);
                    global.logger.debug(`  label.H: ${label.W} (Type: ${typeof label.W})`);

                    const x_center_abs = label.X;
                    const y_center_abs = label.Y;
                    const width_abs = label.W;
                    const height_abs = label.H;

                    global.logger.debug(`  Assigned x_center_abs: ${x_center_abs} (Type: ${typeof x_center_abs})`);
                    global.logger.debug(`  Assigned y_center_abs: ${y_center_abs} (Type: ${typeof y_center_abs})`);
                    global.logger.debug(`  Assigned width_abs: ${width_abs} (Type: ${typeof width_abs})`);
                    global.logger.debug(`  Assigned height_abs: ${height_abs} (Type: ${typeof height_abs})`);

                    const didCrop = await cropImage(
                        sourceImagePath,
                        targetCroppedImagePath,
                        x_center_abs, y_center_abs, width_abs, height_abs,
                        originalWidth, originalHeight
                    );

                    if (didCrop) {
                        croppedCount++;
                    } else {
                        global.logger.error(`Failed to crop and save for label ${label.LID} in image ${image.IName}`);
                    }
                }
                if (croppedCount === 0) {
                    console.warn(`No valid crops generated for image ${image.IName}.`);
                }

            } catch (err) {
                global.logger.error(`Error processing image ${image.IName} for classification:`, err);
            }
        }

        var classificationDataYamlContent = "# Ultralytics YOLOv8 Classification Dataset\n";
        classificationDataYamlContent += `path: ${absDarknetClassificationDatasetRoot}\n`;
        classificationDataYamlContent += `train: train\n`;
        classificationDataYamlContent += `val: val\n`;
        classificationDataYamlContent += `test: \n\n`;

        classificationDataYamlContent += "names:\n";
        for (var i = 0; i < existingClasses.rows.length; i++) {
            classificationDataYamlContent += `  ${i}: ${existingClasses.rows[i].CName}\n`;
        }

        try {
            await fs.promises.writeFile(classesPath, classificationDataYamlContent);
            global.logger.debug("Done writing YOLO Classification Data YAML file (data.yaml)");
        } catch (err) {
            global.logger.error("Error writing YOLO Classification Data YAML file:", err);
            return res.status(500).send("Error generating classification data file.");
        }
    }

    let absDarknetProjectPath = runPath;
    let absDarknetProjectRun = absDarknetProjectPath;

    darknetProjectRun = runPath;
    darknetImagesPath = path.join(absDarknetProjectPath, "images");
    darknetLabelsPath = path.join(absDarknetProjectPath, "labels");

    var cmd = "";

    if (yoloMode == "train") {
        cmd = `python3 ${yoloScript} -d ${runPath} -t ${yoloTask} -m ${yoloMode} -i ${darknetImagesPath} -n ${classesPath} -p ${trainDataPer} -l ${absDarknetProjectRun}/${log} -f ${darknetPath} -w ${weightPath} -b ${batch} -s ${subdiv} -x ${width} -y ${height} -v ${yoloVersion} -e ${epochs} -I ${imgsz} -D ${device} -o "${options}"`;
    } else {
        cmd = `python3 --version`;
    }

    global.logger.debug(cmd);

    fs.appendFile(`${absDarknetProjectRun}/${log}`, `${cmd}\n\n`, (err) => {
        if (err) global.logger.debug("Error writing initial command to log:", err);
    });

    var success = "";
    var error = "";

    global.logger.debug("=== STARTING PYTHON SCRIPT ===");

    fs.writeFileSync(`${absDarknetProjectRun}/${log}`, cmd);

    exec(cmd, { maxBuffer: 1024 * 1024 * 1024 * configFile["training_max_buffer_size"] }, (err, stdout, stderr) => {
        if (stdout) {
            global.logger.debug("STDOUT:", stdout);
            fs.appendFile(`${absDarknetProjectRun}/${log}`, stdout, (err) => {
                if (err) global.logger.debug("Error writing stdout to log:", err);
            });
        }
        if (err) {
            global.logger.error(err);
            global.logger.debug(`This is the error: ${err.message}`);

            if (err.message != "stdout maxBuffer length exceeded") {
                success = err.message;

                fs.writeFile(
                    `${absDarknetProjectRun}/${errFile}`,
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
                    `${absDarknetProjectRun}/${errFile}`,
                    stderr,
                    (err) => {
                        if (err) throw err;
                    },
                );
            }
        }

        fs.writeFileSync(`${runPath}/done.log`, success);
    });



    // exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
    //     console.log("=== PYTHON SCRIPT COMPLETED ===");

    //     if (stdout) {
    //         console.log("STDOUT:", stdout);
    //         fs.appendFile(`${absDarknetProjectRun}/${log}`, stdout, (err) => {
    //             if (err) console.log("Error writing stdout to log:", err);
    //         });
    //     }
    //     if (stderr) {
    //         console.log("STDERR:", stderr);
    //         fs.appendFile(`${absDarknetProjectRun}/${log}`, stderr, (err) => {
    //             if (err) console.log("Error writing stderr to log:", err);
    //         });
    //     }

    //     if (err) {
    //         console.log(`Python script error: ${err.message}`);
    //         error = err.message;
    //         fs.writeFile(
    //             `${darknetProjectRun}/${errFile}`,
    //             error,
    //             (err) => {
    //                 if (err) throw err;
    //             },
    //         );
    //     } else {
    //         success = "Training completed successfully";
    //     }

    //     fs.writeFile(`${runPath}/done.log`, success || "Process completed", (err) => {
    //         if (err) throw err;
    //     });
    // });
    res.send({ Success: `YOLO Training Started` });
}

module.exports = yoloRun;
