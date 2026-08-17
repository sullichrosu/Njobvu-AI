const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

async function getHomePage(req, res) {
    const user = req.cookies ? req.cookies.Username : undefined;
    let page = req.query.page ? parseInt(req.query.page, 10) : 1;
    let perPage = req.query.perPage ? parseInt(req.query.perPage, 10) : 10;
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(perPage) || perPage < 1) perPage = 10;

    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder || "asc";
    const needsReview = req.query.needsReview || "all";

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectsBaseDir = path.join(publicPath, "public", "projects");

    let accessRows = [];
    let accessAttempted = false;
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            if (userProjectsRes && userProjectsRes.success) {
                accessAttempted = true;
                accessRows = (userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
            }
        } catch (err) {}
    }
    if (!accessAttempted && global.db && typeof global.db.allAsync === "function") {
        try {
            accessRows = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }

    const results = [];
    if (accessRows && accessRows.length > 0) {
        for (let i = 0; i < accessRows.length; i++) {
            const acc = accessRows[i];
            let projRow = null;
            let projAttempted = false;
            if (queries.managed && typeof queries.managed.sql === "function") {
                try {
                    const projRes = await queries.managed.sql(
                        "SELECT * FROM Projects WHERE PName = ? AND Admin = ? AND (Validate = ? OR Validate = ? OR Validate IS NULL)",
                        [acc.PName, acc.Admin, 0, "0"]
                    );
                    if (projRes && projRes.success) {
                        projAttempted = true;
                        projRow = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);
                    }
                } catch (err) {}
            }
            if (!projAttempted && global.db && typeof global.db.getAsync === "function") {
                try {
                    projRow = await global.db.getAsync(
                        "SELECT * FROM `Projects` WHERE PName = '" +
                        acc.PName +
                        "' AND Admin = '" +
                        acc.Admin +
                        "' AND (Validate = 0 OR Validate = '0' OR Validate IS NULL)"
                    );
                } catch (err) {}
            }

            if (projRow) {
                results.push([projRow, i, 0, 0, 0, 0]);
            }
        }

        for (let i = 0; i < results.length; i++) {
            const proj = results[i][0];
            const projectDir = path.join(projectsBaseDir, `${proj.Admin}-${proj.PName}`);

            try {
                const imgRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Images", []);
                const numImages = (imgRes && imgRes.rows && imgRes.rows[0]) ? Number(imgRes.rows[0].count) : 0;

                const labeledRes = await queries.project.sql(projectDir, "SELECT COUNT(DISTINCT IName) as count FROM Labels", []);
                const numLabeled = (labeledRes && labeledRes.rows && labeledRes.rows[0]) ? Number(labeledRes.rows[0].count) : 0;

                const reviewRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Images WHERE reviewImage = 1", []);
                const numReview = (reviewRes && reviewRes.rows && reviewRes.rows[0]) ? Number(reviewRes.rows[0].count) : 0;

                const totalLabelsRes = await queries.project.sql(projectDir, "SELECT COUNT(*) as count FROM Labels", []);
                const totalLabels = (totalLabelsRes && totalLabelsRes.rows && totalLabelsRes.rows[0]) ? Number(totalLabelsRes.rows[0].count) : 0;

                let completePercent = 0;
                if (numLabeled > 0 && numImages > 0) {
                    completePercent = Math.trunc(100 * (numLabeled / numImages));
                }

                results[i][2] = numReview > 0 ? 1 : 0;
                results[i][3] = numImages;
                results[i][4] = completePercent;
                results[i][5] = totalLabels;
            } catch (err) {
                global.logger.error(`Error querying project stats for ${proj.PName}:`, err);
            }
        }
    }

    const filteredProjects = queries.managed.filterProjects(results, {
        search,
        needsReview,
        sortBy,
        sortOrder,
    });

    const projectNames = filteredProjects.map((item) => item[0].PName);
    const labelCounters = filteredProjects.map((item) => item[5] || 0);
    const reviewCounters = filteredProjects.map((item) => item[2] || 0);

    res.render("home", {
        title: "home",
        user,
        projects: filteredProjects,
        PNames: projectNames,
        list_counter: labelCounters,
        page,
        current: page,
        pages: Math.ceil(filteredProjects.length / perPage) || 1,
        perPage,
        logged: req.query.logged,
        needs_review: reviewCounters,
        search,
        sortBy,
        sortOrder,
        needsReview,
        activePage: null,
        IDX: null,
    });
}

module.exports = getHomePage;
