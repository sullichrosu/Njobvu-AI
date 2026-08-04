const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

async function getProjectPage(req, res) {
    var public_path = currentPath;

    // get URL variables
    var IDX = parseInt(req.query.IDX),
        page = req.query.page,
        perPage = req.query.perPage,
        user = req.cookies.Username,
        valid = 0;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );

    var num = IDX;

    if (num > projects.length) {
        valid = 1;
        return res.redirect("/home");
    }

    var PName = projects[num].PName;
    var admin = projects[num].Admin;

    var project_path = path.join(currentPath, "public", "projects");
    global.logger.debug("this is the project path", project_path);
    var db_path = path.join(
        project_path,
        admin + "-" + PName,
        PName + ".db",
    );

    if (page == undefined) {
        page = 1;
    }
    if (perPage == undefined) {
        perPage = 10;
    }

    if (!fs.existsSync(db_path)) {
        global.logger.error("Database file does not exist:", db_path);
        // Redirect or render an error page, as the project is not correctly set up.
        return res.redirect("/home?error=project_not_found");
    }

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to pdb.")
    });

    // create async database object functions
    pdb.getAsync = function(sql) {
        var that = this;
        return new Promise(function(resolve, reject) {
            that.get(sql, function(err, row) {
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
    pdb.allAsync = function(sql) {
        var that = this;
        return new Promise(function(resolve, reject) {
            that.all(sql, function(err, row) {
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

    var results1 = await pdb.allAsync(
        "SELECT * FROM `Images` LIMIT " +
        perPage +
        " OFFSET " +
        (page - 1) * perPage,
    );

    var results2 = await pdb.getAsync("SELECT COUNT(*) FROM Images");

    var list_counter = [];
    if (results1) {
        for (var i = 0; i < results1.length; i++) {
            var results3 = await pdb.getAsync(
                "SELECT COUNT(*) FROM `Labels` WHERE IName = '" +
                results1[i].IName +
                "'",
            );
            list_counter.push(results3 ? results3["COUNT(*)"] : 0);
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
    for (var i = 0; i < acc.length; i++) {
        access.push(acc[i].Username);
    }
    pdb.close(function(err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });
    res.render("project", {
        title: "project",
        user: user,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        access: access,
        images: results1 || [],
        list_counter: list_counter,
        current: page,
        pages: results2 ? Math.ceil(results2["COUNT(*)"] / perPage) : 0,
        perPage: perPage,
        logged: req.query.logged,
        activePage: "project",
    });
}

module.exports = getProjectPage;
