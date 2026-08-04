async function getReviewPage(req, res) {
    var username = req.cookies.Username;
    var CName = req.query.class;
    var IDX = req.query.IDX;

    var page = parseInt(req.query.page) || 1;
    var pageSize = 100;
    var offset = (page - 1) * pageSize;

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

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            return global.logger.error("Database connection error:", err.message);
        }
        global.logger.info("Connected to pdb.")
    });

    pdb.allAsync = function (sql, params) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, params, function (err, row) {
                if (err) {
                    global.logger.error("runAsync ERROR!", err)
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        }).catch((err) => {
            global.logger.error(err);
        });
    };

    var totalImages = await pdb.allAsync(
        `
			SELECT COUNT(*) as count 
			FROM Images
			INNER JOIN Labels ON Images.IName = Labels.IName
			WHERE Labels.CName = ?
		`,
        [CName],
    );

    var images = await pdb.allAsync(
        `
			SELECT Images.IName
			FROM Images
			INNER JOIN Labels ON Images.IName = Labels.IName
			WHERE Labels.CName = ?
			LIMIT ? OFFSET ?
		`,
        [CName, pageSize, offset],
    );

    let uniqueImages = images.filter(
        (image, index, self) =>
            index === self.findIndex((img) => img.IName === image.IName),
    );

    var imageLabels = {};
    for (let i = 0; i < uniqueImages.length; i++) {
        let imageName = uniqueImages[i].IName;

        let labels = await pdb.allAsync(
            `
				SELECT * FROM Labels WHERE IName = ?
			`,
            [imageName],
        );

        imageLabels[imageName] = labels;
    }

    var classes = await pdb.allAsync("SELECT * FROM `Classes`");

    pdb.close((err) => {
        if (err) {
            global.logger.error("Error closing database connection:", err.message);
        }
        global.logger.debug("Closed pdb connection.");
    });

    let totalImagesCount = Math.ceil(totalImages[0].count / pageSize);

    res.render("review", {
        user: username,
        CName: CName,
        images: uniqueImages,
        imageLabels: imageLabels,
        PName: PName, // Added PName to the render call
        classes: classes,
        currentPage: page,
        totalPageCount: totalImagesCount,
        selectedClass: req.query.class,
        IDX: IDX,
        admin: admin,
        activePage: "Label",
    });
}

module.exports = getReviewPage;
