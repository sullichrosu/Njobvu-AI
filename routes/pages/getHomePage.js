const sqlite3 = require("sqlite3").verbose();
const path = require('path');
const fs = require('fs');

async function getHomePage(req, res) {
    var page = req.query.page,
        perPage = req.query.perPage,
        user = req.cookies.Username;

    var public_path = currentPath;
    var project_path = path.join(public_path, "public", "projects");

    if (page == undefined) {
        page = 1;
    }
    if (perPage == undefined) {
        perPage = 10;
    }

    var qnum = 0;
    var test = await db.allAsync(
        "SELECT * FROM `Access` WHERE Username = '" +
            user +
            "' LIMIT " +
            perPage +
            " OFFSET " +
            (page - 1) * perPage,
    );
    var projects = await db.allAsync(
        "SELECT * FROM `Access` WHERE Username = '" + user + "'",
    );
    var results1 = [];

    var test2 = [];
    var PNames = [];

    if (projects.length > 0) {
        for (var i = 0; i < projects.length; i++) {
            var Proj = await db.getAsync(
                "SELECT * FROM `Projects` WHERE PName = '" +
                    projects[i].PName +
                    "' AND Admin = '" +
                    projects[i].Admin +
                    "' AND Validate = '" +
                    Number(0) +
                    "'",
            );

            //[Project, IDX, Review, NumberOfImages, %labeled]
            if (Proj != null) {
                results1.push([Proj, i, 0, 0, 0]);
                PNames.push(Proj.PName);
            }
        }
        if (PNames.length != 0) {
            var list_counter = [];
            var review_counter = [];
            var counter = 0;

            for (var i = 0; i < results1.length; i++) {
                var dbpath = path.join(
                    project_path,
                    results1[i][0].Admin + "-" + results1[i][0].PName,
                    results1[i][0].PName + ".db"
                );

                global.logger.debug("Attempting to connect to database:", dbpath);
                
                // Check if database file exists
                const fs = require('fs');
                if (!fs.existsSync(dbpath)) {
                    global.logger.debug("Database file does not exist:", dbpath);
                    // Add default values for this project
                    review_counter.push(0);
                    results1[i][3] = 0;
                    results1[i][4] = 0;
                    list_counter.push(0);
                    continue;
                }

                // Connect to project databases
                var hdb = new sqlite3.Database(dbpath, (err) => {
                    if (err) {
                        return console.error(
                            "hdb connect error: ",
                            err.message,
                        );
                    }
                    global.logger.info("Connected to hdb.")
                });

                // Test database connection by checking if tables exist
                hdb.get("SELECT name FROM sqlite_master WHERE type='table' AND name='Images'", (err, row) => {
                    if (err) {
                        global.logger.error("Error checking Images table:", err);
                    } else if (row) {
                    } else {
                    }
                });

                // create async database object functions
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

                // Wait a moment for the connection to be fully established
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
                    review_counter.push(0);
                } else {
                    review_counter.push(1);
                    results1[i][2] = 1;
                }
                results1[i][3] = numimg ? Number(numimg["COUNT(*)"]) : 0;
                results1[i][4] = complete;

                list_counter.push(counter ? counter["COUNT(*)"] : 0);

                hdb.close(function (err) {
                    if (err) {
                        global.logger.error(err);
                    } else {
                    }
                });
            }
        }
    }

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
        activePage: null,
        IDX: null,
    });
}

module.exports = getHomePage;
