const fs = require("fs");
const path = require("path");
const { exec, execFile } = require("child_process");
const StreamZip = require("node-stream-zip");
const queries = require("../../queries/queries");
const rimraf = require("../../public/libraries/rimraf");
const { Client } = require("../../queries/client");
const { nextVideoFramePrefix, zeroPadExtractedFrames } = require("../../utils/videoFramePrefix");
const { parseFfprobeFrameTimes, buildFrameRows } = require("../../utils/videoFrameTimestamps");

// Deliberately not promisify(execFile) at module load time: several test
// suites mock `child_process` with only `{ exec }`, and promisifying an
// undefined `execFile` there would throw as soon as this module (pulled in
// by routes/api.js) is required, well before any test that actually
// exercises video upload runs.
function execFileAsync(file, args) {
    return new Promise((resolve, reject) => {
        execFile(file, args, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

const VIDEO_EXTENSIONS = [".mp4", ".avi", ".mov"];
function isVideoFileName(name) {
    const lower = name.toLowerCase();
    return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// readdirSync does not guarantee any particular order, and in practice
// returns names in filesystem/lexicographic order, not the numeric order of
// the frame numbers ffmpeg stamped on them (`prefix_1.jpg`, `prefix_2.jpg`,
// ..., `prefix_10.jpg`). Sorting numerically here keeps frames inserted into
// the DB -- and therefore their display order -- matching video playback
// order instead of "_1, _10, _11, ..., _2, _20, ...".
function sortFileNamesNaturally(names) {
    return names.sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
}

async function persistVideoFrameTimestamps(
    projectPath,
    videoPath,
    originalFileName,
    storedFileName,
    framePrefix,
    frameStep,
    extractedFrames,
) {
    let durationSec = null;

    try {
        const { stdout: durationStdout } = await execFileAsync("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            videoPath,
        ]);
        const parsedDuration = parseFloat(durationStdout);
        durationSec = Number.isFinite(parsedDuration) ? parsedDuration : null;
    } catch (err) {
        global.logger.error("ffprobe duration lookup failed: " + err);
    }

    let timestamps = [];

    try {
        const { stdout: frameStdout } = await execFileAsync("ffprobe", [
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "frame=pkt_pts_time,pkt_dts_time",
            "-of", "csv=p=0",
            videoPath,
        ]);
        timestamps = parseFfprobeFrameTimes(frameStdout);
    } catch (err) {
        global.logger.error("ffprobe frame timestamp lookup failed: " + err);
    }

    const frameRows = buildFrameRows(timestamps, frameStep, extractedFrames);

    try {
        const videoResult = await queries.project.createVideo(
            projectPath,
            originalFileName,
            storedFileName,
            framePrefix,
            frameStep,
            durationSec,
            null,
        );

        if (frameRows.length > 0) {
            await queries.project.insertFrames(projectPath, videoResult.lastID, frameRows);
        }
    } catch (err) {
        global.logger.error("Failed to persist video frame timestamps: " + err);
    }
}

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
        videosPath = projectPath + "/videos", // retained source videos, for playback in the video player
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
        fs.mkdirSync(videosPath);
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

            // A zip can mix images and videos (e.g. camera exports dropped
            // straight into one archive). Pull any videos out and run them
            // through ffmpeg first so their extracted frames land in
            // imagesPath alongside the archive's images before the loop
            // below adds everything to the project -- otherwise the raw
            // video files would get added to the DB as if they were images.
            const extractedEntries = fs.readdirSync(imagesPath);
            const videoFiles = [];

            for (const entry of extractedEntries) {
                if (entry === "__MACOSX" || entry === "blob") {
                    continue;
                }

                if (entry.endsWith(".zip")) {
                    fs.unlink(imagesPath + "/" + entry, () => { });
                    continue;
                }

                if (isVideoFileName(entry)) {
                    videoFiles.push(entry);
                }
            }

            if (videoFiles.length > 0) {
                let frameStep = Number(frameRate);
                if (!Number.isFinite(frameStep) || frameStep <= 0) {
                    frameStep = 30;
                }
                frameStep = Math.round(frameStep);

                const usedFramePrefixes = new Set();

                for (const videoFile of videoFiles) {
                    const extractedVideoPath = imagesPath + "/" + videoFile;
                    const framePrefix = nextVideoFramePrefix(videoFile, usedFramePrefixes);
                    const storedFileName = framePrefix + path.extname(videoFile);
                    const videoPath = videosPath + "/" + storedFileName;
                    const outputPattern = imagesPath + "/" + framePrefix + "_%d.jpg";

                    fs.renameSync(extractedVideoPath, videoPath);

                    await execFileAsync("ffmpeg", [
                        "-y",
                        "-i", videoPath,
                        "-fps_mode", "passthrough",
                        "-vf", `select=not(mod(n\\,${frameStep}))`,
                        outputPattern,
                    ]);

                    const extractedFrames = zeroPadExtractedFrames(imagesPath, framePrefix);

                    await persistVideoFrameTimestamps(
                        projectPath,
                        videoPath,
                        videoFile,
                        storedFileName,
                        framePrefix,
                        frameStep,
                        extractedFrames,
                    );
                }
            }

            const files = sortFileNamesNaturally(fs.readdirSync(imagesPath));

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
        // A single <input> submits one file, but the API also accepts several
        // videos in one request (express-fileupload gives back an array in
        // that case) -- each gets its own frame prefix below so frame numbers
        // restarting at 1 per video never collide across videos. frame_rate
        // is submitted once per video, in the same order as upload_video, so
        // each video is split at the fps the user picked for it specifically.
        const uploadVideos = Array.isArray(uploadVideo) ? uploadVideo : [uploadVideo];
        const frameRates = Array.isArray(frameRate) ? frameRate : [frameRate];

        const usedFramePrefixes = new Set();

        try {
            for (let i = 0; i < uploadVideos.length; i++) {
                const video = uploadVideos[i];
                // fall back to the last rate provided if fewer rates than videos were sent
                const requestedFrameRate = frameRates[i] ?? frameRates[frameRates.length - 1];

                let frameStep = Number(requestedFrameRate);
                if (!Number.isFinite(frameStep) || frameStep <= 0) {
                    frameStep = 30;
                }
                frameStep = Math.round(frameStep);

                const framePrefix = nextVideoFramePrefix(video.name, usedFramePrefixes);
                const storedFileName = framePrefix + path.extname(video.name);
                // Uploaded straight into videosPath (not imagesPath) and retained
                // there so the video player can play it back afterward -- served by
                // the existing express.static mount, which already supports the
                // Range requests seeking needs.
                var videoPath = videosPath + "/" + storedFileName;

                await video.mv(videoPath);

                const outputPattern = imagesPath + "/" + framePrefix + "_%d.jpg";

                await execFileAsync("ffmpeg", [
                    "-y",
                    "-i", videoPath,
                    "-fps_mode", "passthrough",
                    "-vf", `select=not(mod(n\\,${frameStep}))`,
                    outputPattern,
                ]);

                const extractedFrames = zeroPadExtractedFrames(imagesPath, framePrefix);

                await persistVideoFrameTimestamps(
                    projectPath,
                    videoPath,
                    video.name,
                    storedFileName,
                    framePrefix,
                    frameStep,
                    extractedFrames,
                );
            }

            await cleanFiles();
        } catch (e) {
            global.logger.error("Error extracting video frames: " + e);
            return res.status(500).send("Error extracting video frames");
        }

        async function cleanFiles() {
            let files = sortFileNamesNaturally(fs.readdirSync(imagesPath));

            for (let i = 0; i < files.length; i++) {
                if (files[i] == "__MACOSX") {
                    continue;
                }

                if (isVideoFileName(files[i])) {
                    fs.unlink(imagesPath + "/" + files[i], () => { });
                    continue;
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
