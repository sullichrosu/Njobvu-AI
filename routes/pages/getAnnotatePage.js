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
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql("SELECT * FROM Access WHERE Username = ?", [user]);
            projects = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
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
    if (queries.project && typeof queries.project.getAllClasses === "function") {
        try {
            const classRes = await queries.project.getAllClasses(projectDir);
            classRows = (classRes && classRes.rows) ? classRes.rows : (Array.isArray(classRes) ? classRes : []);
        } catch (err) {}
    }
    if ((!classRows || classRows.length === 0) && global.sqlite3) {
        try {
            const dbPath = path.join(projectDir, `${PName}.db`);
            const tdb = new global.sqlite3.Database(dbPath, () => {});
            if (tdb && typeof tdb.all === "function") {
                classRows = await new Promise((resolve) => {
                    const cb = (err, rows) => resolve(rows || []);
                    if (tdb.all.length === 2) {
                        tdb.all("SELECT * FROM Classes", cb);
                    } else {
                        tdb.all("SELECT * FROM Classes", [], cb);
                    }
                });
            }
        } catch (err) {}
    }
    const classNames = (classRows || []).map((c) => c.CName);

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
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const projRes = await queries.managed.sql(
                "SELECT AutoSave FROM Projects WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            projRecord = (projRes && projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes && projRes.row ? projRes.row : null);
        } catch (err) {}
    }
    if (!projRecord && global.db && typeof global.db.getAsync === "function") {
        try {
            projRecord = await global.db.getAsync("SELECT AutoSave FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        } catch (err) {}
    }

    let accessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }

    if (!currClass && classNames.length > 0) {
        currClass = classNames[0];
    }

    const fsObj = global.fs || fs;
    const absImagePath = path.join(projectDir, "images", IName);

    if (!imageRecord || !fsObj.existsSync(absImagePath)) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    const relImagePath = `${relProjectPath}/images/${imageRecord.IName}`;
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
