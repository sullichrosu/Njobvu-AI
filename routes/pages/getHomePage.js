const sqlite3 = require("sqlite3").verbose();
const path = require('path');
const fs = require('fs');
const queries = require("../../queries/queries");

async function getHomePage(req, res) {
    var page = req.query.page,
        perPage = req.query.perPage,
        user = req.cookies.Username;

    var search = req.query.search || "";
    var sortBy = req.query.sortBy || "name";
    var sortOrder = req.query.sortOrder || "asc";
    var needsReview = req.query.needsReview || "all";

    var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    var project_path = path.join(public_path, "public", "projects");

    if (page == undefined) {
        page = 1;
    }
    if (perPage == undefined) {
        perPage = 10;
    }

    var qnum = 0;
    var projects = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        projects = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
    } else if (global.db && global.db.allAsync) {
        projects = await global.db.allAsync("SELECT * FROM `Access` WHERE Username = '" + user + "'");
    }

    var results1 = [];
    var PNames = [];

    if (projects && projects.length > 0) {
        for (var i = 0; i < projects.length; i++) {
            var Proj = null;
            if (global.managedDbClient && global.managedDbClient.get) {
                Proj = await global.managedDbClient.get(
                    "SELECT * FROM Projects WHERE PName = ? AND Admin = ? AND Validate = ?",
                    [projects[i].PName, projects[i].Admin, 0]
                );
            } else if (global.db && global.db.getAsync) {
                Proj = await global.db.getAsync(
                    "SELECT * FROM `Projects` WHERE PName = '" +
                        projects[i].PName +
                        "' AND Admin = '" +
                        projects[i].Admin +
                        "' AND Validate = '0'",
                );
            }

            //[Project, IDX, Review, NumberOfImages, %labeled, list_counter]
            if (Proj != null) {
                results1.push([Proj, i, 0, 0, 0, 0]);
            }
        }
        if (results1.length != 0) {
            var list_counter = [];
            var review_counter = [];

            for (var i = 0; i < results1.length; i++) {
                var dbpath = path.join(
                    project_path,
                    results1[i][0].Admin + "-" + results1[i][0].PName,
                    results1[i][0].PName + ".db"
                );

                global.logger.debug("Attempting to connect to database:", dbpath);
                
                if (!fs.existsSync(dbpath)) {
                    global.logger.debug("Database file does not exist:", dbpath);
                    results1[i][2] = 0;
                    results1[i][3] = 0;
                    results1[i][4] = 0;
                    results1[i][5] = 0;
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

                await new Promise(resolve => setTimeout(resolve, 100));

                var numimg = await hdb.getAsync("SELECT COUNT(*) FROM Images");
                var numLabeled = await hdb.allAsync(
                    "SELECT DISTINCT IName FROM Labels",
                );
                var complete = 0;
                if (numLabeled && numLabeled.length > 0 && numimg && numimg["COUNT(*)"] > 0) {
                    complete = Math.trunc(
                        100 * (numLabeled.length / numimg["COUNT(*)"]),
                    );
                }
                var found_review = await hdb.getAsync(
                    "SELECT COUNT(*) FROM Images WHERE reviewImage = 1",
                );
                var counter = await hdb.getAsync("SELECT COUNT(*) FROM Labels");

                if (!found_review || Number(found_review["COUNT(*)"]) == 0) {
                    results1[i][2] = 0;
                } else {
                    results1[i][2] = 1;
                }
                results1[i][3] = numimg ? Number(numimg["COUNT(*)"]) : 0;
                results1[i][4] = complete;
                results1[i][5] = counter ? Number(counter["COUNT(*)"]) : 0;

                hdb.close(function (err) {
                    if (err) {
                        global.logger.error(err);
                    }
                });
            }
        }
    }

    results1 = queries.managed.filterProjects(results1, {
        search: search,
        needsReview: needsReview,
        sortBy: sortBy,
        sortOrder: sortOrder
    });

    PNames = results1.map(item => item[0].PName);
    var list_counter = results1.map(item => item[5] || 0);
    var review_counter = results1.map(item => item[2] || 0);

    res.render("home", {
        title: "home",
        user: user,
        projects: results1,
        PNames: PNames,
        list_counter: list_counter,
        page: page,
        current: page,
        pages: Math.ceil(results1.length / perPage),
        perPage: perPage,
        logged: req.query.logged,
        needs_review: review_counter,
        search: search,
        sortBy: sortBy,
        sortOrder: sortOrder,
        needsReview: needsReview,
        activePage: null,
        IDX: null,
    });
}

module.exports = getHomePage;
