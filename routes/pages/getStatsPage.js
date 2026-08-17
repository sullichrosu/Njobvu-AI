const path = require("path");
const queries = require("../../queries/queries");

async function getStatsPage(req, res) {
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

    let classRows = [];
    if (queries.project && typeof queries.project.getAllClasses === "function") {
        try {
            const classRes = await queries.project.getAllClasses(projectDir);
            classRows = (classRes && classRes.rows) ? classRes.rows : (Array.isArray(classRes) ? classRes : []);
        } catch (err) {}
    }
    if ((!classRows || classRows.length === 0) && global.sqlite3) {
        try {
            const dbPath = path.join(projectDir, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.all === "function") {
                classRows = await new Promise((resolve) => {
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

    const classes = [];
    const counts = [];
    const icounts = [];

    for (let i = 0; i < (classRows || []).length; i++) {
        const className = classRows[i].CName;
        classes.push(className);

        let labelCount = 0;
        try {
            const countRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Labels WHERE CName = ?",
                [className]
            );
            labelCount = (countRes && countRes.rows && countRes.rows[0]) ? Number(countRes.rows[0].count) : 0;
        } catch (err) {
            labelCount = 0;
        }
        counts.push(labelCount);

        let imageCount = 0;
        try {
            const imgCountRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(DISTINCT IName) as count FROM Labels WHERE CName = ?",
                [className]
            );
            imageCount = (imgCountRes && imgCountRes.rows && imgCountRes.rows[0]) ? Number(imgCountRes.rows[0].count) : 0;
        } catch (err) {
            imageCount = 0;
        }
        icounts.push(imageCount);
    }

    let accessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }
    if ((!accessUsers || accessUsers.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            const acc = await global.db.allAsync("SELECT * FROM Access WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
            accessUsers = acc ? acc.map((r) => r.Username) : [];
        } catch (err) {}
    }

    let totalImages = 0;
    try {
        const imgRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Images", []);
        totalImages = (imgRes && imgRes.rows && imgRes.rows[0]) ? Number(imgRes.rows[0].count) : 0;
    } catch (err) {
        totalImages = 0;
    }

    let totalLabeledImages = 0;
    try {
        const labeledRes = await queries.project.sql(projectDir, "SELECT COUNT(DISTINCT IName) as count FROM Labels", []);
        totalLabeledImages = (labeledRes && labeledRes.rows && labeledRes.rows[0]) ? Number(labeledRes.rows[0].count) : 0;
    } catch (err) {
        totalLabeledImages = 0;
    }

    let complete = 0;
    if (totalImages > 0) {
        complete = Math.trunc(100 * (totalLabeledImages / totalImages));
    }

    res.render("stats", {
        title: "stats",
        user,
        access: accessUsers,
        PName,
        Admin: admin,
        IDX: idx,
        PDescription: projRecord ? projRecord.PDescription : "",
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        classes,
        counts,
        icounts,
        complete,
        logged: req.query.logged,
        activePage: "Stats",
    });
}

module.exports = getStatsPage;
