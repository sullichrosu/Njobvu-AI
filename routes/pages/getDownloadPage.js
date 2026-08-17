async function getDownloadPage(req, res) {
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

    var public_path = currentPath;
    (main_path = public_path + "public/projects/"),
        (path = main_path + admin + "-" + PName + "/" + PName + ".db"),
        (training_path = main_path + admin + "-" + PName + "/training"),
        (log_path = training_path + "/logs/"),
        (python_path = training_path + "/python"),
        (weights_path = training_path + "/weights");

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
    } else if (!fs.existsSync(weights_path)) {
        fs.mkdirSync(weights_path);
    }

    var ddb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to ddb.")
    });

    // create async database object functions
    ddb.getAsync = function (sql) {
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
    ddb.allAsync = function (sql) {
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
    var results2 = await ddb.allAsync("SELECT * FROM `Classes`");
    var results3 = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName= '" +
            PName +
            "' AND Admin = '" +
            admin +
            "' AND Username != '" +
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

    // close the database
    ddb.close(function (err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    var colors = [];
    var i = 0;
    while (colors.length < results2.length) {
        if (i >= colorsJSON.length) {
            i = 0;
        }
        colors.push(colorsJSON[i]);
        i++;
    }

    //Get scripts
    var has_scripts = 0;
    var scripts = [];
    scripts = await readdirAsync(python_path);
    if (scripts.length > 0) {
        has_scripts = 1;
    }

    // Get weights files
    var weights = await readdirAsync(weights_path);

    res.render("download", {
        title: "download",
        user: user,
        Admin: results1.Admin,
        access: access,
        acc: acc,
        PName: PName,
        IDX: IDX,
        PDescription: results1.PDescription,
        AutoSave: results1.AutoSave,
        classes: results2,
        colors: colors,
        scripts: scripts,
        weights: weights,
        has_scripts: has_scripts,
        logged: req.query.logged,
        activePage: "Download",
    });
}

module.exports = getDownloadPage;
