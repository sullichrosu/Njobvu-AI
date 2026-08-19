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

    let projects, PName, admin, projectPath, classes;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
            return res.redirect("/home?error=project_not_found");
        }

        ({ PName, Admin: admin } = projects[idx]);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        projectPath = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

        ({ rows: classes } = await queries.project.getAllClasses(projectPath));

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
    } catch (err) {
        global.logger.error("Error loading classSettings page:", err);
        res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }
}

module.exports = getClassSettingsPage;
