const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getAnnotatePage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const IName = String(req.query.IName || "");
    let currClass = req.query.curr_class;
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    try {
        const userProjectsRes = await queries.managed.getUserProjects(user);
        projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
    } catch (err) {
        global.logger.error("Error fetching projects for annotate page:", err);
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const relProjectPath = `projects/${admin}-${PName}`;

    let classRows = [];
    try {
        const classRes = await queries.project.getAllClasses(projectDir);
        classRows = (classRes && classRes.rows) ? classRes.rows : [];
    } catch (err) {
        global.logger.error("Error fetching classes for annotate page:", err);
    }
    const classNames = classRows.map((c) => c.CName);

    let allImages = [];
    try {
        const imgRes = await queries.project.getAllImages(projectDir);
        allImages = (imgRes && imgRes.rows) ? imgRes.rows : [];
    } catch (err) {
        global.logger.error("Error fetching images for annotate page:", err);
    }

    let rowidRecord = null;
    try {
        const rowidRes = await queries.project.sql(
            projectDir,
            "SELECT IName, display_id FROM (SELECT IName, ROW_NUMBER() OVER (ORDER BY rowid) AS display_id FROM Images) AS numbered WHERE IName = ?",
            [IName]
        );
        rowidRecord = (rowidRes && rowidRes.rows && rowidRes.rows.length > 0) ? rowidRes.rows[0] : null;
    } catch (err) {
        global.logger.error("Error querying image rowid:", err);
    }

    let labels = [];
    try {
        const labelRes = await queries.project.getLabelsForImageName(projectDir, IName);
        labels = (labelRes && labelRes.rows) ? labelRes.rows : [];
    } catch (err) {
        global.logger.error("Error querying image labels:", err);
    }

    let imageRecord = null;
    try {
        const imgDetailRes = await queries.project.getImage(projectDir, IName);
        imageRecord = (imgDetailRes && imgDetailRes.row) ? imgDetailRes.row : null;
    } catch (err) {
        global.logger.error("Error querying image record:", err);
    }

    let projRecord = null;
    try {
        const projRes = await queries.managed.sql(
            "SELECT AutoSave FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : null;
    } catch (err) {
        global.logger.error("Error querying project AutoSave:", err);
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );
        const rows = (accRes && accRes.rows) ? accRes.rows : [];
        accessUsers = rows.map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying access users:", err);
    }

    if (!currClass && classNames.length > 0) {
        currClass = classNames[0];
    }

    const absImagePath = path.join(projectDir, "images", IName);

    if (!imageRecord || !fs.existsSync(absImagePath)) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    const relImagePath = `${relProjectPath}/images/${imageRecord.IName}`;
    let imgData;
    try {
        const imgBuffer = fs.readFileSync(absImagePath);
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

    let prevIName = -1;
    let nextIName = -1;
    let currIndex = 1;

    if (rowidRecord && rowidRecord.display_id) {
        currIndex = Number(rowidRecord.display_id);
    }

    if (allImages && currIndex > 1 && allImages[currIndex - 2]) {
        prevIName = allImages[currIndex - 2].IName;
    }
    if (allImages && currIndex < allImages.length && allImages[currIndex]) {
        nextIName = allImages[currIndex].IName;
    }

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

    res.render("annotate", {
        title: "annotate",
        user,
        access: accessUsers,
        image_width: imageDisplayWidth,
        image_height: imageDisplayHeight,
        image_path: relImagePath,
        image_name: imageRecord.IName,
        image_ratio: imageRatio,
        classes: classNames,
        images: allImages || [],
        labels: labels || [],
        colors,
        IName,
        prev_IName: prevIName,
        next_IName: nextIName,
        PName,
        Admin: admin,
        IDX: idx,
        images_length: allImages ? allImages.length : 0,
        curr_index: currIndex,
        curr_class: currClass,
        rev_image: imageRecord.reviewImage,
        list_counter: [],
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        logged: req.query.logged,
        activePage: "project",
    });
}

module.exports = getAnnotatePage;
