const queries = require("../../queries/queries");

async function getProjectSettingsPage(req, res) {
    const user = req.cookies ? req.cookies.Username : undefined;
    if (user === undefined) {
        return res.redirect("/");
    }
    if (req.query.IDX === undefined) {
        return res.redirect("/home");
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

    let projRecord = null;
    if (global.db && typeof global.db.getAsync === "function") {
        try {
            projRecord = await global.db.getAsync("SELECT * FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        } catch (err) {}
    }
    if (!projRecord && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const projRes = await queries.managed.sql(
                "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes && projRes.row ? projRes.row : null);
        } catch (err) {}
    }

    if (!projRecord) {
        return res.redirect("/home?error=project_not_found");
    }

    try {
        res.render("settings/projSettings", {
            title: "projSettings",
            logged: req.query.logged,
            user,
            PName,
            Admin: admin,
            PDescription: projRecord.PDescription,
            IDX: idx,
            activePage: "projSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering projSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getProjectSettingsPage;
