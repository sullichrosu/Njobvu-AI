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

    let projects, PName, admin, projectDir, projRecord, classRows;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (idx < 0 || idx >= projects.length) {
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = projects[idx]);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

        const projRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        projRecord = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);

        ({ rows: classRows } = await queries.project.getAllClasses(projectDir));
    } catch (err) {
        global.logger.error("Error loading stats page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
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
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        accessUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
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
