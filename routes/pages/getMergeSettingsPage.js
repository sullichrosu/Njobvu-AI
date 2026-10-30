const queries = require("../../queries/queries");

async function getMergeSettingsPage(req, res) {
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

        const mergeRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE Username = ? AND NOT PName = ?",
            [user, PName]
        );

        const mergeProjects = mergeRes.rows || [];

        res.render("settings/mergeSettings", {
            title: "mergeSettings",
            logged: req.query.logged,
            user,
            PName,
            Admin: admin,
            IDX: idx,
            activePage: "mergeSettings",
            mergeProjects,
        });
    } catch (err) {
        global.logger.error("Error loading mergeSettings page:", err);

        res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }
}

module.exports = getMergeSettingsPage;
