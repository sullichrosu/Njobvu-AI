const path = require("path");
const UNLABELED_CLASS = require("../../utils/unlabeledClass");
const queries = require("../../queries/queries");

async function getLabelingPage(req, res) {
    const username = req.cookies ? req.cookies.Username : undefined;
    const user = username;
    let idx = parseInt(req.query.IDX, 10);

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects, PName, admin, projectDir, classes;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (idx < 0 || idx >= projects.length) {
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = projects[idx]);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

        ({ rows: classes } = await queries.project.getAllClasses(projectDir));
    } catch (err) {
        global.logger.error("Error loading labeling page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    const lcounts = {};
    for (const cls of classes) {
        try {
            const countRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Labels WHERE CName = ?",
                [cls.CName]
            );

            const row = countRes.rows ? countRes.rows[0] : countRes.row;

            lcounts[cls.CName] = Number(row && row.count) || 0;
        } catch (err) {
            global.logger.error(`Error counting labels for class ${cls.CName}:`, err);

            lcounts[cls.CName] = 0;
        }
    }

    let unlabeledCount = 0;
    try {
        const unlabelRes = await queries.project.sql(
            projectDir,
            "SELECT COUNT(*) as count FROM Images WHERE IName NOT IN (SELECT IName FROM Labels)",
            []
        );

        const row = unlabelRes.rows ? unlabelRes.rows[0] : unlabelRes.row;

        unlabeledCount = Number(row && row.count) || 0;
    } catch (err) {
        global.logger.error("Error counting unlabeled images:", err);
    }

    res.render("labeling", {
        title: "labeling",
        user: username,
        logged: req.query.logged,
        db: req.query.db,
        PName,
        classes: classes || [],
        IDX: idx,
        lcounts,
        unlabeledCount,
        unlabeledClass: UNLABELED_CLASS,
        activePage: "Label",
    });
}

module.exports = getLabelingPage;
