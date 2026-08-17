async function getConfigPage(req, res) {
    // get URL variables
    var IDX = parseInt(req.query.IDX),
        user = req.cookies.Username;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }

    if (user == undefined) {
        return res.redirect("/");
    }
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    var num = IDX;

    if (num >= projects.length) {
        valid = 1;
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
    );

    var public_path = currentPath,
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
        fs.mkdirSync(training_path);
        fs.mkdirSync(log_path);
        fs.mkdirSync(python_path);
        fs.mkdirSync(weights_path);
        fs.writeFile(python_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
        fs.writeFile(darknet_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }
    if (!fs.existsSync(weights_path)) {
        fs.mkdirSync(weights_path);
    }
    if (!fs.existsSync(darknet_path_file)) {
        fs.writeFile(darknet_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }
    if (!fs.existsSync(python_path_file)) {
        fs.writeFile(python_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }

    var cfdb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to cfdb.")
    });

    // create async database object functions
    cfdb.getAsync = function (sql) {
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
    cfdb.allAsync = function (sql) {
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

    var results1 = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var results2 = await cfdb.allAsync("SELECT * FROM `Classes`");
    var results3 = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName= '" +
            PName +
            "' AND Admin = '" +
            admin +
            "' AND Username != '" +
            user +
            "'",
    );
    var results4 = await db.allAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin != '" +
            user +
            "'",
    );
    var acc1 = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
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
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    var colors = [];
    var i = 0;

    global.logger.debug(colors);
    global.logger.debug("this is colors", colorsJSON);

    while (colors.length < results2.length) {
        if (i >= colorsJSON.length) {
            i = 0;
        }
        colors.push(colorsJSON[i]);
        i++;
    }

    var scripts = [];
    scripts = await readdirAsync(python_path);

    var weights = [];
    weights = await readdirAsync(weights_path);

    var paths = fs
        .readFileSync(python_path_file, "utf-8")
        .split("\n")
        .filter(Boolean);

    var darknet_paths = fs
        .readFileSync(darknet_path_file, "utf-8")
        .split("\n")
        .filter(Boolean);

    res.render("config", {
        title: "config",
        user: user,
        Admin: results1.Admin,
        DAdmin: DAdmin,
        access: access,
        acc: acc,
        PName: PName,
        IDX: IDX,
        PDescription: results1.PDescription,
        AutoSave: results1.AutoSave,
        weights: weights,
        scripts: scripts,
        paths: paths,
        darknet_paths: darknet_paths,
        classes: results2,
        colors: colors,
        logged: req.query.logged,
        mergeProjects: mergeProjects,
        activePage: "Configuration",
    });
}

module.exports = getConfigPage;
