const fs = require("fs");

async function getValidationConfigPage(req, res) {
    try {
        var IDX = parseInt(req.query.IDX),
            user = req.cookies ? req.cookies.Username : undefined;

        if (isNaN(IDX) || req.query.IDX === undefined) {
            return res.redirect("/home");
        }

        if (user == undefined) {
            return res.redirect("/");
        }

        var projects = await db.allAsync(
            "SELECT * FROM Access WHERE Username = '" + user + "'",
        );
        var num = IDX;

        if (!projects || isNaN(num) || num < 0 || num >= projects.length) {
            return res.redirect("/home");
        }

        var PName = projects[num].PName;
        var admin = projects[num].Admin;

        var mergeProjects = await db.allAsync(
            "SELECT * FROM Access WHERE Username = '" +
                user +
                "' AND NOT PName = '" +
                PName +
                "'",
        ) || [];

        var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd(),
            main_path = public_path + "public/projects/",
            project_path = main_path + admin + "-" + PName,
            path = project_path + "/" + PName + ".db",
            training_path = project_path + "/training",
            log_path = training_path + "/logs/",
            python_path = training_path + "/python",
            python_path_file = training_path + "/Paths.txt",
            darknet_path_file = training_path + "/darknetPaths.txt",
            weights_path = training_path + "/weights";

        if (!fs.existsSync(training_path)) {
            fs.mkdirSync(training_path, { recursive: true });
            fs.mkdirSync(log_path, { recursive: true });
            fs.mkdirSync(python_path, { recursive: true });
            fs.mkdirSync(weights_path, { recursive: true });
            fs.writeFile(python_path_file, "", function (err) {
                if (err && global.logger) {
                    global.logger.error(err);
                }
            });
            fs.writeFile(darknet_path_file, "", function (err) {
                if (err && global.logger) {
                    global.logger.error(err);
                }
            });
        }
        if (!fs.existsSync(weights_path)) {
            fs.mkdirSync(weights_path, { recursive: true });
        }
        if (!fs.existsSync(darknet_path_file)) {
            fs.writeFile(darknet_path_file, "", function (err) {
                if (err && global.logger) {
                    global.logger.error(err);
                }
            });
        }
        if (!fs.existsSync(python_path_file)) {
            fs.writeFile(python_path_file, "", function (err) {
                if (err && global.logger) {
                    global.logger.error(err);
                }
            });
        }

        var cfdb = new sqlite3.Database(path, (err) => {
            if (err && global.logger) {
                return global.logger.error(err.message);
            }
            if (global.logger) global.logger.info("Connected to cfdb.");
        });

        // create async database object functions
        cfdb.getAsync = function (sql) {
            var that = this;
            return new Promise(function (resolve, reject) {
                that.get(sql, function (err, row) {
                    if (err) {
                        if (global.logger) global.logger.error("runAsync ERROR!", err);
                        reject(err);
                    } else resolve(row);
                });
            }).catch((err) => {
                if (global.logger) global.logger.error(err);
            });
        };
        cfdb.allAsync = function (sql) {
            var that = this;
            return new Promise(function (resolve, reject) {
                that.all(sql, function (err, row) {
                    if (err) {
                        if (global.logger) global.logger.error("runAsync ERROR!", err);
                        reject(err);
                    } else resolve(row);
                });
            }).catch((err) => {
                if (global.logger) global.logger.error(err);
            });
        };

        var results1 = await db.getAsync(
            "SELECT * FROM `Projects` WHERE PName = '" +
                PName +
                "' AND Admin = '" +
                admin +
                "'",
        ) || {};
        var results2 = (await cfdb.allAsync("SELECT * FROM `Classes`")) || [];
        var results3 = (await db.allAsync(
            "SELECT * FROM `Access` WHERE PName= '" +
                PName +
                "' AND Admin = '" +
                admin +
                "' AND Username != '" +
                user +
                "'",
        )) || [];
        var results4 = (await db.allAsync(
            "SELECT * FROM `Projects` WHERE PName = '" +
                PName +
                "' AND Admin != '" +
                user +
                "'",
        )) || [];
        var acc1 = (await db.allAsync(
            "SELECT * FROM `Access` WHERE PName = '" +
                PName +
                "' AND Admin = '" +
                admin +
                "'",
        )) || [];
        var acc = [];
        for (var i = 0; i < acc1.length; i++) {
            acc.push(acc1[i].Username);
        }
        var access = [];
        for (var i = 0; i < results3.length; i++) {
            access.push(results3[i].Username);
        }
        var DAdmin = [];
        for (var i = 0; i < results4.length; i++) {
            DAdmin.push(results4[i].Admin);
        }
        // close the database
        cfdb.close(function (err) {
            if (err && global.logger) {
                global.logger.error(err);
            }
        });

        var colors = [];
        var i = 0;
        var colorsJSONList = global.colorsJSON || [];
        while (colors.length < results2.length) {
            if (i >= colorsJSONList.length) {
                i = 0;
            }
            colors.push(colorsJSONList[i] || '#000000');
            i++;
        }

        var scripts = [];
        if (typeof readdirAsync === "function") {
            scripts = (await readdirAsync(python_path)) || [];
        } else if (global.readdirAsync) {
            scripts = (await global.readdirAsync(python_path)) || [];
        }

        var weights = [];
        if (typeof readdirAsync === "function") {
            weights = (await readdirAsync(weights_path)) || [];
        } else if (global.readdirAsync) {
            weights = (await global.readdirAsync(weights_path)) || [];
        }

        var paths = fs.existsSync(python_path_file)
            ? fs.readFileSync(python_path_file, "utf-8").split("\n").filter(Boolean)
            : [];

        var darknet_paths = fs.existsSync(darknet_path_file)
            ? fs.readFileSync(darknet_path_file, "utf-8").split("\n").filter(Boolean)
            : [];

        res.render("configV", {
            title: "config",
            user: user,
            Admin: results1.Admin || admin,
            DAdmin: DAdmin,
            access: access,
            acc: acc,
            PName: PName,
            IDX: IDX,
            PDescription: results1.PDescription || "",
            AutoSave: results1.AutoSave || 0,
            weights: weights,
            scripts: scripts,
            paths: paths,
            darknet_paths: darknet_paths,
            classes: results2,
            colors: colors,
            logged: req.query.logged,
            mergeProjects: mergeProjects,
            activePage: "ConfigurationV",
        });
    } catch (err) {
        if (global.logger) global.logger.error("Error in getValidationConfigPage:", err);
        if (!res.headersSent) {
            return res.redirect("/home");
        }
    }
}

module.exports = getValidationConfigPage;
