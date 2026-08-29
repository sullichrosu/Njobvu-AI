const path = require("path");
const UNLABELED_CLASS = require("../../utils/unlabeledClass");

async function getReviewPage(req, res) {
    var sqlite3 = global.sqlite3 || require("sqlite3").verbose();
    var username = req.cookies.Username;
    var CName = req.query.class;
    var IName = req.query.IName;
    var IDX = parseInt(req.query.IDX, 10);

    if (isNaN(IDX) || IDX === undefined) {
        IDX = 0;
    }

    var page = parseInt(req.query.page, 10) || 1;
    var pageSize = 100;
    var offset = (page - 1) * pageSize;

    var projects = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        const dbRes = await global.managedDbClient.all("SELECT * FROM Access WHERE Username = ?", [username]);
        projects = (dbRes && dbRes.rows) ? dbRes.rows : (Array.isArray(dbRes) ? dbRes : []);
    } else if (global.db && global.db.allAsync) {
        projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + username + "'");
    }

    var project = projects[IDX];

    if (!project) {
        if (global.logger) global.logger.error("No project found for IDX:", IDX);
        return res.redirect("/home");
    }

    var PName = project.PName;
    var admin = project.Admin;

    var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    var project_path = path.join(public_path, "public", "projects");
    var db_path = path.join(project_path, admin + "-" + PName, PName + ".db");

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            if (global.logger) global.logger.error("Database connection error:", err.message);
            return;
        }
        if (global.logger) global.logger.info("Connected to pdb.");
    });

    pdb.allAsync = function (sql, params) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, params, function (err, row) {
                if (err) {
                    if (global.logger) global.logger.error("runAsync ERROR!", err);
                    reject(err);
                } else {
                    resolve(row || []);
                }
            });
        }).catch((err) => {
            if (global.logger) global.logger.error(err);
            return [];
        });
    };

    // If CName is missing but IName was provided, look up the label class for IName
    if (!CName && IName) {
        let matchingLabels = await pdb.allAsync(
            "SELECT CName FROM Labels WHERE IName = ? LIMIT 1",
            [IName]
        );
        if (matchingLabels && matchingLabels.length > 0) {
            CName = matchingLabels[0].CName;
        } else {
            CName = UNLABELED_CLASS;
        }
    } else if (!CName) {
        let firstClass = await pdb.allAsync("SELECT CName FROM Classes LIMIT 1");
        if (firstClass && firstClass.length > 0) {
            CName = firstClass[0].CName;
        } else {
            CName = UNLABELED_CLASS;
        }
    }

    var isUnlabeledMode = CName === UNLABELED_CLASS;

    var totalImages;
    var images;

    if (isUnlabeledMode) {
        // Unlabeled bucket: images with zero rows in Labels at all.
        if (IName) {
            totalImages = await pdb.allAsync(
                `
				SELECT COUNT(*) as count
				FROM Images
				WHERE Images.IName = ? AND Images.IName NOT IN (SELECT IName FROM Labels)
			`,
                [IName]
            );
            images = await pdb.allAsync(
                `
				SELECT Images.IName
				FROM Images
				WHERE Images.IName = ? AND Images.IName NOT IN (SELECT IName FROM Labels)
				LIMIT ? OFFSET ?
			`,
                [IName, pageSize, offset]
            );
            if (!images || images.length === 0) {
                totalImages = await pdb.allAsync(
                    `
					SELECT COUNT(*) as count
					FROM Images
					WHERE Images.IName NOT IN (SELECT IName FROM Labels)
				`
                );
                images = await pdb.allAsync(
                    `
					SELECT Images.IName
					FROM Images
					WHERE Images.IName NOT IN (SELECT IName FROM Labels)
					LIMIT ? OFFSET ?
				`,
                    [pageSize, offset]
                );
            }
        } else {
            totalImages = await pdb.allAsync(
                `
				SELECT COUNT(*) as count
				FROM Images
				WHERE Images.IName NOT IN (SELECT IName FROM Labels)
			`
            );

            images = await pdb.allAsync(
                `
				SELECT Images.IName
				FROM Images
				WHERE Images.IName NOT IN (SELECT IName FROM Labels)
				LIMIT ? OFFSET ?
			`,
                [pageSize, offset]
            );
        }
    } else {
        totalImages = await pdb.allAsync(
            `
				SELECT COUNT(*) as count
				FROM Images
				INNER JOIN Labels ON Images.IName = Labels.IName
				WHERE Labels.CName = ?
			`,
            [CName]
        );

        images = await pdb.allAsync(
            `
				SELECT Images.IName
				FROM Images
				INNER JOIN Labels ON Images.IName = Labels.IName
				WHERE Labels.CName = ?
				LIMIT ? OFFSET ?
			`,
            [CName, pageSize, offset]
        );
    }

    let uniqueImages = (images || []).filter(
        (image, index, self) =>
            index === self.findIndex((img) => img.IName === image.IName)
    );

    var imageLabels = {};
    for (let i = 0; i < uniqueImages.length; i++) {
        let imageName = uniqueImages[i].IName;

        let labels = await pdb.allAsync(
            `
				SELECT * FROM Labels WHERE IName = ?
			`,
            [imageName]
        );

        imageLabels[imageName] = labels;
    }

    var classes = await pdb.allAsync("SELECT * FROM `Classes`");

    pdb.close((err) => {
        if (err && global.logger) {
            global.logger.error("Error closing database connection:", err.message);
        }
        if (global.logger) global.logger.debug("Closed pdb connection.");
    });

    let totalCount = (totalImages && totalImages[0] && totalImages[0].count) ? totalImages[0].count : 0;
    let totalImagesCount = Math.ceil(totalCount / pageSize) || 1;

    res.render("review", {
        user: username,
        CName: CName,
        displayClassName: isUnlabeledMode ? "Unlabeled" : CName,
        isUnlabeledMode: isUnlabeledMode,
        unlabeledClass: UNLABELED_CLASS,
        images: uniqueImages,
        imageLabels: imageLabels,
        PName: PName,
        classes: classes || [],
        currentPage: page,
        totalPageCount: totalImagesCount,
        selectedClass: CName,
        IDX: IDX,
        admin: admin,
        activePage: "Label",
    });
}

module.exports = getReviewPage;
