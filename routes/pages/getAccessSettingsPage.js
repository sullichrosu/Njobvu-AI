const queries = require("../../queries/queries");

async function getAccessSettingsPage(req, res) {
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
    const DAdmin = projects.map((p) => p.Admin);

    let accessUsers = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            const acc = await global.db.allAsync("SELECT * FROM Access WHERE PName = '" + PName + "' AND Admin = '" + admin + "' AND Username != '" + user + "'");
            accessUsers = acc ? acc.map((r) => r.Username) : [];
        } catch (err) {}
    }
    if ((!accessUsers || accessUsers.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ? AND Username != ?",
                [PName, admin, user]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }

    try {
        res.render("settings/accessSettings", {
            title: "accessSettings",
            logged: req.query.logged,
            user,
            IDX: idx,
            DAdmin,
            access: accessUsers,
            Admin: admin,
            PName,
            activePage: "accessSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering accessSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getAccessSettingsPage;
