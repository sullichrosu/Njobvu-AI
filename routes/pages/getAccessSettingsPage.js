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

    try {
        const { rows: projects } = await queries.managed.getUserProjects(user);

        if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
            return res.redirect("/home?error=project_not_found");
        }

        const { PName, Admin: admin } = projects[idx];
        const DAdmin = projects.map((p) => p.Admin);

        const { rows: accessRows } = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ? AND Username != ?",
            [PName, admin, user]
        );

        const accessUsers = accessRows.map((r) => r.Username);

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
        global.logger.error("Error loading accessSettings page:", error);
        res.redirect(`/error?error=${encodeURIComponent(error.message)}`);
    }
}

module.exports = getAccessSettingsPage;
