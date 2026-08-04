async function getValidationStatsPage(req, res) {
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
    var main_path = public_path + "public/projects/";
    var path = main_path + admin + "-" + PName + "/" + PName + ".db";

    var sdb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to tdb.")
    });

    // create async database object functions
    sdb.getAsync = function (sql) {
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
    sdb.allAsync = function (sql) {
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
    var results2 = await sdb.allAsync("SELECT * FROM `Classes`");

    var classes = [];
    var counts = [];
    var icounts = [];
    var lcounts = 0;
    for (var i = 0; i < results2.length; i++) {
        var results3 = await sdb.getAsync(
            "SELECT COUNT(*) FROM Labels Where CName = '" +
                results2[i].CName +
                "'",
        );
        classes.push(results2[i].CName);
        counts.push(results3["COUNT(*)"]);
        var results4 = await sdb.allAsync(
            "SELECT DISTINCT IName FROM Labels WHERE CName = '" +
                results2[i].CName +
                "'",
        );
        icounts.push(results4.length);
    }

    var acc = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var access = [];
    for (var i = 0; i < acc.length; i++) {
        access.push(acc[i].Username);
    }

    var results5 = await sdb.getAsync("SELECT COUNT(*) FROM Images");
    var results6 = await sdb.allAsync(
        "SELECT DISTINCT IName FROM Images WHERE reviewImage = 1",
    );
    var complete =
        100 - Math.trunc(100 * (results6.length / results5["COUNT(*)"]));

    // close the database
    sdb.close(function (err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    res.render("statsV", {
        title: "stats",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        PDescription: results1.PDescription,
        AutoSave: results1.AutoSave,
        classes: classes,
        counts: counts,
        icounts: icounts,
        complete: complete,
        logged: req.query.logged,
        activePage: "StatsV",
    });
}

module.exports = getValidationStatsPage;
