const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getDownloadPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
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
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const trainingPath = path.join(projectDir, "training");
    const logPath = path.join(trainingPath, "logs");
    const pythonPath = path.join(trainingPath, "python");
    const pythonPathFile = path.join(trainingPath, "Paths.txt");
    const weightsPath = path.join(trainingPath, "weights");

    const fsObj = global.fs || fs;

    if (!fsObj.existsSync(trainingPath)) {
        try {
            fsObj.mkdirSync(trainingPath, { recursive: true });
            fsObj.mkdirSync(logPath, { recursive: true });
            fsObj.mkdirSync(pythonPath, { recursive: true });
            fsObj.mkdirSync(weightsPath, { recursive: true });
            fsObj.writeFileSync(pythonPathFile, "");
        } catch (e) {}
    } else if (!fsObj.existsSync(weightsPath)) {
        try { fsObj.mkdirSync(weightsPath, { recursive: true }); } catch (e) {}
    }

    let projRecord = null;
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const projRes = await queries.managed.sql(
                "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes && projRes.row ? projRes.row : null);
        } catch (err) {}
    }
    if (!projRecord && global.db && typeof global.db.getAsync === "function") {
        try {
            projRecord = await global.db.getAsync("SELECT * FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
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

    let accessOtherUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ? AND Username != ?",
                [PName, admin, user]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessOtherUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }

    let allAccessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const allAccRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (allAccRes && allAccRes.rows) ? allAccRes.rows : [];
            allAccessUsers = rows.map((r) => r.Username);
        } catch (err) {}
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
    try {
        scripts = fsObj.readdirSync(pythonPath);
    } catch (e) {
        scripts = [];
    }
    const hasScripts = scripts.length > 0 ? 1 : 0;

    let weights = [];
    try {
        weights = fsObj.readdirSync(weightsPath);
    } catch (e) {
        weights = [];
    }

    res.render("download", {
        title: "download",
        user,
        Admin: projRecord ? projRecord.Admin : admin,
        access: accessOtherUsers,
        acc: allAccessUsers,
        PName,
        IDX: idx,
        PDescription: projRecord ? projRecord.PDescription : "",
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        classes,
        colors,
        scripts,
        weights,
        has_scripts: hasScripts,
        logged: req.query.logged,
        activePage: "Download",
    });
}

module.exports = getDownloadPage;
