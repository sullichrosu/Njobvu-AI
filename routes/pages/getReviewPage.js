const path = require("path");
const UNLABELED_CLASS = require("../../utils/unlabeledClass");
const queries = require("../../queries/queries");

async function getReviewPage(req, res) {
    const username = req.cookies ? req.cookies.Username : undefined;
    let CName = req.query.class;
    let idx = parseInt(req.query.IDX, 10);

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 100;
    const offset = (page - 1) * pageSize;

    if (username === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    try {
        const { rows } = await queries.managed.getUserProjects(username);
        projects = rows || [];
    } catch (err) {}

    const project = projects[idx];
    if (!project) {
        global.logger.error("No project found for IDX:", idx);
        return res.redirect("/home");
    }

    const PName = project.PName;
    const admin = project.Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

    // If CName is missing but IName was provided, look up the label class for IName
    if (!CName && req.query.IName) {
        try {
            const labelRes = await queries.project.sql(
                projectDir,
                "SELECT CName FROM Labels WHERE IName = ? LIMIT 1",
                [req.query.IName]
            );
            if (labelRes && labelRes.rows && labelRes.rows.length > 0) {
                CName = labelRes.rows[0].CName;
            } else {
                CName = UNLABELED_CLASS;
            }
        } catch (err) {
            CName = UNLABELED_CLASS;
        }
    } else if (!CName) {
        try {
            const classRes = await queries.project.sql(
                projectDir,
                "SELECT CName FROM Classes LIMIT 1",
                []
            );
            if (classRes && classRes.rows && classRes.rows.length > 0) {
                CName = classRes.rows[0].CName;
            } else {
                CName = UNLABELED_CLASS;
            }
        } catch (err) {
            CName = UNLABELED_CLASS;
        }
    }

    const isUnlabeledMode = CName === UNLABELED_CLASS;
    let totalImagesRes = { rows: [] };
    let imagesRes = { rows: [] };

    if (isUnlabeledMode) {
        if (req.query.IName) {
            try {
                totalImagesRes = await queries.project.sql(
                    projectDir,
                    "SELECT COUNT(*) as count FROM Images WHERE Images.IName = ? AND Images.IName NOT IN (SELECT IName FROM Labels)",
                    [req.query.IName]
                );
                imagesRes = await queries.project.sql(
                    projectDir,
                    "SELECT Images.IName FROM Images WHERE Images.IName = ? AND Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ? OFFSET ?",
                    [req.query.IName, pageSize, offset]
                );
            } catch (err) {}

            if (!imagesRes.rows || imagesRes.rows.length === 0) {
                try {
                    totalImagesRes = await queries.project.sql(
                        projectDir,
                        "SELECT COUNT(*) as count FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels)",
                        []
                    );
                    imagesRes = await queries.project.sql(
                        projectDir,
                        "SELECT Images.IName FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ? OFFSET ?",
                        [pageSize, offset]
                    );
                } catch (err) {}
            }
        } else {
            try {
                totalImagesRes = await queries.project.sql(
                    projectDir,
                    "SELECT COUNT(*) as count FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels)",
                    []
                );
                imagesRes = await queries.project.sql(
                    projectDir,
                    "SELECT Images.IName FROM Images WHERE Images.IName NOT IN (SELECT IName FROM Labels) LIMIT ? OFFSET ?",
                    [pageSize, offset]
                );
            } catch (err) {}
        }
    } else {
        try {
            totalImagesRes = await queries.project.sql(
                projectDir,
                "SELECT COUNT(*) as count FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ?",
                [CName]
            );
            imagesRes = await queries.project.sql(
                projectDir,
                "SELECT Images.IName FROM Images INNER JOIN Labels ON Images.IName = Labels.IName WHERE Labels.CName = ? LIMIT ? OFFSET ?",
                [CName, pageSize, offset]
            );
        } catch (err) {}
    }

    const rawImages = imagesRes.rows || [];
    const uniqueImages = rawImages.filter(
        (image, index, self) =>
            index === self.findIndex((img) => img.IName === image.IName)
    );

    const imageLabels = {};
    for (let i = 0; i < uniqueImages.length; i++) {
        const imageName = uniqueImages[i].IName;
        try {
            const labelRes = await queries.project.sql(
                projectDir,
                "SELECT * FROM Labels WHERE IName = ?",
                [imageName]
            );
            imageLabels[imageName] = labelRes.rows || [];
        } catch (err) {
            imageLabels[imageName] = [];
        }
    }

    let classes = [];
    try {
        const classRes = await queries.project.sql(projectDir, "SELECT * FROM Classes", []);
        classes = classRes.rows || [];
    } catch (err) {}

    const totalCount = (totalImagesRes.rows && totalImagesRes.rows[0] && totalImagesRes.rows[0].count !== undefined)
        ? Number(totalImagesRes.rows[0].count)
        : 0;
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
        classes: classes || [],
        currentPage: page,
        totalPageCount,
        selectedClass: CName,
        IDX: idx,
        admin,
        activePage: "Label",
    });
}

module.exports = getReviewPage;
