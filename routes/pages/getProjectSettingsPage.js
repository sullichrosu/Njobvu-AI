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

    try {
        const { rows: projects } = await queries.managed.getUserProjects(user);

        if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
            return res.redirect("/home?error=project_not_found");
        }

        const { PName, Admin: admin } = projects[idx];

        const projRes = await queries.managed.sql(
            "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        const projRecord = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);

        if (!projRecord) {
            return res.redirect("/home?error=project_not_found");
        }

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
    } catch (err) {
        global.logger.error("Error loading projSettings page:", err);
        res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }
}

module.exports = getProjectSettingsPage;
