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

    try {
        const { rows: projects } = await queries.managed.getUserProjects(user);

        if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
            return res.redirect("/home?error=project_not_found");
        }

        const { PName, Admin: admin } = projects[idx];

        res.render("settings/imagesSettings", {
            title: "imageSettings",
            logged: req.query.logged,
            user,
            PName,
            Admin: admin,
            IDX: idx,
            activePage: "imageSettings",
        });
    } catch (err) {
        global.logger.error("Error loading imageSettings page:", err);
        res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }
}

module.exports = getImageSettingsPage;
