const path = require("path");
const UNLABELED_CLASS = require("../../utils/unlabeledClass");
const queries = require("../../queries/queries");

async function getReviewPage(req, res) {
    const username = req.cookies ? req.cookies.Username : undefined;
    const CName = req.query.class;
    const idx = parseInt(req.query.IDX, 10);
    const isUnlabeledMode = CName === UNLABELED_CLASS;

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 100;
    const offset = (page - 1) * pageSize;

    if (isNaN(idx) || idx === undefined || username === undefined) {
        return res.redirect("/home");
    }

    let projects = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + username + "'");
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(username);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }

    const project = projects[idx];
    if (!project) {
        global.logger.error("No project found for IDX:", idx);
        return res.redirect("/home");
    }

    const PName = project.PName;
    const admin = project.Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

    let totalCount = 0;
    let images = [];

    if (isUnlabeledMode) {
        if (global.sqlite3) {
            try {
                const dbPath = path.join(projectDir, `${PName}.db`);
                const tdb = new global.sqlite3.Database(dbPath, () => {});
                if (tdb && typeof tdb.all === "function") {
                    totalCount = await new Promise((resolve) => {
                        const sql = "SELECT COUNT(*) as count FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels)";
                        tdb.all(sql, [], (err, rows) => {
                            if (rows && rows[0]) {
                                resolve(rows[0].count !== undefined ? rows[0].count : (rows[0]["COUNT(*)"] || 0));
                            } else resolve(0);
                        });
                    });
                }
            } catch (err) {}
        }
        if (!totalCount && queries.project && typeof queries.project.sql === "function") {
            try {
                const countRes = await queries.project.sql(
                    projectDir,
                    "SELECT COUNT(*) as count FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels)",
                    []
                );
                totalCount = (countRes && countRes.rows && countRes.rows[0]) ? (countRes.rows[0].count !== undefined ? countRes.rows[0].count : (countRes.rows[0]["COUNT(*)"] || 0)) : 0;
            } catch (err) {}
        }

        if (global.sqlite3) {
            try {
                const dbPath = path.join(projectDir, `${PName}.db`);
                const tdb = new global.sqlite3.Database(dbPath, () => {});
                if (tdb && typeof tdb.all === "function") {
                    images = await new Promise((resolve) => {
                        const sql = `SELECT Images.IName FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ${pageSize} OFFSET ${offset}`;
                        tdb.all(sql, [], (err, rows) => resolve(rows || []));
                    });
                }
            } catch (err) {}
        }
        if ((!images || images.length === 0) && queries.project && typeof queries.project.sql === "function") {
            try {
                const imgRes = await queries.project.sql(
                    projectDir,
                    "SELECT Images.IName FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ? OFFSET ?",
                    [pageSize, offset]
                );
                images = (imgRes && imgRes.rows) ? imgRes.rows : [];
            } catch (err) {}
        }
    } else {
        if (queries.project && typeof queries.project.sql === "function") {
            try {
                const countRes = await queries.project.sql(
                    projectDir,
                    "SELECT COUNT(*) as count FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ?",
                    [CName]
                );
                totalCount = (countRes && countRes.rows && countRes.rows[0]) ? (countRes.rows[0].count !== undefined ? countRes.rows[0].count : (countRes.rows[0]["COUNT(*)"] || 0)) : 0;
            } catch (err) {}
        }
        if (queries.project && typeof queries.project.sql === "function") {
            try {
                const imgRes = await queries.project.sql(
                    projectDir,
                    "SELECT Images.IName FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ? LIMIT ? OFFSET ?",
                    [CName, pageSize, offset]
                );
                images = (imgRes && imgRes.rows) ? imgRes.rows : [];
            } catch (err) {}
        }
    }

    totalCount = Number(totalCount) || 0;

    const uniqueImages = (images || []).filter(
        (image, index, self) =>
            index === self.findIndex((img) => img.IName === image.IName)
    );

    const imageLabels = {};
    for (let i = 0; i < uniqueImages.length; i++) {
        const imageName = uniqueImages[i].IName;
        let labels = [];
        if (queries.project && typeof queries.project.getLabelsForImageName === "function") {
            try {
                const labelsRes = await queries.project.getLabelsForImageName(projectDir, imageName);
                labels = (labelsRes && labelsRes.rows) ? labelsRes.rows : (Array.isArray(labelsRes) ? labelsRes : []);
            } catch (err) {}
        }
        if ((!labels || labels.length === 0) && global.sqlite3) {
            try {
                const dbPath = path.join(projectDir, `${PName}.db`);
                const tdb = new global.sqlite3.Database(dbPath, () => {});
                if (tdb && typeof tdb.all === "function") {
                    labels = await new Promise((resolve) => {
                        tdb.all(`SELECT * FROM Labels WHERE IName = '${imageName}'`, [], (err, rows) => resolve(rows || []));
                    });
                }
            } catch (err) {}
        }
        imageLabels[imageName] = labels;
    }

    let classes = [];
    if (queries.project && typeof queries.project.getAllClasses === "function") {
        try {
            const classRes = await queries.project.getAllClasses(projectDir);
            classes = (classRes && classRes.rows) ? classRes.rows : (Array.isArray(classRes) ? classRes : []);
        } catch (err) {}
    }
    if ((!classes || classes.length === 0) && global.sqlite3) {
        try {
            const dbPath = path.join(projectDir, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.all === "function") {
                classes = await new Promise((resolve) => {
                    tdb.all("SELECT * FROM Classes", [], (err, rows) => resolve(rows || []));
                });
            }
        } catch (err) {}
    }

    const totalPageCount = Math.ceil(totalCount / pageSize) || 1;

    res.render("review", {
        user: username,
        CName,
        displayClassName: isUnlabeledMode ? "Unlabeled" : CName,
        isUnlabeledMode,
        unlabeledClass: UNLABELED_CLASS,
        images: uniqueImages,
        imageLabels,
        PName,
        classes,
        currentPage: page,
        totalPageCount,
        selectedClass: req.query.class,
        IDX: idx,
        admin,
        activePage: "Label",
    });
}

module.exports = getReviewPage;
