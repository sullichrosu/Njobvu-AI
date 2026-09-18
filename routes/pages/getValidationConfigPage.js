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

    let projects;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));
    } catch (err) {
        global.logger.error("Error loading validation config page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    if (idx < 0 || idx >= projects.length) {
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
        mergeProjects = mergeRes.rows || [];
    } catch (err) {
        global.logger.error("Error fetching merge project candidates:", err);
    }

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const trainingPath = path.join(projectDir, "training");
    const logPath = path.join(trainingPath, "logs");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");
    const darknetPathFile = path.join(trainingPath, "darknetPaths.txt");
    const weightsPath = path.join(trainingPath, "weights");

    const fsObj = global.fs || fs;

    if (!fsObj.existsSync(trainingPath)) {
        try {
            fsObj.mkdirSync(trainingPath, { recursive: true });
            fsObj.mkdirSync(logPath, { recursive: true });
            fsObj.mkdirSync(pythonPath, { recursive: true });
            fsObj.mkdirSync(weightsPath, { recursive: true });
            fsObj.writeFileSync(pythonPathFile, "");
            fsObj.writeFileSync(darknetPathFile, "");
        } catch (e) {}
    }
    if (!fsObj.existsSync(weightsPath)) {
        try { fsObj.mkdirSync(weightsPath, { recursive: true }); } catch (e) {}
    }
    if (!fsObj.existsSync(darknetPathFile)) {
        try { fsObj.writeFileSync(darknetPathFile, ""); } catch (e) {}
    }
    if (!fsObj.existsSync(pythonPathFile)) {
        try { fsObj.writeFileSync(pythonPathFile, ""); } catch (e) {}
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

    let accessOtherUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ? AND Username != ?",
            [PName, admin, user]
        );
        accessOtherUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
    }

    let otherAdminProjects = [];
    try {
        const otherProjRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin != ?",
            [PName, user]
        );
        otherAdminProjects = (otherProjRes.rows || []).map((r) => r.Admin);
    } catch (err) {
        global.logger.error("Error querying other admin projects:", err);
    }

    let allAccessUsers = [];
    try {
        const allAccRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        allAccessUsers = (allAccRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying full access list:", err);
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
            scripts = fsObj.readdirSync(pythonPath);
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
            weights = fsObj.readdirSync(weightsPath);
        } catch (e) {
            weights = [];
        }
    }

    let paths = [];
    try {
        paths = fsObj
            .readFileSync(pythonPathFile, "utf-8")
            .split("\n")
            .filter(Boolean);
    } catch (e) {
        paths = [];
    }

    let darknetPaths = [];
    try {
        darknetPaths = fsObj
            .readFileSync(darknetPathFile, "utf-8")
            .split("\n")
            .filter(Boolean);
    } catch (e) {
        darknetPaths = [];
    }

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
