const path = require("path");
const UNLABELED_CLASS = require("../../utils/unlabeledClass");
const queries = require("../../queries/queries");

async function getLabelingPage(req, res) {
    const username = req.cookies ? req.cookies.Username : undefined;
    const user = username;
    let idx = parseInt(req.query.IDX, 10);

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const project = projects[idx];
    const PName = project.PName;
    const admin = project.Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

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
                    tdb.all("SELECT * FROM Classes", (err, rows) => resolve(rows || []));
                });
            }
        } catch (err) {}
    }

    const lcounts = {};
    if (classes && classes.length > 0) {
        for (let i = 0; i < classes.length; i++) {
            const className = classes[i].CName;
            let count = 0;
            if (queries.project && typeof queries.project.sql === "function") {
                try {
                    const countRes = await queries.project.sql(
                        projectDir,
                        "SELECT COUNT(*) as count FROM Labels WHERE CName = ?",
                        [className]
                    );
                    count = (countRes && countRes.rows && countRes.rows[0]) ? (countRes.rows[0].count !== undefined ? countRes.rows[0].count : (countRes.rows[0]["COUNT(*)"] || 0)) : 0;
                } catch (err) {}
            }
            if (!count && global.sqlite3) {
                try {
                    const dbPath = path.join(projectDir, `${PName}.db`);
                    const tdb = new global.sqlite3.Database(dbPath, () => {});
                    if (tdb && typeof tdb.get === "function") {
                        count = await new Promise((resolve) => {
                            tdb.get(`SELECT COUNT(*) FROM Labels WHERE CName = '${className}'`, (err, row) => {
                                resolve(row ? (row['COUNT(*)'] !== undefined ? row['COUNT(*)'] : (row.count || 0)) : 0);
                            });
                        });
                    }
                } catch (err) {}
            }
            lcounts[className] = Number(count) || 0;
        }
    }

    let unlabeledCount = 0;
    if (queries.project && typeof queries.project.sql === "function") {
        try {
            const unlabelRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Images WHERE IName NOT IN (SELECT IName FROM Labels)",
                []
            );
            unlabeledCount = (unlabelRes && unlabelRes.rows && unlabelRes.rows[0]) ? (unlabelRes.rows[0].count !== undefined ? unlabelRes.rows[0].count : (unlabelRes.rows[0]["COUNT(*)"] || 0)) : 0;
        } catch (err) {}
    }
    if (!unlabeledCount && global.sqlite3) {
        try {
            const dbPath = path.join(projectDir, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.get === "function") {
                unlabeledCount = await new Promise((resolve) => {
                    tdb.get("SELECT COUNT(*) FROM Images WHERE IName NOT IN (SELECT IName FROM Labels)", (err, row) => {
                        resolve(row ? (row.count !== undefined ? row.count : (row['COUNT(*)'] || 0)) : 0);
                    });
                });
            }
        } catch (err) {}
    }
    unlabeledCount = Number(unlabeledCount) || 0;

    res.render("labeling", {
        title: "labeling",
        user: username,
        logged: req.query.logged,
        db: req.query.db,
        PName,
        classes: classes || [],
        IDX: idx,
        lcounts,
        unlabeledCount,
        unlabeledClass: UNLABELED_CLASS,
        activePage: "Label",
    });
}

module.exports = getLabelingPage;