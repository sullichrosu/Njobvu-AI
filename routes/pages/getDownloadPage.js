const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { getPageParams } = require("./pageContext");

async function getDownloadPage(req, res) {
    // get URL variables
    let { projectIndex: IDX, username: user } = getPageParams(req);

    if (isNaN(IDX) || IDX == undefined) {
        IDX = 0;
        return res.redirect("/home");
    }
    if (user == undefined) {
        return res.redirect("/");
    }

    var projects = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        const dbRes = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
        projects = (dbRes && dbRes.rows) ? dbRes.rows : (Array.isArray(dbRes) ? dbRes : []);
    } else if (global.db && global.db.allAsync) {
        projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
    }

    var num = IDX;

    if (!projects || num >= projects.length) {
        return res.redirect("/home");
    }
    var PName = projects[num].PName;
    var admin = projects[num].Admin;

    var public_path = typeof currentPath !== "undefined" ? currentPath : (global.currentPath || process.cwd());
    var main_path = path.join(public_path, "public", "projects");
    var project_dir = path.join(main_path, (admin ? admin + "-" : "") + PName);

    if (!fs.existsSync(project_dir) && fs.existsSync(main_path)) {
        const dirs = fs.readdirSync(main_path);
        const match = dirs.find((d) => d.endsWith("-" + PName) || d === PName);
        if (match) {
            project_dir = path.join(main_path, match);
        }
    }

    var db_file_path = path.join(project_dir, PName + ".db");
    var training_path = path.join(project_dir, "training");
    var log_path = path.join(training_path, "logs");
    var python_path = path.join(training_path, "python");
    var weights_path = path.join(training_path, "weights");

    if (!fs.existsSync(training_path)) {
        try {
            fs.mkdirSync(training_path, { recursive: true });
            fs.mkdirSync(log_path, { recursive: true });
            fs.mkdirSync(python_path, { recursive: true });
            fs.mkdirSync(weights_path, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating training dirs:", err);
        }
    } else if (!fs.existsSync(weights_path)) {
        try {
            fs.mkdirSync(weights_path, { recursive: true });
        } catch (err) {
            if (global.logger) global.logger.error("Error creating weights dir:", err);
        }
    }

    var ddb = new sqlite3.Database(db_file_path, (err) => {
        if (err) {
            return global.logger ? global.logger.error(err.message) : console.error(err.message);
        }
        if (global.logger) global.logger.info("Connected to ddb.");
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

    var projectInfo = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var classRows = await ddb.allAsync("SELECT * FROM `Classes`");
    var accessRows = await db.allAsync(
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
    for (var i = 0; i < accessRows.length; i++) {
        access.push(accessRows[i].Username);
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
    while (colors.length < classRows.length) {
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
        Admin: projectInfo.Admin,
        access: access,
        acc: acc,
        PName: PName,
        IDX: IDX,
        PDescription: projectInfo.PDescription,
        AutoSave: projectInfo.AutoSave,
        classes: classRows,
        colors: colors,
        scripts: scripts,
        weights: weights,
        has_scripts: has_scripts,
        logged: req.query.logged,
        activePage: "Download",
    });
}

module.exports = getDownloadPage;
