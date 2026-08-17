const path = require("path");
const queries = require("../../queries/queries");

async function getClassSettingsPage(req, res) {
    if (req.query.IDX === undefined) {
        return res.redirect("/home");
    }

    const user = req.cookies ? req.cookies.Username : undefined;
    if (user === undefined) {
        return res.redirect("/");
    }

    const idx = parseInt(req.query.IDX, 10);

    let projects = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const dbRes = await queries.managed.getUserProjects(user);
            projects = (dbRes && dbRes.rows) ? dbRes.rows : (Array.isArray(dbRes) ? dbRes : []);
        } catch (err) {}
    }

    if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
        return res.redirect("/home?error=project_not_found");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectPath = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

    let classes = [];
    if (queries.project && typeof queries.project.getAllClasses === "function") {
        try {
            const classRes = await queries.project.getAllClasses(projectPath);
            classes = (classRes && classRes.rows) ? classRes.rows : (Array.isArray(classRes) ? classRes : []);
        } catch (err) {}
    }
    if ((!classes || classes.length === 0) && global.sqlite3) {
        try {
            const dbPath = path.join(projectPath, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.all === "function") {
                classes = await new Promise((resolve) => {
                    tdb.all("SELECT * FROM Classes", [], (err, rows) => resolve(rows || []));
                });
            }
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

    try {
        res.render("settings/classSettings", {
            title: "classSettings",
            logged: req.query.logged,
            user,
            PName,
            Admin: admin,
            IDX: idx,
            classes,
            colors,
            activePage: "classSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering classSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getClassSettingsPage;
