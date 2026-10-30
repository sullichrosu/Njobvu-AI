const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getInceptionSettingsPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }

    if (user === undefined) {
        return res.redirect("/l");
    }

    let projects;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));
    } catch (err) {
        global.logger.error("Error loading inception settings page:", err);

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
    const logPath = path.join(trainingPath, "logs");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");
    const yolovxPathFile = path.join(trainingPath, "yolovxPaths.txt");

    const fsObj = global.fs || fs;

    if (!fsObj.existsSync(trainingPath)) {
        try {
            fsObj.mkdirSync(trainingPath, { recursive: true });
            fsObj.mkdirSync(logPath, { recursive: true });
            fsObj.mkdirSync(pythonPath, { recursive: true });
            fsObj.mkdirSync(weightsPath, { recursive: true });
            fsObj.writeFileSync(pythonPathFile, "");
            fsObj.writeFileSync(yolovxPathFile, "");
        } catch (e) { }
    } else if (!fsObj.existsSync(weightsPath)) {
        try { fsObj.mkdirSync(weightsPath, { recursive: true }); } catch (e) { }
    } else if (!fsObj.existsSync(yolovxPathFile)) {
        try { fsObj.writeFileSync(yolovxPathFile, ""); } catch (e) { }
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

    let globalWeights = [];
    try {
        globalWeights = fsObj.readdirSync(weightsPath);
    } catch (e) {
        globalWeights = [];
    }

    let globalInference = [];
    try {
        globalInference = fsObj.readdirSync(inferencePath);
    } catch (e) {
        globalInference = [];
    }

    let globalInferenceUpload = [];
    try {
        globalInferenceUpload = fsObj.readdirSync(inferenceUploadPath);
    } catch (e) {
        globalInferenceUpload = [];
    }

    globalInferenceUpload.push(path.join(projectDir, "images"));

    let runs = [];
    try {
        runs = fsObj.readdirSync(logPath);
        runs = (runs || []).reverse();
    } catch (e) {
        runs = [];
    }

    const runStatus = [];
    const logFiles = [];
    const logContents = [];
    const weightsList = [];
    const errFiles = [];
    const errContents = [];
    const weightsFiles = [];
    const runPaths = [];

    for (let i = 0; i < runs.length; i++) {
        const runName = runs[i];
        const runDir = path.join(logPath, runName);

        runPaths.push(`${runDir}/`);

        let logs = [];
        try {
            logs = fsObj.readdirSync(runDir);
        } catch (e) {
            logs = [];
        }

        const logIdx = logs.indexOf(`${runName}.log`);
        logFiles.push(`${runName}.log`);

        try {
            logContents.push(fsObj.readFileSync(path.join(runDir, `${runName}.log`), "utf8"));
        } catch (err) {
            logContents.push("Log file not found or unreadable");
        }

        const errIdx = logs.indexOf(`${runName}-error.log`);
        const doneIdx = logs.indexOf("done.log");

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
                if (j === logIdx || j === errIdx) continue;

                weight.push(path.join(runDir, logs[j]));
                weightsNames.push(logs[j]);
            }
        } else if (doneIdx >= 0) {
            runStatus.push("DONE");
            errFiles.push("NULL");
            errContents.push("NULL");

            for (let j = 0; j < logs.length; j++) {
                if (j === logIdx || j === doneIdx) continue;

                weight.push(path.join(runDir, logs[j]));
                weightsNames.push(logs[j]);
            }
        } else {
            runStatus.push("RUNNING");
            errFiles.push("NULL");
            errContents.push("NULL");

            for (let j = 0; j < logs.length; j++) {
                if (j === logIdx) continue;

                weight.push(path.join(runDir, logs[j]));
                weightsNames.push(logs[j]);
            }
        }

        weightsList.push(weight);
        weightsFiles.push(weightsNames);
    }

    let scripts = [];
    try {
        scripts = fsObj.readdirSync(pythonPath);
    } catch (e) {
        scripts = [];
    }

    let pathsList = [];
    if (fsObj.existsSync(yolovxPathFile)) {
        try {
            pathsList = fsObj
                .readFileSync(yolovxPathFile, "utf-8")
                .split("\n")
                .filter(Boolean);
        } catch (e) {
            pathsList = [];
        }
    }

    const defaultPath = (global.configFile && global.configFile.default_yolo_path) || null;

    res.render("training/inceptionSettings", {
        title: "inceptionSettings",
        user,
        access: accessUsers,
        PName,
        Admin: admin,
        IDX: idx,
        PDescription: projRecord ? projRecord.PDescription : "",
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        classes,
        logs: logFiles,
        err_file: errFiles,
        err_contents: errContents,
        default_path: defaultPath,
        paths: pathsList,
        scripts,
        global_weights: globalWeights,
        global_inference: globalInference,
        global_inference_upload: globalInferenceUpload,
        weights: weightsList,
        weight_names: weightsFiles,
        run_status: runStatus,
        run_paths: runPaths,
        log_contents: logContents,
        logged: req.query.logged,
        activePage: "yolovXSettings",
    });
}

module.exports = getInceptionSettingsPage;
