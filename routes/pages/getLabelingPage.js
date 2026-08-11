const UNLABELED_CLASS = require("../../utils/unlabeledClass");

async function getLabelingPage(req, res) {
    var username = req.cookies.Username;
    var IDX = parseInt(req.query.IDX, 10);
    var user = req.cookies.Username;

    if (isNaN(IDX) || IDX == undefined) {
        IDX = 0;
        return res.redirect("/home");
    }
    if (user == undefined) {
        return res.redirect("/");
    }

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );

    var num = IDX;

    if (!projects || num >= projects.length) {
        return res.redirect("/home");
    }
    var PName = projects[num].PName;
    var admin = projects[num].Admin;

    var public_path = currentPath;
    var main_path = public_path + "public/projects/";
    var path = main_path + admin + "-" + PName + "/" + PName + ".db";

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + username + "'",
    );
    var project = projects[IDX];

    if (!project) {
        global.logger.error("No project found for IDX:", IDX);
        return res.redirect("/home");
    }

    var PName = project.PName;
    var admin = project.Admin;

    var public_path = currentPath;
    var db_path =
        public_path +
        "public/projects/" +
        admin +
        "-" +
        PName +
        "/" +
        PName +
        ".db";

    global.logger.debug("Accessing database file:", db_path);

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            return global.logger.error("Database connection error:", err.message);
        }
        global.logger.info("Connected to pdb.")
    });
    var sdb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to tdb.")
    });
    pdb.allAsync = function (sql) {
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
    var Classes = await pdb.allAsync("SELECT * FROM `Classes`");
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
    var lcounts = {};

    if (Classes && results2) {
        for (var i = 0; i < Classes.length; i++) {
            let countQuery = await sdb.getAsync(
                "SELECT COUNT(*) FROM Labels WHERE CName = '" +
                    results2[i].CName +
                    "'",
            );

            const valueLabel = countQuery ? countQuery["COUNT(*)"] : 0;
            lcounts[Classes[i].CName] = valueLabel;
        }
    }

    var acc = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var access = [];
    if (acc) {
        for (var i = 0; i < acc.length; i++) {
            access.push(acc[i].Username);
        }
    }

    var results5 = await sdb.getAsync("SELECT COUNT(*) FROM Images");
    var results6 = await sdb.allAsync("SELECT DISTINCT IName FROM Labels");

    var unlabeledCountQuery = await sdb.getAsync(
        "SELECT COUNT(*) as count FROM Images WHERE IName NOT IN (SELECT IName FROM Labels)",
    );
    var unlabeledCount = unlabeledCountQuery ? unlabeledCountQuery.count : 0;

    sdb.close(function (err) {
        if (err) {
            global.logger.error(err);
        }
    });

    res.render("labeling", {
        title: "labeling",
        user: username,
        logged: req.query.logged,
        db: req.query.db,
        PName: PName,
        classes: Classes || [],
        IDX: IDX,
        lcounts: lcounts,
        unlabeledCount: unlabeledCount,
        unlabeledClass: UNLABELED_CLASS,
        activePage: "Label",
    });
}

module.exports = getLabelingPage;