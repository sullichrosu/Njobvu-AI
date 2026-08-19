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

    let project, PName, admin, projectDir;
    try {
        const { rows: projects } = await queries.managed.getUserProjects(username);

        project = projects[idx];
        if (!project) {
            global.logger.error("No project found for IDX:", idx);
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = project);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    } catch (err) {
        global.logger.error("Error loading review page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    let totalCount = 0;
    let images = [];

    if (isUnlabeledMode) {
        try {
            const countRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels)",
                []
            );
            totalCount = (countRes.rows && countRes.rows[0]) ? Number(countRes.rows[0].count) : 0;
        } catch (err) {
            global.logger.error("Error counting unlabeled images:", err);
        }

        try {
            const imgRes = await queries.project.sql(
                projectDir,
                "SELECT Images.IName FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ? OFFSET ?",
                [pageSize, offset]
            );
            images = imgRes.rows || [];
        } catch (err) {
            global.logger.error("Error fetching unlabeled images:", err);
        }
    } else {
        try {
            const countRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ?",
                [CName]
            );
            totalCount = (countRes.rows && countRes.rows[0]) ? Number(countRes.rows[0].count) : 0;
        } catch (err) {
            global.logger.error("Error counting labeled images:", err);
        }

        try {
            const imgRes = await queries.project.sql(
                projectDir,
                "SELECT Images.IName FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ? LIMIT ? OFFSET ?",
                [CName, pageSize, offset]
            );
            images = imgRes.rows || [];
        } catch (err) {
            global.logger.error("Error fetching labeled images:", err);
        }
    }

    const uniqueImages = images.filter(
        (image, index, self) =>
            index === self.findIndex((img) => img.IName === image.IName)
    );

    const imageLabels = {};
    for (const image of uniqueImages) {
        try {
            const labelsRes = await queries.project.getLabelsForImageName(projectDir, image.IName);
            imageLabels[image.IName] = labelsRes.rows || [];
        } catch (err) {
            global.logger.error(`Error fetching labels for ${image.IName}:`, err);
            imageLabels[image.IName] = [];
        }
    }

    let classes = [];
    try {
        const classRes = await queries.project.getAllClasses(projectDir);
        classes = classRes.rows || [];
    } catch (err) {
        global.logger.error("Error querying project classes:", err);
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
