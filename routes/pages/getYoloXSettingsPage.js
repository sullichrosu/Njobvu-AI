const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getYoloXSettingsPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/l");
    }

    let projects = [];
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql("SELECT * FROM Access WHERE Username = ?", [user]);
            projects = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const Admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${Admin}-${PName}`);
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
        } catch (e) {}
    } else if (!fsObj.existsSync(weightsPath)) {
        try { fsObj.mkdirSync(weightsPath, { recursive: true }); } catch (e) {}
    } else if (!fsObj.existsSync(yolovxPathFile)) {
        try { fsObj.writeFileSync(yolovxPathFile, ""); } catch (e) {}
    }

    let projRecord = null;
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const projRes = await queries.managed.sql(
                "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
                [PName, Admin]
            );
            projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes && projRes.row ? projRes.row : null);
        } catch (err) {}
    }
    if (!projRecord && global.db && typeof global.db.getAsync === "function") {
        try {
            projRecord = await global.db.getAsync("SELECT * FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + Admin + "'");
        } catch (err) {}
    }

    let classes = [];
    if (queries.project && typeof queries.project.getAllClasses === "function") {
        try {
            const classRes = await queries.project.getAllClasses(projectDir);
            classes = (classRes && classRes.rows) ? classRes.rows : (Array.isArray(classRes) ? classRes : []);
        } catch (err) {}
    }
    if ((!classes || classes.length === 0) && global.sqlite3) {
        try {
            const dbPath = path.join(projectDir, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.all === "function") {
                classes = await new Promise((resolve) => {
                    const cb = (err, rows) => resolve(rows || []);
                    if (tdb.all.length === 2) {
                        tdb.all("SELECT * FROM Classes", cb);
                    } else {
                        tdb.all("SELECT * FROM Classes", [], cb);
                    }
                });
            }
        } catch (err) {}
    }

    const classLabelCounts = {};
    try {
        const countsResult = await queries.project.getClassLabelCounts(projectDir);
        if (countsResult && countsResult.rows) {
            countsResult.rows.forEach((row) => {
                classLabelCounts[row.CName] = row.labelCount || 0;
            });
        }
    } catch (err) {}

    classes = (classes || []).map((cls) => Object.assign({}, cls, {
        labelCount: classLabelCounts[cls.CName] || 0,
    }));

    let accessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, Admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
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

    res.render("training/yolovXTrainingSettings", {
        title: "yolovXTrainingSettings",
        user,
        access: accessUsers,
        PName,
        Admin,
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

module.exports = getYoloXSettingsPage;
