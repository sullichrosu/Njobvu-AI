async function getClassSettingsPage(req, res) {
    var IDX = req.query.IDX;
    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }

    var user = req.cookies.Username;
    if (user == undefined) {
        return res.redirect("/");
    }

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    if (IDX >= projects.length) {
        valid = 1;
        return res.redirect("/home");
    }

    var PName = projects[IDX].PName;
    var admin = projects[IDX].Admin;

    var public_path = currentPath,
        main_path = public_path + "public/projects/",
        project_path = main_path + admin + "-" + PName,
        path = project_path + "/" + PName + ".db";

    var cfdb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to cfdb.")
    });

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

    var results2 = await cfdb.allAsync("SELECT * FROM `Classes`");

    cfdb.close(function (err) {
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

    try {
        res.render("settings/classSettings", {
            title: "classSettings",
            logged: req.query.logged,
            user: user,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            classes: results2,
            colors: colors,
            activePage: "classSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering classSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getClassSettingsPage;
