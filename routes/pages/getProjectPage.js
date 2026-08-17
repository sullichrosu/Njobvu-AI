const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getProjectPage(req, res) {
    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();

    let idx = parseInt(req.query.IDX, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = parseInt(req.query.perPage, 10) || 10;
    const user = req.cookies ? req.cookies.Username : undefined;

    const search = req.query.search || "";
    const reviewFilter = req.query.reviewFilter || req.query.review || "all";
    const labeledFilter = req.query.labeledFilter || req.query.labeled || "all";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder || "asc";

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
        return res.redirect("/home");
    }

    let projects = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const dbPath = path.join(projectDir, `${PName}.db`);

    const fsObj = global.fs || fs;
    if (!fsObj.existsSync(dbPath)) {
        global.logger.error("Database file does not exist:", dbPath);
        return res.redirect("/home?error=project_not_found");
    }

    let rawImages = [];
    try {
        const imgRes = await queries.project.sql(
            projectDir,
            "SELECT Images.IName, Images.reviewImage, Images.validateImage, COUNT(Labels.LID) AS numLabels FROM Images LEFT JOIN Labels ON Images.IName = Labels.IName GROUP BY Images.IName",
            []
        );
        rawImages = (imgRes && imgRes.rows) ? imgRes.rows : [];
    } catch (err) {
        global.logger.error("Error querying images for project page:", err);
    }

    const filtered = queries.project.filterImages(rawImages || [], {
        search,
        review: reviewFilter,
        labeled: labeledFilter,
        sortBy,
        sortOrder,
    });

    const total = filtered.length;
    const pages = Math.ceil(total / perPage) || 1;
    const startIndex = (page - 1) * perPage;
    const paginatedImages = filtered.slice(startIndex, startIndex + perPage);
    const listCounter = paginatedImages.map((img) => img.numLabels || 0);

    let accessUsers = [];
    if (global.db && typeof global.db.allAsync === "function") {
        try {
            const acc = await global.db.allAsync("SELECT * FROM Access WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
            accessUsers = acc ? acc.map((r) => r.Username) : [];
        } catch (err) {}
    }
    if ((!accessUsers || accessUsers.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }

    res.render("project", {
        title: "project",
        user,
        PName,
        Admin: admin,
        IDX: idx,
        access: accessUsers,
        images: paginatedImages,
        list_counter: listCounter,
        current: page,
        pages,
        perPage,
        logged: req.query.logged,
        search,
        reviewFilter,
        labeledFilter,
        sortBy,
        sortOrder,
        activePage: "project",
    });
}

module.exports = getProjectPage;
