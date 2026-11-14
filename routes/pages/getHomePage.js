const sqlite3 = require("sqlite3").verbose();
const path = require('path');
const fs = require('fs');
const queries = require("../../queries/queries");

function getRows(result) {
    return (result && result.rows) ? result.rows : (Array.isArray(result) ? result : []);
}

function loadProjectStats(dbpath) {
    return new Promise((resolve) => {
        const hdb = new sqlite3.Database(dbpath, (err) => {
            if (err) return resolve({ needsReview: 0, numImages: 0, percentLabeled: 0, numLabels: 0 });

            const queries = [
                "SELECT COUNT(*) AS count FROM Images",
                "SELECT COUNT(DISTINCT IName) AS count FROM Labels",
                "SELECT COUNT(*) AS count FROM Images WHERE reviewImage = 1",
                "SELECT COUNT(*) AS count FROM Labels",
            ];

            Promise.all(queries.map((sql) => new Promise((queryResolve) => {
                hdb.get(sql, (queryErr, row) => queryResolve(queryErr ? null : row));
            }))).then(([images, labeled, review, labels]) => {
                const numImages = images ? Number(images.count) : 0;
                const numLabeled = labeled ? Number(labeled.count) : 0;
                resolve({
                    needsReview: review && Number(review.count) > 0 ? 1 : 0,
                    numImages,
                    percentLabeled: numImages > 0 ? Math.trunc(100 * numLabeled / numImages) : 0,
                    numLabels: labels ? Number(labels.count) : 0,
                });
            }).finally(() => hdb.close(() => {}));
        });
    });
}

async function getPagedManagedProjects(user, page, perPage, search, sortBy, sortOrder, needsReview) {
    // Project statistics are stored in separate databases, so only name/admin
    // sorting can be paged before opening those databases. Other sort/filter
    // modes use the legacy path below because they depend on those statistics.
    if (!global.managedDbClient || !global.managedDbClient.all ||
        !["name", "admin"].includes(sortBy) || needsReview !== "all") return null;

    const offset = (page - 1) * perPage;
    const direction = String(sortOrder).toLowerCase() === "desc" ? "DESC" : "ASC";
    const searchValue = `%${search}%`;
    const sql = `
        SELECT Projects.*, COUNT(*) OVER() AS total_count
        FROM Access
        INNER JOIN Projects ON Projects.PName = Access.PName AND Projects.Admin = Access.Admin
        WHERE Access.Username = ?
          AND (Projects.Validate = ? OR Projects.Validate = ? OR Projects.Validate IS NULL)
          AND (Projects.PName LIKE ? OR Projects.Admin LIKE ?)
        ORDER BY Projects.${sortBy === "admin" ? "Admin" : "PName"} ${direction}
        LIMIT ? OFFSET ?`;

    let dbRes;
    try {
        dbRes = await global.managedDbClient.all(sql, [user, 0, "0", searchValue, searchValue, perPage, offset]);
    } catch (err) {
        return null;
    }
    const rows = getRows(dbRes);
    // Test doubles and older managed clients may not understand window
    // functions; let the established implementation handle those cases.
    if (rows.length && (!rows[0].PName || rows[0].total_count === undefined)) return null;

    let total = rows.length ? Number(rows[0].total_count) : 0;
    if (!rows.length) {
        const countSql = `
            SELECT COUNT(*) AS total_count
            FROM Access
            INNER JOIN Projects ON Projects.PName = Access.PName AND Projects.Admin = Access.Admin
            WHERE Access.Username = ?
              AND (Projects.Validate = ? OR Projects.Validate = ? OR Projects.Validate IS NULL)
              AND (Projects.PName LIKE ? OR Projects.Admin LIKE ?)`;
        try {
            const countRes = await global.managedDbClient.get(countSql, [user, 0, "0", searchValue, searchValue]);
            total = Number((countRes && countRes.row && countRes.row.total_count) || 0);
        } catch (err) {
            return null;
        }
    }

    return {
        rows,
        total,
    };
}

async function getHomePage(req, res) {
    var page = req.query.page,
        perPage = req.query.perPage,
        user = req.cookies.Username;

    var search = req.query.search || "";
    var sortBy = req.query.sortBy || "name";
    var sortOrder = req.query.sortOrder || "asc";
    var needsReview = req.query.needsReview || "all";

    var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    var projectsPath = path.join(public_path, "public", "projects");

    if (page == undefined) {
        page = 1;
    }
    if (perPage == undefined) {
        perPage = 10;
    }

    var accessibleProjects = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        const dbRes = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
        accessibleProjects = getRows(dbRes);
    } else if (global.db && global.db.allAsync) {
        accessibleProjects = await global.db.allAsync("SELECT * FROM `Access` WHERE Username = '" + user + "'");
    }

    var projectSummaries = [];
    var projectNames = [];

    const paged = await getPagedManagedProjects(
        user,
        Number(page),
        Number(perPage),
        search,
        sortBy,
        sortOrder,
        needsReview,
    );

    if (paged) {
        const accessRows = accessibleProjects;

        projectSummaries = await Promise.all(paged.rows.map(async (project) => {
            const idx = accessRows.findIndex((access) =>
                access.PName === project.PName && access.Admin === project.Admin);
            const dbpath = path.join(
                projectsPath,
                project.Admin + "-" + project.PName,
                project.PName + ".db",
            );
            const stats = fs.existsSync(dbpath)
                ? await loadProjectStats(dbpath)
                : { needsReview: 0, numImages: 0, percentLabeled: 0, numLabels: 0 };
            return [
                project,
                idx,
                stats.needsReview,
                stats.numImages,
                stats.percentLabeled,
                stats.numLabels,
            ];
        }));

        projectNames = projectSummaries.map(item => item[0].PName);
        var labelCounts = projectSummaries.map(item => item[5] || 0);
        var reviewStatuses = projectSummaries.map(item => item[2] || 0);

        return res.render("home", {
            title: "home", user, projects: projectSummaries, PNames: projectNames, list_counter: labelCounts,
            page, current: page, pages: Math.ceil(paged.total / perPage), perPage,
            logged: req.query.logged, needs_review: reviewStatuses, search, sortBy,
            sortOrder, needsReview, projectsArePaginated: true, activePage: null, IDX: null,
        });
    }

    if (accessibleProjects && accessibleProjects.length > 0) {
        for (var i = 0; i < accessibleProjects.length; i++) {
            var projectRecord = null;
            if (global.managedDbClient && global.managedDbClient.get) {
                const dbRes = await global.managedDbClient.get(
                    "SELECT * FROM Projects WHERE PName = ? AND Admin = ? AND (Validate = ? OR Validate = ? OR Validate IS NULL)",
                    [accessibleProjects[i].PName, accessibleProjects[i].Admin, 0, '0']
                );
                projectRecord = (dbRes && dbRes.row !== undefined) ? dbRes.row : null;
            } else if (global.db && global.db.getAsync) {
                projectRecord = await global.db.getAsync(
                    "SELECT * FROM `Projects` WHERE PName = '" +
                        accessibleProjects[i].PName +
                        "' AND Admin = '" +
                        accessibleProjects[i].Admin +
                        "' AND (Validate = '0' OR Validate = 0 OR Validate IS NULL)",
                );
            }

            //[Project, IDX, Review, NumberOfImages, %labeled, label count]
            if (projectRecord != null) {
                projectSummaries.push([projectRecord, i, 0, 0, 0, 0]);
            }
        }
        if (projectSummaries.length != 0) {
            var labelCounts = [];
            var reviewStatuses = [];

            for (var i = 0; i < projectSummaries.length; i++) {
                var dbpath = path.join(
                    projectsPath,
                    projectSummaries[i][0].Admin + "-" + projectSummaries[i][0].PName,
                    projectSummaries[i][0].PName + ".db"
                );

                global.logger.debug("Attempting to connect to database:", dbpath);
                
                if (!fs.existsSync(dbpath)) {
                    global.logger.debug("Database file does not exist:", dbpath);
                    projectSummaries[i][2] = 0;
                    projectSummaries[i][3] = 0;
                    projectSummaries[i][4] = 0;
                    projectSummaries[i][5] = 0;
                    continue;
                }

                var hdb = new sqlite3.Database(dbpath, (err) => {
                    if (err) {
                        return console.error(
                            "hdb connect error: ",
                            err.message,
                        );
                    }
                    global.logger.info("Connected to hdb.")
                });

                hdb.getAsync = function (sql) {
                    var that = this;
                    return new Promise(function (resolve, reject) {
                        that.get(sql, function (err, row) {
                            if (err) {
                                global.logger.error("runAsync ERROR!", err)
                                reject(err);
                            } else resolve(row);
                        });
                    }).catch((err) => {
                        global.logger.error(err);
                        return null;
                    });
                };
                hdb.allAsync = function (sql) {
                    var that = this;
                    return new Promise(function (resolve, reject) {
                        that.all(sql, function (err, row) {
                            if (err) {
                                global.logger.error("runAsync ERROR!", err)
                                reject(err);
                            } else resolve(row);
                        });
                    }).catch((err) => {
                        global.logger.error(err);
                        return [];
                    });
                };

                var numimg = await hdb.getAsync("SELECT COUNT(*) AS count FROM Images");
                var numLabeled = await hdb.getAsync("SELECT COUNT(DISTINCT IName) AS count FROM Labels");
                var complete = 0;
                if (numLabeled && numimg && numimg.count > 0) {
                    complete = Math.trunc(
                        100 * (numLabeled.count / numimg.count),
                    );
                }
                var found_review = await hdb.getAsync("SELECT COUNT(*) AS count FROM Images WHERE reviewImage = 1");
                var counter = await hdb.getAsync("SELECT COUNT(*) AS count FROM Labels");

                if (!found_review || Number(found_review.count) == 0) {
                    projectSummaries[i][2] = 0;
                } else {
                    projectSummaries[i][2] = 1;
                }
                projectSummaries[i][3] = numimg ? Number(numimg.count) : 0;
                projectSummaries[i][4] = complete;
                projectSummaries[i][5] = counter ? Number(counter.count) : 0;

                hdb.close(function (err) {
                    if (err) {
                        global.logger.error(err);
                    }
                });
            }
        }
    }

    projectSummaries = queries.managed.filterProjects(projectSummaries, {
        search: search,
        needsReview: needsReview,
        sortBy: sortBy,
        sortOrder: sortOrder
    });

    projectNames = projectSummaries.map(item => item[0].PName);
    var labelCounts = projectSummaries.map(item => item[5] || 0);
    var reviewStatuses = projectSummaries.map(item => item[2] || 0);

    res.render("home", {
        title: "home",
        user: user,
        projects: projectSummaries,
        PNames: projectNames,
        list_counter: labelCounts,
        page: page,
        current: page,
        pages: Math.ceil(projectSummaries.length / perPage),
        perPage: perPage,
        logged: req.query.logged,
        needs_review: reviewStatuses,
        search: search,
        sortBy: sortBy,
        sortOrder: sortOrder,
        needsReview: needsReview,
        projectsArePaginated: false,
        activePage: null,
        IDX: null,
    });
}

module.exports = getHomePage;
