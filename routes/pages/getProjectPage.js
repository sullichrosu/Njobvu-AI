const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const queries = require("../../queries/queries");

async function getProjectPage(req, res) {
    var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();

    // get URL variables
    var IDX = parseInt(req.query.IDX),
        page = parseInt(req.query.page, 10) || 1,
        perPage = parseInt(req.query.perPage, 10) || 10,
        user = req.cookies.Username;

    var search = req.query.search || "";
    var reviewFilter = req.query.reviewFilter || req.query.review || "all";
    var labeledFilter = req.query.labeledFilter || req.query.labeled || "all";
    var sortBy = req.query.sortBy || "name";
    var sortOrder = req.query.sortOrder || "asc";

    if (isNaN(IDX) || IDX == undefined) {
        IDX = 0;
        return res.redirect("/home");
    }

    var projects = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        projects = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [user]);
    } else if (global.db && global.db.allAsync) {
        projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
    }

    var num = IDX;

    if (!projects || num >= projects.length) {
        return res.redirect("/home");
    }

    var PName = projects[num].PName;
    var admin = projects[num].Admin;

    var project_path = path.join(public_path, "public", "projects");
    global.logger.debug("this is the project path", project_path);
    var db_path = path.join(
        project_path,
        admin + "-" + PName,
        PName + ".db",
    );

    if (!fs.existsSync(db_path)) {
        global.logger.error("Database file does not exist:", db_path);
        return res.redirect("/home?error=project_not_found");
    }

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to pdb.")
    });

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

    var rawImages = await pdb.allAsync(
        "SELECT Images.IName, Images.reviewImage, Images.validateImage, COUNT(Labels.LID) AS numLabels " +
        "FROM Images LEFT JOIN Labels ON Images.IName = Labels.IName " +
        "GROUP BY Images.IName"
    );

    var filtered = queries.project.filterImages(rawImages || [], {
        search: search,
        review: reviewFilter,
        labeled: labeledFilter,
        sortBy: sortBy,
        sortOrder: sortOrder,
    });

    var total = filtered.length;
    var pages = Math.ceil(total / perPage) || 1;
    var startIndex = (page - 1) * perPage;
    var paginatedImages = filtered.slice(startIndex, startIndex + perPage);

    var list_counter = paginatedImages.map(img => img.numLabels || 0);

    var acc = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        acc = await global.managedDbClient.all("SELECT * FROM Access WHERE PName = ? AND Admin = ?", [PName, admin]);
    } else if (global.db && global.db.allAsync) {
        acc = await global.db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
    }
    var access = [];
    if (acc) {
        for (var i = 0; i < acc.length; i++) {
            access.push(acc[i].Username);
        }
    }
    pdb.close(function(err) {
        if (err) {
            global.logger.error(err);
        }
    });

    res.render("project", {
        title: "project",
        user: user,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        access: access,
        images: paginatedImages,
        list_counter: list_counter,
        current: page,
        pages: pages,
        perPage: perPage,
        logged: req.query.logged,
        search: search,
        reviewFilter: reviewFilter,
        labeledFilter: labeledFilter,
        sortBy: sortBy,
        sortOrder: sortOrder,
        activePage: "project",
    });
}

module.exports = getProjectPage;
