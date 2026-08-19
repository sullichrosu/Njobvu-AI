const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getValidationProjectPage(req, res) {
    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();

    let idx = parseInt(req.query.IDX, 10);
    let page = parseInt(req.query.page, 10) || 1;
    let perPage = parseInt(req.query.perPage, 10) || 10;
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(perPage) || perPage < 1) perPage = 10;

    const sortFilter = req.query.sort;
    const imageClass = req.query.class;
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }

    let projects, PName, admin, projectDir, classNames;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (idx < 0 || idx >= projects.length) {
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = projects[idx]);
        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);

        const { rows: projectClasses } = await queries.project.getAllClasses(projectDir);
        classNames = projectClasses.map((c) => c.CName);
    } catch (err) {
        global.logger.error("Error loading validation project page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }
    let images = [];
    let totalCount = 0;

    const isInvalidClass = !imageClass || imageClass === "null" || !classNames.includes(imageClass);

    if (isInvalidClass && (!sortFilter || sortFilter === "null" || sortFilter === "Confidence")) {
        const imgRes = await queries.project.sql(
            projectDir,
            "SELECT * FROM Images LIMIT ? OFFSET ?",
            [perPage, (page - 1) * perPage]
        );
        images = (imgRes && imgRes.rows) ? imgRes.rows : [];

        const countRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Images", []);
        totalCount = (countRes && countRes.rows && countRes.rows[0]) ? countRes.rows[0].count : 0;
    } else if (sortFilter === "needs_review" && isInvalidClass) {
        const imgRes = await queries.project.sql(
            projectDir,
            "SELECT * FROM Images WHERE reviewImage = 1 LIMIT ? OFFSET ?",
            [perPage, (page - 1) * perPage]
        );
        images = (imgRes && imgRes.rows) ? imgRes.rows : [];

        const countRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Images WHERE reviewImage = 1", []);
        totalCount = (countRes && countRes.rows && countRes.rows[0]) ? countRes.rows[0].count : 0;
    } else if (sortFilter === "confidence" && isInvalidClass) {
        const allImgRes = await queries.project.getAllImages(projectDir);
        const allImages = (allImgRes && allImgRes.rows) ? allImgRes.rows : [];

        const valRes = await queries.project.getAllValidations(projectDir);
        const valRows = (valRes && valRes.rows) ? valRes.rows : [];

        const highestConf = {};
        valRows.forEach((item) => {
            if (!(item.IName in highestConf) || item.Confidence > highestConf[item.IName]) {
                highestConf[item.IName] = item.Confidence;
            }
        });

        allImages.sort((a, b) => {
            const confA = highestConf[a.IName] || 0;
            const confB = highestConf[b.IName] || 0;
            if (confA === confB) {
                return (a.IName || "").localeCompare(b.IName || "");
            }
            return confB - confA;
        });

        images = allImages;
        totalCount = allImages.length;
    } else if (sortFilter === "confidence" && imageClass && classNames.includes(imageClass)) {
        const imgClassRes = await queries.project.sql(
            projectDir,
            "SELECT DISTINCT IName FROM Labels WHERE CName = ?",
            [imageClass]
        );
        const imagesWithClass = (imgClassRes && imgClassRes.rows) ? imgClassRes.rows : [];

        const valRes = await queries.project.sql(
            projectDir,
            "SELECT Confidence, IName FROM Validation WHERE CName = ?",
            [imageClass]
        );
        const valRows = (valRes && valRes.rows) ? valRes.rows : [];

        const highestConf = {};
        valRows.forEach((item) => {
            if (!(item.IName in highestConf) || item.Confidence > highestConf[item.IName]) {
                highestConf[item.IName] = item.Confidence;
            }
        });

        imagesWithClass.sort((a, b) => {
            const confA = highestConf[a.IName] || 0;
            const confB = highestConf[b.IName] || 0;
            if (confA === confB) {
                return (a.IName || "").localeCompare(b.IName || "");
            }
            return confB - confA;
        });

        for (const item of imagesWithClass) {
            const imgRes = await queries.project.getImage(projectDir, item.IName);
            if (imgRes && imgRes.row) images.push(imgRes.row);
        }
        totalCount = images.length;
    } else if (sortFilter === "has_class") {
        let imgClassRes;
        if (imageClass && imageClass !== "null") {
            imgClassRes = await queries.project.sql(
                projectDir,
                "SELECT DISTINCT IName FROM Labels WHERE CName = ?",
                [imageClass]
            );
        } else {
            imgClassRes = await queries.project.sql(projectDir, "SELECT DISTINCT IName FROM Labels", []);
        }
        const imagesWithClass = (imgClassRes && imgClassRes.rows) ? imgClassRes.rows : [];
        imagesWithClass.sort((a, b) => (a.IName || "").localeCompare(b.IName || ""));

        for (const item of imagesWithClass) {
            const imgRes = await queries.project.getImage(projectDir, item.IName);
            if (imgRes && imgRes.row) images.push(imgRes.row);
        }
        totalCount = images.length;
    } else {
        const imgClassRes = await queries.project.sql(
            projectDir,
            "SELECT DISTINCT IName FROM Labels WHERE CName = ?",
            [imageClass]
        );
        const imagesWithClass = (imgClassRes && imgClassRes.rows) ? imgClassRes.rows : [];
        imagesWithClass.sort((a, b) => (a.IName || "").localeCompare(b.IName || ""));

        for (const item of imagesWithClass) {
            const imgRes = await queries.project.getImage(projectDir, item.IName);
            if (imgRes && imgRes.row) images.push(imgRes.row);
        }
        totalCount = images.length;
    }

    const imageLabels = [];
    const listCounter = [];
    const imageConf = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const labelsRes = await queries.project.getLabelsForImageName(projectDir, img.IName);
        const labelRows = (labelsRes && labelsRes.rows) ? labelsRes.rows : [];

        const usedLabels = new Set(labelRows.map((l) => l.CName));
        listCounter.push(labelRows.length);
        imageLabels.push(Array.from(usedLabels));

        const valRes = await queries.project.getAllValidationsForImage(projectDir, img.IName);
        const valRows = (valRes && valRes.rows) ? valRes.rows : [];

        if (valRows.length === 0) {
            imageConf.push(0);
        } else {
            let maxConf = 0;
            for (const val of valRows) {
                if (typeof val.Confidence === "number" && val.Confidence > maxConf) {
                    maxConf = val.Confidence;
                }
            }
            imageConf.push(maxConf);
        }
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        accessUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
    }

    res.render("projectV", {
        title: "projectV",
        user,
        PName,
        Admin: admin,
        IDX: idx,
        access: accessUsers,
        images,
        classes: imageLabels,
        list_counter: listCounter,
        current: page,
        pages: Math.ceil(totalCount / perPage) || 1,
        perPage,
        logged: req.query.logged,
        sortFilter,
        imageClass,
        projectClasses: classNames,
        imageConf,
        activePage: "ProjectV",
    });
}

module.exports = getValidationProjectPage;
