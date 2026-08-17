const queries = require("../../queries/queries");

async function getImageSettingsPage(req, res) {
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

    try {
        res.render("settings/imagesSettings", {
            title: "imageSettings",
            logged: req.query.logged,
            user,
            PName,
            Admin: admin,
            IDX: idx,
            activePage: "imageSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering imageSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getImageSettingsPage;
