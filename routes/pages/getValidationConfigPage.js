const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getValidationConfigPage(req, res) {
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
        global.logger.error("Error fetching projects for validation config page:", err);
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    let mergeProjects = [];
    try {
        const mergeRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE Username = ? AND NOT PName = ?",
            [user, PName]
        );
        mergeProjects = (mergeRes && mergeRes.rows) ? mergeRes.rows : [];
    } catch (err) {
        global.logger.error("Error fetching merge projects:", err);
    }

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const trainingPath = path.join(projectDir, "training");
    const logPath = path.join(trainingPath, "logs");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");
    const darknetPathFile = path.join(trainingPath, "darknetPaths.txt");
    const weightsPath = path.join(trainingPath, "weights");

    if (!fs.existsSync(trainingPath)) {
        fs.mkdirSync(trainingPath, { recursive: true });
        fs.mkdirSync(logPath, { recursive: true });
        fs.mkdirSync(pythonPath, { recursive: true });
        fs.mkdirSync(weightsPath, { recursive: true });
        fs.writeFileSync(pythonPathFile, "");
        fs.writeFileSync(darknetPathFile, "");
    }
    if (!fs.existsSync(weightsPath)) {
        fs.mkdirSync(weightsPath, { recursive: true });
    }
    if (!fs.existsSync(darknetPathFile)) {
        fs.writeFileSync(darknetPathFile, "");
    }
    if (!fs.existsSync(pythonPathFile)) {
        fs.writeFileSync(pythonPathFile, "");
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
        global.logger.error("Error fetching classes for validation config page:", err);
    }

    let accessOtherUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ? AND Username != ?",
            [PName, admin, user]
        );
        const rows = (accRes && accRes.rows) ? accRes.rows : [];
        accessOtherUsers = rows.map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error fetching other access users:", err);
    }

    let otherAdminProjects = [];
    try {
        const otherProjRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin != ?",
            [PName, user]
        );
        const rows = (otherProjRes && otherProjRes.rows) ? otherProjRes.rows : [];
        otherAdminProjects = rows.map((r) => r.Admin);
    } catch (err) {
        global.logger.error("Error fetching other admin projects:", err);
    }

    let allAccessUsers = [];
    try {
        const allAccRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        const rows = (allAccRes && allAccRes.rows) ? allAccRes.rows : [];
        allAccessUsers = rows.map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error fetching all access users:", err);
    }

    const colors = [];
    let colorIdx = 0;
    const colorList = global.colorsJSON || [];
    while (colors.length < classes.length) {
        if (colorIdx >= colorList.length) {
            colorIdx = 0;
        }
        colors.push(colorList[colorIdx]);
        colorIdx++;
    }

    let scripts = [];
    if (global.readdirAsync) {
        try {
            scripts = await global.readdirAsync(pythonPath);
        } catch (e) {
            scripts = [];
        }
    } else {
        try {
            scripts = fs.readdirSync(pythonPath);
        } catch (e) {
            scripts = [];
        }
    }

    let weights = [];
    if (global.readdirAsync) {
        try {
            weights = await global.readdirAsync(weightsPath);
        } catch (e) {
            weights = [];
        }
    } else {
        try {
            weights = fs.readdirSync(weightsPath);
        } catch (e) {
            weights = [];
        }
    }

    const paths = fs
        .readFileSync(pythonPathFile, "utf-8")
        .split("\n")
        .filter(Boolean);

    const darknetPaths = fs
        .readFileSync(darknetPathFile, "utf-8")
        .split("\n")
        .filter(Boolean);

    res.render("configV", {
        title: "config",
        user,
        Admin: projRecord ? projRecord.Admin : admin,
        DAdmin: otherAdminProjects,
        access: accessOtherUsers,
        acc: allAccessUsers,
        PName,
        IDX: idx,
        PDescription: projRecord ? projRecord.PDescription : "",
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        weights,
        scripts,
        paths,
        darknet_paths: darknetPaths,
        classes,
        colors,
        logged: req.query.logged,
        mergeProjects,
        activePage: "ConfigurationV",
    });
}

module.exports = getValidationConfigPage;
