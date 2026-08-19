const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getProcessingPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }

    if (user === undefined) {
        return res.redirect("/");
    }

    let projects;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));
    } catch (err) {
        global.logger.error("Error loading processing page:", err);

        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    if (idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const trainingPath = path.join(projectDir, "training");
    const weightsPath = path.join(trainingPath, "weights");
    const inferencePath = path.join(projectDir, "inference");
    const inferenceUploadPath = path.join(inferencePath, "uploads");
    const logPath = path.join(trainingPath, "logs/");
    const trnLogPath = path.join(trainingPath, "logs/");
    const infLogPath = path.join(inferencePath, "logs/");
    const infUploadPath = path.join(inferencePath, "uploads/");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");
    const darknetPathFile = path.join(trainingPath, "darknetPaths.txt");
    const weightsOutput = path.join(trainingPath, "train", "weights", "best.pt");

    const fsObj = global.fs || fs;

    if (!fsObj.existsSync(trainingPath)) {
        try {
            fsObj.mkdirSync(trainingPath, { recursive: true });
            fsObj.mkdirSync(logPath, { recursive: true });
            fsObj.mkdirSync(trnLogPath, { recursive: true });
            fsObj.mkdirSync(pythonPath, { recursive: true });
            fsObj.mkdirSync(weightsPath, { recursive: true });
            fsObj.writeFileSync(pythonPathFile, "");
            fsObj.writeFileSync(darknetPathFile, "");
        } catch (e) { }
    }

    if (!fsObj.existsSync(inferencePath)) {
        try { fsObj.mkdirSync(inferencePath, { recursive: true }); } catch (e) { }
    }

    if (!fsObj.existsSync(infLogPath)) {
        try { fsObj.mkdirSync(infLogPath, { recursive: true }); } catch (e) { }
    }

    if (!fsObj.existsSync(infUploadPath)) {
        try { fsObj.mkdirSync(infUploadPath, { recursive: true }); } catch (e) { }
    }

    if (!fsObj.existsSync(weightsPath)) {
        try { fsObj.mkdirSync(weightsPath, { recursive: true }); } catch (e) { }
    }

    if (!fsObj.existsSync(darknetPathFile)) {
        try { fsObj.writeFileSync(darknetPathFile, ""); } catch (e) { }
    }

    let projRecord = null;
    try {
        const projRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );

        projRecord = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);
    } catch (err) {
        global.logger.error("Error querying project record:", err);
    }

    let classes = [];
    try {
        const classRes = await queries.project.getAllClasses(projectDir);

        classes = classRes.rows || [];
    } catch (err) {
        global.logger.error("Error querying project classes:", err);
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );

        accessUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
    }

    const readdirFn = global.readdirAsync || ((p) => new Promise((resolve, reject) => fs.readdir(p, (err, files) => err ? reject(err) : resolve(files))));

    let globalWeights = [];
    try {
        globalWeights = await readdirFn(weightsPath);
    } catch (e) {
        globalWeights = [];
    }

    let globalInference = [];
    try {
        globalInference = await readdirFn(inferencePath);
    } catch (e) {
        globalInference = [];
    }

    let globalInferenceUpload = [];
    try {
        globalInferenceUpload = await readdirFn(inferenceUploadPath);
    } catch (e) {
        globalInferenceUpload = [];
    }

    let runs = [];
    try {
        runs = await readdirFn(logPath);

        runs = (runs || []).filter((r) => {
            try {
                return fsObj.statSync(path.join(logPath, r)).isDirectory();
            } catch (e) {
                return true;
            }
        });

        runs = runs.reverse();
    } catch (e) {
        runs = [];
    }

    const logFolder = [];
    const runStatus = [];
    const logFiles = [];
    const logContents = [];
    const weightsList = [];
    const errFiles = [];
    const errContents = [];
    const weightsFiles = [];
    const runPaths = [];

    let infRuns = [];
    try {
        infRuns = await readdirFn(infLogPath);

        infRuns = (infRuns || []).filter((r) => {
            try {
                return fsObj.statSync(path.join(infLogPath, r)).isDirectory();
            } catch (e) {
                return true;
            }
        });

        infRuns = infRuns.reverse();
    } catch (e) {
        infRuns = [];
    }

    const runStatusInf = [];
    const logFilesInf = [];
    const logFolderInf = [];
    const logContentsInf = [];
    const weightsInfList = [];
    const errFilesInf = [];
    const errContentsInf = [];
    const weightsFilesInf = [];
    const runPathsInf = [];
    const runTypes = [];

    for (let i = 0; i < runs.length; i++) {
        const runName = runs[i];
        const runDir = path.join(logPath, `${runName}/`);
        runPaths.push(runDir);

        let logs = [];
        try {
            logs = await readdirFn(runDir);
        } catch (e) {
            logs = [];
        }

        logFolder.push(runName);
        logFiles.push(`${runName}.log`);

        try {
            logContents.push(fsObj.readFileSync(path.join(runDir, `${runName}.log`), "utf8"));
        } catch (e) {
            logContents.push("");
        }

        const errIdx = (logs || []).indexOf(`${runName}-error.log`);
        const doneIdx = (logs || []).indexOf("done.log");
        const weight = [];
        const weightsNames = [];

        if (errIdx >= 0) {
            runStatus.push("FAILED");
            errFiles.push(logs[errIdx]);

            try {
                errContents.push(fsObj.readFileSync(path.join(runDir, logs[errIdx]), "utf8"));
            } catch (e) {
                errContents.push("");
            }

            for (let j = 0; j < logs.length; j++) {
                if (j === errIdx) continue;
                if (["datatovalues.py", "images", "labels", "train", "weights"].includes(logs[j])) continue;

                weight.push(logs[j]);
                weightsNames.push(logs[j]);
            }
        } else if (doneIdx >= 0) {
            runStatus.push("DONE");
            errFiles.push("NULL");
            errContents.push("NULL");

            for (let j = 0; j < logs.length; j++) {
                if (j === doneIdx) continue;
                if (["datatovalues.py", "images", "labels", "train", "weights"].includes(logs[j])) continue;

                weight.push(logs[j]);
                weightsNames.push(logs[j]);
            }
        } else {
            runStatus.push("RUNNING");
            errFiles.push("NULL");
            errContents.push("NULL");

            for (let j = 0; j < logs.length; j++) {
                if (["datatovalues.py", "images", "labels", "train", "weights"].includes(logs[j])) continue;

                weight.push(logs[j]);
                weightsNames.push(logs[j]);
            }
        }

        weightsList.push(weight);
        weightsFiles.push(weightsNames);
    }

    const fileExistsRecursive = (dirPath, target) => {
        let entries;
        try {
            entries = fsObj.readdirSync(dirPath, { withFileTypes: true });
        } catch {
            return false;
        }

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.name === target) return true;

            if (entry.isDirectory && entry.isDirectory()) {
                if (fileExistsRecursive(fullPath, target)) return true;
            }
        }

        return false;
    };

    for (let i = 0; i < infRuns.length; i++) {
        const infRunName = infRuns[i];
        const runDirInf = path.join(infLogPath, `${infRunName}/`);
        runPathsInf.push(runDirInf);

        let logsInf = [];
        try {
            logsInf = await readdirFn(runDirInf);
        } catch (e) {
            logsInf = [];
        }

        logFolderInf.push(infRunName);
        logFilesInf.push(`${infRunName}.log`);

        try {
            logContentsInf.push(fsObj.readFileSync(path.join(runDirInf, `${infRunName}.log`), "utf8"));
        } catch (e) {
            logContentsInf.push("");
        }

        const errIdxInf = (logsInf || []).indexOf(`${infRunName}-error.log`);
        const doneIdxInf = (logsInf || []).indexOf("done.log");
        const runTypePath = (logsInf || []).indexOf("type.txt");

        if (runTypePath >= 0) {
            try {
                const type = fsObj.readFileSync(path.join(runDirInf, logsInf[runTypePath]), "utf8");

                if (type.trim() === "inception") {
                    runTypes.push("Inception");
                } else if (type.trim() === "megadetector") {
                    runTypes.push("MegaDetector");
                } else if (type.trim() === "yolo") {
                    runTypes.push("YOLO");
                } else {
                    runTypes.push("Unknown");
                }
            } catch (e) {
                runTypes.push("Unknown");
            }
        } else {
            const inceptionExists = fileExistsRecursive(runDirInf, "inception.py");
            const megadetectorExists = fileExistsRecursive(runDirInf, "megadetector.py");
            const yoloExists = fileExistsRecursive(runDirInf, "datatovalues.py");

            if (inceptionExists) {
                runTypes.push("Inception");
            } else if (megadetectorExists) {
                runTypes.push("MegaDetector");
            } else if (yoloExists) {
                runTypes.push("YOLO");
            } else {
                runTypes.push("Unknown");
            }
        }

        const weightInf = [];
        const weightsNamesInf = [];

        if (errIdxInf >= 0 && doneIdxInf === -1) {
            runStatusInf.push("FAILED");
            errFilesInf.push(logsInf[errIdxInf]);

            try {
                errContentsInf.push(fsObj.readFileSync(path.join(runDirInf, logsInf[errIdxInf]), "utf8"));
            } catch (e) {
                errContentsInf.push("");
            }

            for (let j = 0; j < logsInf.length; j++) {
                if (j === errIdxInf) continue;

                weightInf.push(logsInf[j]);
                weightsNamesInf.push(logsInf[j]);
            }
        } else if (doneIdxInf >= 0) {
            runStatusInf.push("DONE");
            errFilesInf.push("NULL");
            errContentsInf.push("NULL");

            for (let j = 0; j < logsInf.length; j++) {
                if (j === doneIdxInf) continue;

                weightInf.push(logsInf[j]);
                weightsNamesInf.push(logsInf[j]);
            }
        } else {
            runStatusInf.push("RUNNING");
            errFilesInf.push("NULL");
            errContentsInf.push("NULL");

            for (let j = 0; j < logsInf.length; j++) {
                weightInf.push(logsInf[j]);
                weightsNamesInf.push(logsInf[j]);
            }
        }

        weightsInfList.push(weightInf);
        weightsFilesInf.push(weightsNamesInf);
    }

    let scripts = [];
    try {
        scripts = await readdirFn(pythonPath);
    } catch (e) {
        scripts = [];
    }

    let pathsList = [];
    if (fsObj.existsSync(darknetPathFile)) {
        try {
            pathsList = fsObj
                .readFileSync(darknetPathFile, "utf-8")
                .split("\n")
                .filter(Boolean);
        } catch (e) {
            pathsList = [];
        }
    }

    const defaultPath = (global.configFile && global.configFile.default_yolo_path) || null;

    res.render("processing", {
        title: "processing",
        user,
        access: accessUsers,
        PName,
        Admin: admin,
        IDX: idx,
        PDescription: projRecord ? projRecord.PDescription : "",
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        log_folder: logFolder,
        log_folder_inf: logFolderInf,
        classes,
        logs: logFiles,
        logs_inf: logFilesInf,
        err_file: errFiles,
        err_file_inf: errFilesInf,
        err_contents: errContents,
        err_contents_inf: errContentsInf,
        default_path: defaultPath,
        paths: pathsList,
        scripts,
        global_weights: globalWeights,
        global_inference: globalInference,
        global_inference_upload: globalInferenceUpload,
        weights: weightsList,
        weights_inf: weightsInfList,
        weights_names: weightsFiles,
        weights_names_inf: weightsFilesInf,
        weights_files_inf: weightsFilesInf,
        weights_output: weightsOutput,
        run_status: runStatus,
        run_status_inf: runStatusInf,
        run_paths: runPaths,
        run_paths_inf: runPathsInf,
        run_types: runTypes,
        log_contents: logContents,
        log_contents_inf: logContentsInf,
        logged: req.query.logged,
        activePage: "Processing",
    });
}

module.exports = getProcessingPage;
