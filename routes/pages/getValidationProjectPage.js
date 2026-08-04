async function getValidationProjectPage(req, res) {
    var public_path = currentPath;

    // get URL variables
    var IDX = parseInt(req.query.IDX),
        page = req.query.page,
        perPage = req.query.perPage,
        sortFilter = req.query.sort,
        imageClass = req.query.class,
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

    if (page == undefined) {
        page = 1;
    }
    if (perPage == undefined) {
        perPage = 10;
    }

    var pdb = new sqlite3.Database(db_path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to pdb.")
    });

    // create async database object functions
    pdb.getAsync = function (sql) {
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
    var projectClasses = await pdb.allAsync("SELECT * FROM `Classes`");
    var Classes = [];
    for (var i = 0; i < projectClasses.length; i++) {
        Classes.push(projectClasses[i].CName);
    }
    var results1 = Array();
    var results2 = { "COUNT(*)": 1 };

    // var results1 = await pdb.allAsync("SELECT * FROM `Images` LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);

    if (
        ((imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass)) &&
            (sortFilter == "null" || sortFilter == null)) ||
        (sortFilter == "Confidence" && imageClass == "null")
    ) {
        results1 = await pdb.allAsync(
            "SELECT * FROM `Images` LIMIT " +
                perPage +
                " OFFSET " +
                (page - 1) * perPage,
        );
        results2 = await pdb.getAsync("SELECT COUNT(*) FROM Images");
    } else if (
        sortFilter == "needs_review" &&
        (imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass))
    ) {
        results1 = await pdb.allAsync(
            "SELECT * FROM `Images` WHERE reviewImage=1 LIMIT " +
                perPage +
                " OFFSET " +
                (page - 1) * perPage,
        );
        results2 = await pdb.getAsync(
            "SELECT COUNT(*) FROM Images WHERE reviewImage=1",
        );
    } else if (
        sortFilter == "confidence" &&
        (imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass))
    ) {
        var images = await pdb.allAsync("SELECT * FROM `Images`");
        var confidenceImages = await pdb.allAsync(
            "SELECT Confidence, IName FROM `Validation`",
        );
        const highestConf = {};
        confidenceImages.forEach((item) => {
            const { Confidence, IName } = item;
            if (!(IName in highestConf) || Confidence > highestConf[IName]) {
                highestConf[IName] = Confidence;
            }
        });

        images.sort((a, b) => {
            const confidenceA = highestConf[a.IName] || 0;
            const confidenceB = highestConf[b.IName] || 0;

            if (confidenceA == confidenceB) {
                return a.IName.localeCompare(b.IName);
            }

            return confidenceB - confidenceA;
        });

        for (var d = 0; d < images.length; d++) {
            var imageData = await pdb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    images[d].IName +
                    "'",
            );
            results1.push(imageData[0]);
        }
        results2 = await pdb.getAsync("SELECT COUNT(*) FROM Images");
    } else if (
        sortFilter == "confidence" &&
        imageClass != null &&
        Classes.includes(imageClass)
    ) {
        var imagesWithClass = await pdb.allAsync(
            "SELECT DISTINCT IName FROM `Labels` WHERE CName = '" +
                imageClass +
                "'",
        );
        var confidenceImages = await pdb.allAsync(
            "SELECT Confidence, IName FROM `Validation` WHERE CName = '" +
                imageClass +
                "'",
        );
        const highestConf = {};
        confidenceImages.forEach((item) => {
            const { Confidence, IName } = item;
            if (!(IName in highestConf) || Confidence > highestConf[IName]) {
                highestConf[IName] = Confidence;
            }
        });
        imagesWithClass.sort((a, b) => {
            const confidenceA = highestConf[a.IName] || 0;
            const confidenceB = highestConf[b.IName] || 0;

            if (confidenceA == confidenceB) {
                return a.IName.localeCompare(b.IName);
            }

            return confidenceB - confidenceA;
        });

        for (var d = 0; d < imagesWithClass.length; d++) {
            var imageData = await pdb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results1.push(imageData[0]);
        }
    } else if (sortFilter == "has_class") {
        if (imageClass != "null") {
            var imagesWithClass;
            imagesWithClass = await pdb.allAsync(
                "SELECT DISTINCT IName FROM `Labels` WHERE CName = '" +
                    imageClass +
                    "'",
            );
        } else {
            imagesWithClass = await pdb.allAsync(
                "SELECT DISTINCT IName FROM `Labels`",
            );
        }
        imagesWithClass.sort((a, b) => {
            if (a.IName < b.IName) {
                return -1;
            } else if (a.IName > b.IName) {
                return 1;
            } else {
                return 0;
            }
        });

        for (var d = 0; d < imagesWithClass.length; d++) {
            var imageData = await pdb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results1.push(imageData[0]);
        }
    } else {
        var imagesWithClass = await pdb.allAsync(
            "SELECT DISTINCT IName FROM `Labels` WHERE CName = '" +
                imageClass +
                "'",
        );
        imagesWithClass.sort((a, b) => {
            if (a.IName < b.IName) {
                return -1;
            } else if (a.IName > b.IName) {
                return 1;
            } else {
                return 0;
            }
        });

        for (var d = 0; d < imagesWithClass.length; d++) {
            var imageData = await pdb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results1.push(imageData[0]);
        }
    }

    var imageLabels = [];
    var list_counter = [];
    var imageConf = [];
    // console.log(results1);
    for (var i = 0; i < results1.length; i++) {
        labelList = await pdb.allAsync(
            "SELECT CName FROM `Labels` WHERE IName = '" +
                results1[i].IName +
                "'",
        );
        var usedLabels = new Set();
        for (var f = 0; f < labelList.length; f++) {
            usedLabels.add(labelList[f].CName);
        }

        var results3 = await pdb.getAsync(
            "SELECT COUNT(*) FROM `Labels` WHERE IName = '" +
                results1[i].IName +
                "'",
        );
        list_counter.push(results3["COUNT(*)"]);

        imageLabels.push(Array.from(usedLabels));

        var imageList = await pdb.allAsync(
            "SELECT Confidence FROM `Validation` WHERE IName = '" +
                results1[i].IName +
                "'",
        );
        if (imageList.length == 0) {
            imageConf.push(0);
        } else {
            var high = 0;
            var idx = 0;
            for (var x = 0; x < imageList.length; x++) {
                if (imageList[x].Confidence > high) {
                    high = imageList[x].Confidence;
                    idx = x;
                }
            }
            if (typeof imageList[idx].Confidence != "number") {
                imageConf.push(0);
            } else {
                imageConf.push(imageList[idx].Confidence);
            }
        }

        // console.log(imageConf + ' ' + results1[i].IName);
    }

    // var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "'");
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
    pdb.close(function (err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    res.render("projectV", {
        title: "projectV",
        user: user,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        access: access,
        images: results1,
        classes: imageLabels,
        list_counter: list_counter,
        current: page,
        pages: Math.ceil(results2["COUNT(*)"] / perPage),
        perPage: perPage,
        logged: req.query.logged,
        sortFilter: sortFilter,
        imageClass: imageClass,
        projectClasses: Classes,
        imageConf: imageConf,
        activePage: "ProjectV",
    });
}

module.exports = getValidationProjectPage;
