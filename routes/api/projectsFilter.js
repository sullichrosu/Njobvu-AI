const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const queries = require("../../queries/queries");

async function getFilteredProjectsApi(req, res) {
    try {
        const user = req.cookies.Username || req.query.username || req.query.user;
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: Username cookie or parameter required",
            });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const perPage = parseInt(req.query.perPage, 10) || 10;
        const search = req.query.search || "";
        const admin = req.query.admin || "";
        const needsReview = req.query.needsReview || "all";
        const validateMode = req.query.validateMode !== undefined ? parseInt(req.query.validateMode, 10) : null;
        const sortBy = req.query.sortBy || "name";
        const sortOrder = req.query.sortOrder || "asc";

        let accessRows = [];
        if (global.managedDbClient && global.managedDbClient.all) {
            accessRows = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
        } else if (global.db && global.db.allAsync) {
            accessRows = await global.db.allAsync("SELECT * FROM `Access` WHERE Username = '" + user + "'");
        }

        const public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        const project_base_path = path.join(public_path, "public", "projects");

        let projectList = [];

        for (let i = 0; i < accessRows.length; i++) {
            let Proj = null;
            if (global.managedDbClient && global.managedDbClient.get) {
                if (validateMode !== null && !isNaN(validateMode)) {
                    Proj = await global.managedDbClient.get(
                        "SELECT * FROM Projects WHERE PName = ? AND Admin = ? AND Validate = ?",
                        [accessRows[i].PName, accessRows[i].Admin, validateMode]
                    );
                } else {
                    Proj = await global.managedDbClient.get(
                        "SELECT * FROM Projects WHERE PName = ? AND Admin = ?",
                        [accessRows[i].PName, accessRows[i].Admin]
                    );
                }
            } else if (global.db && global.db.getAsync) {
                let query = "SELECT * FROM `Projects` WHERE PName = '" + accessRows[i].PName + "' AND Admin = '" + accessRows[i].Admin + "'";
                if (validateMode !== null && !isNaN(validateMode)) {
                    query += " AND Validate = '" + Number(validateMode) + "'";
                }
                Proj = await global.db.getAsync(query);
            }

            if (!Proj) continue;

            const dbpath = path.join(
                project_base_path,
                Proj.Admin + "-" + Proj.PName,
                Proj.PName + ".db"
            );

            let numImages = 0;
            let numLabels = 0;
            let percentLabeled = 0;
            let hasReview = 0;

            if (fs.existsSync(dbpath)) {
                await new Promise((resolve) => {
                    const hdb = new sqlite3.Database(dbpath, (err) => {
                        if (err) return resolve();

                        hdb.get("SELECT COUNT(*) as count FROM Images", (err, row1) => {
                            numImages = (row1 && row1.count) ? Number(row1.count) : 0;
                            hdb.get("SELECT COUNT(*) as count FROM Labels", (err, row2) => {
                                numLabels = (row2 && row2.count) ? Number(row2.count) : 0;
                                hdb.get("SELECT COUNT(DISTINCT IName) as count FROM Labels", (err, row3) => {
                                    const numLabeled = (row3 && row3.count) ? Number(row3.count) : 0;
                                    if (numImages > 0) {
                                        percentLabeled = Math.trunc(100 * (numLabeled / numImages));
                                    }
                                    hdb.get("SELECT COUNT(*) as count FROM Images WHERE reviewImage = 1", (err, row4) => {
                                        hasReview = (row4 && row4.count > 0) ? 1 : 0;
                                        hdb.close(() => resolve());
                                    });
                                });
                            });
                        });
                    });
                });
            }

            projectList.push({
                PName: Proj.PName,
                Admin: Proj.Admin,
                AutoSave: Proj.AutoSave,
                Validate: Proj.Validate,
                PDescription: Proj.PDescription || "",
                idx: i,
                needsReview: hasReview,
                numImages: numImages,
                numLabels: numLabels,
                percentLabeled: percentLabeled
            });
        }

        const filtered = queries.managed.filterProjects(projectList, {
            search,
            admin,
            needsReview,
            sortBy,
            sortOrder,
        });

        const total = filtered.length;
        const pages = Math.ceil(total / perPage) || 1;
        const startIndex = (page - 1) * perPage;
        const paginatedProjects = filtered.slice(startIndex, startIndex + perPage);

        return res.status(200).json({
            success: true,
            projects: paginatedProjects,
            total,
            page,
            perPage,
            pages,
        });
    } catch (err) {
        global.logger.error("Error in getFilteredProjectsApi:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error",
        });
    }
}

async function getFilteredImagesApi(req, res) {
    try {
        const user = req.cookies.Username || req.query.username || req.query.user;
        if (!user) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: Username cookie or parameter required",
            });
        }

        const IDX = parseInt(req.query.IDX !== undefined ? req.query.IDX : req.params.IDX, 10);
        let PName = req.query.PName;
        let admin = req.query.Admin || req.query.admin;

        let accessRows = [];
        if (global.managedDbClient && global.managedDbClient.all) {
            accessRows = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
        } else if (global.db && global.db.allAsync) {
            accessRows = await global.db.allAsync("SELECT * FROM `Access` WHERE Username = '" + user + "'");
        }

        if (!isNaN(IDX) && accessRows[IDX]) {
            PName = accessRows[IDX].PName;
            admin = accessRows[IDX].Admin;
        }

        if (!PName || !admin) {
            return res.status(400).json({
                success: false,
                error: "Invalid project parameters or IDX out of bounds",
            });
        }

        const hasAccess = accessRows.some(row => row.PName === PName && row.Admin === admin);
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: "Forbidden: You do not have access to this project",
            });
        }

        const public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();
        const db_path = path.join(public_path, "public", "projects", admin + "-" + PName, PName + ".db");

        if (!fs.existsSync(db_path)) {
            return res.status(404).json({
                success: false,
                error: "Project database file not found",
            });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const perPage = parseInt(req.query.perPage, 10) || 10;
        const search = req.query.search || "";
        const review = req.query.review !== undefined ? req.query.review : "all";
        const validate = req.query.validate !== undefined ? req.query.validate : "all";
        const labeled = req.query.labeled || "all";
        const sortBy = req.query.sortBy || "name";
        const sortOrder = req.query.sortOrder || "asc";

        let images = [];
        await new Promise((resolve, reject) => {
            const pdb = new sqlite3.Database(db_path, (err) => {
                if (err) return reject(err);

                const query = `
                    SELECT Images.IName, Images.reviewImage, Images.validateImage, COUNT(Labels.LID) AS numLabels
                    FROM Images
                    LEFT JOIN Labels ON Images.IName = Labels.IName
                    GROUP BY Images.IName
                `;

                pdb.all(query, [], (err, rows) => {
                    pdb.close();
                    if (err) return reject(err);
                    images = rows || [];
                    resolve();
                });
            });
        });

        const filtered = queries.project.filterImages(images, {
            search,
            review,
            validate,
            labeled,
            sortBy,
            sortOrder,
        });

        const total = filtered.length;
        const pages = Math.ceil(total / perPage) || 1;
        const startIndex = (page - 1) * perPage;
        const paginatedImages = filtered.slice(startIndex, startIndex + perPage);

        return res.status(200).json({
            success: true,
            PName,
            Admin: admin,
            images: paginatedImages,
            total,
            page,
            perPage,
            pages,
        });
    } catch (err) {
        global.logger.error("Error in getFilteredImagesApi:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error",
        });
    }
}

module.exports = {
    getFilteredProjectsApi,
    getFilteredImagesApi,
};
