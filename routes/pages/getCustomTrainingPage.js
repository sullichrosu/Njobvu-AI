const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getTrainingPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    try {
        const userProjectsRes = await queries.managed.getUserProjects(user);
        projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
    } catch (err) {
        global.logger.error("Error fetching projects for custom training page:", err);
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const trainingPath = path.join(projectDir, "training");
    const logPath = path.join(trainingPath, "logs");
    const weightsPath = path.join(trainingPath, "weights");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");

    if (!fs.existsSync(trainingPath)) {
        fs.mkdirSync(trainingPath, { recursive: true });
        fs.mkdirSync(logPath, { recursive: true });
        fs.mkdirSync(pythonPath, { recursive: true });
        fs.mkdirSync(weightsPath, { recursive: true });
        fs.writeFileSync(pythonPathFile, "");
    } else if (!fs.existsSync(weightsPath)) {
        fs.mkdirSync(weightsPath, { recursive: true });
    }

    let projRecord = null;
    try {
        const projRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes && projRes.row ? projRes.row : null);
    } catch (err) {
        global.logger.error("Error fetching project record:", err);
    }

    let classes = [];
    try {
        const classRes = await queries.project.getAllClasses(projectDir);
        classes = (classRes && classRes.rows) ? classRes.rows : [];
    } catch (err) {
        global.logger.error("Error fetching classes for custom training page:", err);
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        const rows = (accRes && accRes.rows) ? accRes.rows : [];
        accessUsers = rows.map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error fetching access users:", err);
    }

    let globalWeights = [];
    try {
        globalWeights = fs.readdirSync(weightsPath);
    } catch (e) {
        globalWeights = [];
    }

    let runs = [];
    try {
        runs = fs.readdirSync(logPath);
        runs = runs.filter((r) => {
            try {
                return fs.statSync(path.join(logPath, r)).isDirectory();
            } catch (e) {
                return false;
            }
        });
        runs = runs.reverse();
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
            logs = fs.readdirSync(runDir);
        } catch (e) {
            logs = [];
        }

        const logIdx = logs.indexOf(`${runName}.log`);
        logFiles.push(`${runName}.log`);

        let logContent = "";
        try {
            logContent = fs.readFileSync(path.join(runDir, `${runName}.log`), "utf8");
        } catch (e) {
            logContent = "";
        }
        logContents.push(logContent);

        const errIdx = logs.indexOf(`${runName}-error.log`);
        const doneIdx = logs.indexOf("done.log");

        const weight = [];
        const weightsNames = [];

        if (errIdx >= 0) {
            runStatus.push("FAILED");
            errFiles.push(logs[errIdx]);
            try {
                errContents.push(fs.readFileSync(path.join(runDir, logs[errIdx]), "utf8"));
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
        scripts = fs.readdirSync(pythonPath);
    } catch (e) {
        scripts = [];
    }

    let pathsList = [];
    if (fs.existsSync(pythonPathFile)) {
        pathsList = fs
            .readFileSync(pythonPathFile, "utf-8")
            .split("\n")
            .filter(Boolean);
    }

    const defaultPath = (global.configFile && global.configFile.default_python_path) || null;

    res.render("customTraining", {
        title: "customTraining",
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
        weights: weightsList,
        weight_names: weightsFiles,
        run_status: runStatus,
        run_paths: runPaths,
        log_contents: logContents,
        logged: req.query.logged,
        activePage: "Training",
    });
}

module.exports = getTrainingPage;
