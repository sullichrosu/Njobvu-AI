const { getPageParams } = require("./pageContext");
async function getStatsPage(req, res) {
    // get URL variables
    let { projectIndex: IDX, username: user } = getPageParams(req);

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
    var projectInfo = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var classRows = await sdb.allAsync("SELECT * FROM `Classes`");

    var classes = [];
    var counts = [];
    var icounts = [];
    var lcounts = 0;
    for (var i = 0; i < classRows.length; i++) {
        var classLabelCountRow = await sdb.getAsync(
            "SELECT COUNT(*) FROM Labels Where CName = '" +
                classRows[i].CName +
                "'",
        );
        classes.push(classRows[i].CName);
        counts.push(classLabelCountRow["COUNT(*)"]);
        var classImageRows = await sdb.allAsync(
            "SELECT DISTINCT IName FROM Labels WHERE CName = '" +
                classRows[i].CName +
                "'",
        );
        icounts.push(classImageRows.length);
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

    var imageCountRow = await sdb.getAsync("SELECT COUNT(*) FROM Images");
    var labeledImageRows = await sdb.allAsync("SELECT DISTINCT IName FROM Labels");
    var complete = Math.trunc(100 * (labeledImageRows.length / imageCountRow["COUNT(*)"]));

    // close the database
    sdb.close(function (err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    res.render("stats", {
        title: "stats",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        PDescription: projectInfo.PDescription,
        AutoSave: projectInfo.AutoSave,
        classes: classes,
        counts: counts,
        icounts: icounts,
        complete: complete,
        logged: req.query.logged,
        activePage: "Stats",
    });
}

module.exports = getStatsPage;
