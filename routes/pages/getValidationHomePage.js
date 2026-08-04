async function getValidationHomePage(req, res) {
    var page = req.query.page,
        perPage = req.query.perPage,
        user = req.cookies.Username;

    var public_path = currentPath;
    var project_path = public_path + "public/projects/";

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
                    Number(1) +
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
                var dbpath =
                    project_path +
                    "/" +
                    results1[i][0].Admin +
                    "-" +
                    results1[i][0].PName +
                    "/" +
                    results1[i][0].PName +
                    ".db";

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
                    });
                };

                var numimg = await hdb.getAsync("SELECT COUNT(*) FROM Images");
                var numLabeled = await hdb.allAsync(
                    "SELECT DISTINCT IName FROM Labels",
                );
                var complete = Math.trunc(
                    100 * (numLabeled.length / numimg["COUNT(*)"]),
                );
                var found_review = await hdb.getAsync(
                    "SELECT COUNT(*) FROM Images WHERE reviewImage = 1",
                );
                counter = await hdb.getAsync("SELECT COUNT(*) FROM Labels");

                if (Number(found_review["COUNT(*)"]) == 0) {
                    review_counter.push(0);
                } else {
                    review_counter.push(1);
                    results1[i][2] = 1;
                }
                results1[i][3] = Number(numimg["COUNT(*)"]);
                results1[i][4] = complete;

                list_counter.push(counter["COUNT(*)"]);

                hdb.close(function (err) {
                    if (err) {
                        global.logger.error(err);
                    } else {
                    }
                });
            }
        }
    }
    res.render("homeV", {
        title: "homeV",
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
        activePage: "HomeV",
        IDX: null,
    });
}

module.exports = getValidationHomePage;
