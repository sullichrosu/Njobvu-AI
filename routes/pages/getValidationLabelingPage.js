const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getValidationLabelingPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const IName = String(req.query.IName || "");
    let currClass = req.query.curr_class;
    const sortFilter = req.query.sort;
    const imageClass = req.query.class;
    const classFilter = req.query.classFilter;
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects, PName, admin, projectDir, relProjectPath, classNames;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (idx < 0 || idx >= projects.length) {
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = projects[idx]);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
        relProjectPath = `projects/${admin}-${PName}`;

        const { rows: classRows } = await queries.project.getAllClasses(projectDir);
        classNames = classRows.map((c) => c.CName);
    } catch (err) {
        global.logger.error("Error loading validation labeling page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    let images = [];
    const isInvalidClass = !imageClass || imageClass === "null" || !classNames.includes(imageClass);

    if (isInvalidClass && (!sortFilter || sortFilter === "null" || sortFilter === "Confidence")) {
        const imgRes = await queries.project.getAllImages(projectDir);
        images = (imgRes && imgRes.rows) ? imgRes.rows : [];
    } else if (sortFilter === "needs_review" && isInvalidClass) {
        const imgRes = await queries.project.sql(projectDir, "SELECT * FROM Images WHERE reviewImage = 1", []);
        images = (imgRes && imgRes.rows) ? imgRes.rows : [];
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
    }

    if (!currClass && classNames.length > 0) {
        currClass = classNames[0];
    }

    // curr_index/prev/next must be positions within `images` (the
    // filtered/sorted navigation set for the active sort/class filter), not
    // a ROW_NUMBER() over the entire unfiltered Images table - otherwise a
    // filter that shrinks the set below the image's global row number sends
    // prev/next out of bounds. If the requested image isn't in the active
    // filtered set at all (e.g. it was just marked reviewed and no longer
    // matches sort=needs_review), redirect to the first image still in the
    // set, or back to the project list if the filter is now empty.
    const requestedIndex = images.findIndex((img) => img.IName === IName);
    if (requestedIndex === -1) {
        const sortParam = sortFilter || "";
        if (images.length === 0) {
            return res.redirect(`/projectV?IDX=${idx}&page=1&perPage=10&sort=${sortParam}`);
        }
        return res.redirect(
            `/labelingV?IDX=${idx}&IName=${encodeURIComponent(images[0].IName)}&curr_class=${encodeURIComponent(currClass || "")}&sort=${sortParam}`
        );
    }

    let labels = [];
    try {
        const labelRes = await queries.project.getLabelsForImageName(projectDir, IName);
        labels = (labelRes && labelRes.rows) ? labelRes.rows : [];
    } catch (err) {}

    let imageRecord = null;
    try {
        const imgDetailRes = await queries.project.getImage(projectDir, IName);
        imageRecord = (imgDetailRes && imgDetailRes.row) ? imgDetailRes.row : null;
    } catch (err) {}

    let projRecord = null;
    try {
        const projRes = await queries.managed.sql(
            "SELECT AutoSave FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        projRecord = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);
    } catch (err) {
        global.logger.error("Error querying project record:", err);
    }

    let validations = [];
    try {
        const valRes = await queries.project.getAllValidationsForImage(projectDir, IName);
        validations = (valRes && valRes.rows) ? valRes.rows : [];
    } catch (err) {}

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

    const fsObj = global.fs || fs;
    const absImagePath = path.join(projectDir, "images", IName);
    if (!imageRecord || !fsObj.existsSync(absImagePath)) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    const relImagePath = `/${relProjectPath}/images/${imageRecord.IName}`;
    let imgData;
    try {
        const imgBuffer = fsObj.readFileSync(absImagePath);
        imgData = probe.sync(imgBuffer);
    } catch (err) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    const imgWidth = imgData.width;
    const imgHeight = imgData.height;
    const imageRatio = imgHeight / imgWidth;
    const imageDisplayWidth = imgWidth;
    const imageDisplayHeight = imageRatio * imageDisplayWidth;

    const currIndex = requestedIndex + 1;
    const prevIName = requestedIndex > 0 ? images[requestedIndex - 1].IName : -1;
    const nextIName = requestedIndex < images.length - 1 ? images[requestedIndex + 1].IName : -1;

    const colors = [];
    let colorIdx = 0;
    const colorList = global.colorsJSON || [];
    while (colors.length < classNames.length) {
        if (colorIdx >= colorList.length) {
            colorIdx = 0;
        }
        colors.push(colorList[colorIdx]);
        colorIdx++;
    }

    const statsMap = {};
    for (let a = 0; a < labels.length; a++) {
        const className = labels[a].CName;
        statsMap[className] = (statsMap[className] || 0) + 1;
    }
    const statsO = Object.entries(statsMap);

    res.render("labelingV", {
        title: "labelingV",
        user,
        access: accessUsers,
        image_width: imageDisplayWidth,
        image_height: imageDisplayHeight,
        image_path: relImagePath,
        image_name: imageRecord.IName,
        image_ratio: imageRatio,
        classes: classNames,
        images,
        labels,
        labelConf: validations,
        colors,
        IName,
        prev_IName: prevIName,
        next_IName: nextIName,
        PName,
        Admin: admin,
        IDX: idx,
        images_length: images.length,
        curr_index: currIndex,
        curr_class: currClass,
        rev_image: imageRecord.reviewImage,
        list_counter: [],
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        logged: req.query.logged,
        stats: statsO,
        sortFilter,
        imageClass,
        classFilter,
    });
}

module.exports = getValidationLabelingPage;
