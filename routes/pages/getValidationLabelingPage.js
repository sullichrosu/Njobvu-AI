async function getValidationLabelingPage(req, res) {
    var IDX = parseInt(req.query.IDX),
        IName = String(req.query.IName),
        curr_class = req.query.curr_class,
        sortFilter = req.query.sort,
        imageClass = req.query.class,
        classFilter = req.query.classFilter,
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

    // set paths
    var public_path = currentPath,
        main_path = public_path + "public/projects/",
        project_path = main_path + admin + "-" + PName;

    var rel_project_path = "projects/" + admin + "-" + PName;

    //Connect Database
    var ldb = new sqlite3.Database(
        project_path + "/" + PName + ".db",
        (err) => {
            if (err) {
                return global.logger.error(err.message);
            }
            global.logger.info("Connected to ldb.")
        },
    );

    // create async database object functions
    ldb.getAsync = function (sql) {
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
    ldb.allAsync = function (sql) {
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
    ldb.eachAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.each(sql, function (err, row) {
                if (err) {
                    global.logger.error("runAsync ERROR!", err)
                    reject(err);
                } else resolve(row);
            });
        }).catch((err) => {
            global.logger.error(err);
        });
    };

    var results1 = await ldb.allAsync("SELECT * FROM `Classes`");
    var Classes = [];
    for (var i = 0; i < results1.length; i++) {
        Classes.push(results1[i].CName);
    }

    var results2 = Array();
    if (
        ((imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass)) &&
            (sortFilter == "null" || sortFilter == null)) ||
        (sortFilter == "Confidence" && imageClass == "null")
    ) {
        results2 = await ldb.allAsync("SELECT * FROM `Images`");
    } else if (
        sortFilter == "needs_review" &&
        (imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass))
    ) {
        results2 = await ldb.allAsync(
            "SELECT * FROM `Images` WHERE reviewImage=1",
        );
    } else if (
        sortFilter == "confidence" &&
        (imageClass == null ||
            imageClass == "null" ||
            !Classes.includes(imageClass))
    ) {
        var images = await ldb.allAsync("SELECT * FROM `Images`");
        var confidenceImages = await ldb.allAsync(
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
            var imageData = await ldb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    images[d].IName +
                    "'",
            );
            results2.push(imageData[0]);
        }
    } else if (
        sortFilter == "confidence" &&
        imageClass != null &&
        Classes.includes(imageClass)
    ) {
        var imagesWithClass = await ldb.allAsync(
            "SELECT DISTINCT IName FROM `Labels` WHERE CName = '" +
                imageClass +
                "'",
        );
        var confidenceImages = await ldb.allAsync(
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
            var imageData = await ldb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results2.push(imageData[0]);
        }
    } else if (sortFilter == "has_class") {
        if (imageClass != "null") {
            var imagesWithClass;
            imagesWithClass = await ldb.allAsync(
                "SELECT DISTINCT IName FROM `Labels` WHERE CName = '" +
                    imageClass +
                    "'",
            );
        } else {
            imagesWithClass = await ldb.allAsync(
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
            var imageData = await ldb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results2.push(imageData[0]);
        }
    } else {
        var imagesWithClass = await ldb.allAsync(
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
            var imageData = await ldb.allAsync(
                "SELECT * FROM `Images` WHERE IName = '" +
                    imagesWithClass[d].IName +
                    "'",
            );
            results2.push(imageData[0]);
        }
    }

    /*
    var rowid;
    for (var b = 0; b < results2.length; b++) {
        if (IName == results2[b].IName) {
            rowid = { rowid: b + 1 };
            break;
        }
    }*/

    var rowid = await ldb.getAsync(
        `SELECT IName, display_id FROM (SELECT IName, ROW_NUMBER() OVER (ORDER BY rowid) AS display_id FROM Images) AS numbered WHERE IName = '${String(IName)}'`,
    );

    await ldb.allAsync(
        "UPDATE Images SET reviewImage = 0 WHERE IName = '" + IName + "'",
    );

    var results3 = await ldb.allAsync(
        "SELECT * FROM `Labels` WHERE IName = '" + String(IName) + "'",
    );
    var results4 = await ldb.allAsync(
        "SELECT * FROM `Images` WHERE IName = '" + String(IName) + "'",
    );
    var results5 = await db.getAsync(
        "SELECT AutoSave FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var results6 = await ldb.allAsync(
        "SELECT * FROM `Validation` WHERE IName = '" + String(IName) + "'",
    );
    var acc = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var access = [];

    if (curr_class == null) {
        curr_class = (results1 && results1.length > 0) ? results1[0].CName : '';
    }

    for (var i = 0; i < acc.length; i++) {
        access.push(acc[i].Username);
    }

    var abs_image_path = project_path + "/images/" + IName;

    if (!fs.existsSync(abs_image_path)) {
        res.render("404", {
            title: "404",
            user: req.cookies.Username,
        });
    } else {
        // var rel_image_path = abs_image_path;
        var rel_image_path = rel_project_path + "/images/" + results4[0].IName;
        // get image information //there might be a race condition between rel_project_path and project_path which makes them different when bootstrapping is run
        var img = fs.readFileSync(
                project_path + "/images/" + results4[0].IName,
                (err) => {
                    if (err) {
                        res.render("404", {
                            title: "404",
                            user: req.cookies.Username,
                        });
                    }
                },
            ),
            img_data = probe.sync(img),
            img_w = img_data.width,
            img_h = img_data.height,
            image_ratio = img_h / img_w,
            image_width = img_w,
            image_height = image_ratio * image_width,
            prev_IName = (next_IName = -1);
        var curr_index = 1;

        var list_counter = [];

        curr_index = Number(rowid.display_id);

        if (curr_index != 1) {
            prev_IName = results2[curr_index - 2]["IName"];
        }
        if (curr_index != results2.length) {
            next_IName = results2[curr_index]["IName"];
        }
        // close the database
        ldb.close(function (err) {
            if (err) {
                global.logger.error(err);
            } else {
            }
        });

        var colors = [];
        var i = 0;

        while (colors.length < Classes.length) {
            if (i >= colorsJSON.length) {
                i = 0;
            }
            colors.push(colorsJSON[i]);
            i++;
        }

        var stats = {};
        for (var a = 0; a < results3.length; a++) {
            className = results3[a].CName;
            labelID = results3[a].LID;
            if (stats[className] == null) {
                stats[className] = 1;
            } else {
                stats[className] += 1;
            }
        }
        var statsO = [];
        for (const [key, value] of Object.entries(stats)) {
            statsO.push([key, value]);
        }

        res.render("labelingV", {
            title: "labeling",
            user: user,
            access: access,
            image_width: image_width,
            image_height: image_height,
            image_path: rel_image_path,
            image_name: results4[0].IName,
            image_ratio: image_ratio,
            classes: Classes,
            images: results2,
            labels: results3,
            labelConf: results6,
            colors: colors,
            IName: IName,
            prev_IName: prev_IName,
            next_IName: next_IName,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            images_length: results2.length,
            curr_index: curr_index,
            curr_class: curr_class,
            rev_image: results4[0].reviewImage,
            list_counter: list_counter,
            AutoSave: results5["AutoSave"],
            logged: req.query.logged,
            stats: statsO,
            sortFilter: sortFilter,
            imageClass: imageClass,
            classFilter: classFilter,
        });
    }
}

module.exports = getValidationLabelingPage;
