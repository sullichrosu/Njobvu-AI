const queries = require("../../queries/queries");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const sizeOf = require("image-size").imageSize;

async function addYoloInferenceToDataset(req, res) {
    try {
        let PName = req.body.PName,
            Admin = req.body.Admin,
            runTimestamp = req.body.runTimestamp,
            user = req.cookies.Username,
            minConfidence = parseFloat(req.body.minConfidence) || 0.0;

        var publicPath = currentPath,
            mainPath = publicPath + "public/projects/",
            projectPath = mainPath + Admin + "-" + PName,
            imagesPath = projectPath + "/images",
            labelsPath = projectPath + "/labels",
            inferencePath = projectPath + "/inference",
            logsPath = inferencePath + "/logs",
            runPath = `${logsPath}/${runTimestamp}`,
            inferenceImagesPath = `${runPath}/images`,
            inferenceDetectionsCSV = `${runPath}/inference_detections.csv`;

        if (!fs.existsSync(runPath)) {
            return res.status(404).send("Inference run not found");
        }

        if (!fs.existsSync(inferenceDetectionsCSV)) {
            return res.status(404).send("No detections CSV found for this run");
        }

        if (!fs.existsSync(labelsPath)) {
            fs.mkdirSync(labelsPath, { recursive: true });
        }

        let existingClasses;

        try {
            existingClasses = await queries.project.getAllClasses(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error fetching classes");
        }

        const classIndexMap = {}; // name -> index  (for normal case)
        const classIndexByPosition = {}; // index -> name  (for fallback)

        existingClasses.rows.forEach((row, idx) => {
            classIndexMap[row.CName] = idx;
            classIndexByPosition[idx] = row.CName;
        });

        const detectionsByImage = {};

        let totalRows = 0;
        let passedConfidence = 0;
        let passedClassCheck = 0;

        await new Promise((resolve, reject) => {
            fs.createReadStream(inferenceDetectionsCSV)
                .pipe(csv())
                .on("data", (row) => {
                    totalRows++;
                    global.logger.debug("RAW ROW:", JSON.stringify(row));

                    const conf = parseFloat(row["Confidence"]);
                    global.logger.debug(`  conf parsed: ${conf}, minConfidence: ${minConfidence}, passes: ${conf >= minConfidence}`);
                    if (isNaN(conf) || conf < minConfidence) return;
                    passedConfidence++;

                    const className = row["Class"];
                    const rawClassId = parseInt(row["Class ID"]);

                    let classId = classIndexMap[className];

                    if (classId === undefined && !isNaN(rawClassId)) {
                        if (classIndexByPosition[rawClassId] !== undefined) {
                            classId = rawClassId;
                        }
                    }

                    global.logger.debug(`  class: ${className}, classId: ${classId}, map:`, JSON.stringify(classIndexMap));

                    // skip detections for classes not in this project
                    if (classId === undefined) return;
                    passedClassCheck++;

                    const imgName = row["Image Name"];
                    if (!detectionsByImage[imgName]) {
                        detectionsByImage[imgName] = [];
                    }

                    detectionsByImage[imgName].push({
                        classId,
                        xCenter: row["X Center"],
                        yCenter: row["Y Center"],
                        width: row["Width"],
                        height: row["Height"],
                        confidence: conf
                    });
                })
                .on("end", resolve)
                .on("error", reject);
        });
        global.logger.debug(`detectionsByImage keys:`, Object.keys(detectionsByImage));
        global.logger.debug(`classIndexMap:`, JSON.stringify(classIndexMap));

        let imagesCopied = 0;
        let labelFilesWritten = 0;
        const skipped = [];

        const currentLabels = await queries.project.getAllLabels(projectPath);
        let newMax;

        if (currentLabels.rows.length == 0) {
            newMax = 1;
        } else {
            const oldMax = await queries.project.getMaxLabelId(projectPath);

            newMax = oldMax.rows[0].LID + 1;
        }

        for (const [imgName, detections] of Object.entries(detectionsByImage)) {
            const srcInRawDir = path.join(runPath, "raw", imgName);
            const srcInImagesDir = path.join(inferenceImagesPath, imgName);
            const srcInRunDir = path.join(runPath, imgName);

            let srcImagePath;
            if (fs.existsSync(srcInRawDir)) {
                srcImagePath = srcInRawDir;
            } else if (fs.existsSync(srcInImagesDir)) {
                srcImagePath = srcInImagesDir;
            } else {
                srcImagePath = srcInRunDir;
            }

            if (!fs.existsSync(srcImagePath)) {
                skipped.push(imgName);
                continue;
            }

            const destImagePath = path.join(imagesPath, imgName);
            if (!fs.existsSync(destImagePath)) {
                fs.copyFileSync(srcImagePath, destImagePath);
                imagesCopied++;
                global.logger.info(`Copied ${imgName} to ${destImagePath}`)
            } else {
                global.logger.debug(`Image already exists at destination, skipping copy: ${destImagePath}`)
            }

            let imgWidth = 1;
            let imgHeight = 1;

            try {
                // Use the destination image to ensure we have the correct dimensions for the training set
                const buffer = fs.readFileSync(destImagePath);
                const dimensions = sizeOf(buffer);

                imgWidth = dimensions.width;
                imgHeight = dimensions.height;

                global.logger.debug(`Dimensions for ${imgName}: ${imgWidth}x${imgHeight}`);
            } catch (e) {
                global.logger.error(`Could not get dimensions for ${imgName}:`, e);
            }

            try {
                await queries.project.addImages(projectPath, imgName, 0, 0);
            } catch (dbErr) {
                global.logger.error(`Warning: could not register ${imgName} in DB:`, dbErr);
            }

            // write YOLO label file, one line per detection
            const labelFileName = path.parse(imgName).name + ".txt";
            const labelFilePath = path.join(labelsPath, labelFileName);

            const labelLines = detections.map(
                (d) => `${d.classId} ${d.xCenter} ${d.yCenter} ${d.width} ${d.height}`
            );

            const writeMode = fs.existsSync(labelFilePath) ? "a" : "w";
            fs.writeFileSync(labelFilePath, labelLines.join("\n") + "\n", { flag: writeMode });
            labelFilesWritten++;

            for (const det of detections) {
                const xCenter = parseFloat(det.xCenter) * imgWidth;
                const yCenter = parseFloat(det.yCenter) * imgHeight;
                const w = parseFloat(det.width) * imgWidth;
                const h = parseFloat(det.height) * imgHeight;

                const leftX = xCenter - w / 2;
                const topY = yCenter - h / 2;

                const className = classIndexByPosition[det.classId];
                if (!className) continue;

                const labelId = newMax++;

                try {
                    await queries.project.createLabel(
                        projectPath, labelId, className,
                        leftX, topY,
                        w,
                        h,
                        imgName
                    );
                } catch (labelErr) {
                    global.logger.error("Warning: could not insert label in DB", labelErr)
                }
            }
        }

        res.send({
            Success: true,
            imagesCopied,
            labelFilesWritten,
            skipped,
            message: `Added ${imagesCopied} images and ${labelFilesWritten} label files to dataset`
        });

    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error adding inference results to dataset");
    }
}

module.exports = addYoloInferenceToDataset;
