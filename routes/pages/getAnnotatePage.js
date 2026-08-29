const queries = require("../../queries/queries");
const { buildS3Client, getObjectStream } = require("../../utils/s3Client");

async function getAnnotatePage(req, res) {
    var path = global.path || require("path");
    var fs = global.fs || require("fs");
    var sqlite3 = global.sqlite3 || require("sqlite3").verbose();
    var probe = global.probe || require("probe-image-size");
    var IDX = parseInt(req.query.IDX),
        IName = String(req.query.IName),
        curr_class = req.query.curr_class,
        reviewFilter = req.query.reviewFilter || req.query.review || "all",
        user = req.cookies.Username;

    if (isNaN(IDX) || IDX === undefined) {
        IDX = 0;
        return res.redirect("/home");
    }
    if (user === undefined) {
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

    // set paths
    var public_path = typeof currentPath !== "undefined" ? currentPath : process.cwd(),
        main_path = path.join(public_path, "public", "projects"),
        project_path = path.join(main_path, admin + "-" + PName);

    var rel_project_path = "projects/" + admin + "-" + PName;

    var ldb = new sqlite3.Database(
        path.join(project_path, PName + ".db"),
        (err) => {
            if (err && global.logger) {
                return global.logger.error(err.message);
            }
            if (global.logger) global.logger.info("Connected to ldb.");
        },
    );

    ldb.getAsync = function (sql, params) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.get(sql, params || [], function (err, row) {
                if (err) {
                    if (global.logger) global.logger.error("runAsync ERROR!", err);
                    reject(err);
                } else resolve(row);
            });
        }).catch((err) => {
            if (global.logger) global.logger.error(err);
            return null;
        });
    };
    ldb.allAsync = function (sql, params) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, params || [], function (err, row) {
                if (err) {
                    if (global.logger) global.logger.error("runAsync ERROR!", err);
                    reject(err);
                } else resolve(row);
            });
        }).catch((err) => {
            if (global.logger) global.logger.error(err);
            return [];
        });
    };

    var results1 = await ldb.allAsync("SELECT * FROM `Classes`");
    var Classes = [];
    if (results1) {
        for (var i = 0; i < results1.length; i++) {
            Classes.push(results1[i].CName);
        }
    }

    var results2 = [];
    if (reviewFilter === "true" || reviewFilter === "1" || reviewFilter === 1 || reviewFilter === "needs_review" || reviewFilter === "needsReview") {
        results2 = await ldb.allAsync("SELECT * FROM `Images` WHERE reviewImage != 0");
    } else if (reviewFilter === "false" || reviewFilter === "0" || reviewFilter === 0) {
        results2 = await ldb.allAsync("SELECT * FROM `Images` WHERE reviewImage = 0");
    } else {
        results2 = await ldb.allAsync("SELECT * FROM `Images`");
    }

    var results3 = await ldb.allAsync(
        "SELECT * FROM `Labels` WHERE IName = ?",
        [IName]
    );
    var results4 = await ldb.allAsync(
        "SELECT * FROM `Images` WHERE IName = ?",
        [IName]
    );

    var results5 = null;
    if (global.managedDbClient && global.managedDbClient.get) {
        const dbRes = await global.managedDbClient.get("SELECT AutoSave FROM Projects WHERE PName = ? AND Admin = ?", [PName, admin]);
        results5 = (dbRes && dbRes.row) ? dbRes.row : null;
    } else if (global.db && global.db.getAsync) {
        results5 = await global.db.getAsync("SELECT AutoSave FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
    }

    var acc = [];
    if (global.managedDbClient && global.managedDbClient.all) {
        const dbRes = await global.managedDbClient.all("SELECT * FROM Access WHERE PName = ? AND Admin = ?", [PName, admin]);
        acc = (dbRes && dbRes.rows) ? dbRes.rows : (Array.isArray(dbRes) ? dbRes : []);
    } else if (global.db && global.db.allAsync) {
        acc = await global.db.allAsync("SELECT * FROM Access WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
    }
    var access = [];

    if (curr_class == null && results1 && results1.length > 0) {
        curr_class = results1[0].CName;
    }

    if (acc) {
        for (var i = 0; i < acc.length; i++) {
            access.push(acc[i].Username);
        }
    }

    var abs_image_path = project_path + "/images/" + IName;
    var imageExistsLocally = fs.existsSync(abs_image_path);
    var imageRow = results4 && results4[0];

    // A "download"-mode (or local-import) image is a real file at
    // abs_image_path, same as always. A "stream"-mode S3 image never has
    // one - it's only ever fetched live, on view, via the on-demand proxy
    // below - so only 404 here if neither a local file nor an S3-backed row
    // exists for this name.
    if (!imageRow || (!imageExistsLocally && imageRow.Source !== "s3")) {
        ldb.close();
        res.render("404", {
            title: "404",
            user: req.cookies.Username,
        });
    } else {
        var rel_image_path;
        var img_w, img_h;

        if (imageExistsLocally) {
            rel_image_path = rel_project_path + "/images/" + imageRow.IName;
            var img = fs.readFileSync(project_path + "/images/" + imageRow.IName);
            var img_data = probe.sync(img);
            img_w = img_data.width;
            img_h = img_data.height;
        } else {
            // Point the browser at the on-demand proxy instead of a static
            // path that doesn't exist. Probe just enough of the object's
            // header (over that same live fetch, aborted by probe() once it
            // has what it needs) to lay out the page, rather than pulling
            // the whole image server-side just to measure it.
            rel_image_path = `api/v2/projects/${admin}/${PName}/images/${imageRow.IName}`;

            try {
                var bucketResult = await queries.managed.getBucket(PName, admin);
                var bucket = bucketResult && bucketResult.row;
                var s3Client = buildS3Client({
                    region: bucket.Region,
                    accessKeyId: bucket.AccessKeyId,
                    secretAccessKey: bucket.SecretAccessKey,
                    endpoint: bucket.Endpoint,
                });
                var objectStream = await getObjectStream(s3Client, bucket.BucketName, imageRow.SourceKey);
                var probed = await probe(objectStream.body);
                img_w = probed.width;
                img_h = probed.height;
            } catch (err) {
                global.logger.error(err);
                img_w = 0;
                img_h = 0;
            }
        }

        var image_ratio = img_w ? img_h / img_w : 1,
            image_width = img_w || 0,
            image_height = image_ratio * image_width,
            prev_IName = -1,
            next_IName = -1;
        var curr_index = 1;

        var list_counter = [];

        var imgIdx = (results2 || []).findIndex((item) => item.IName === IName);
        if (imgIdx !== -1) {
            curr_index = imgIdx + 1;
            prev_IName = imgIdx > 0 ? results2[imgIdx - 1].IName : -1;
            next_IName = imgIdx < results2.length - 1 ? results2[imgIdx + 1].IName : -1;
        } else {
            curr_index = 1;
            prev_IName = -1;
            next_IName = (results2 && results2.length > 0) ? results2[0].IName : -1;
        }

        ldb.close(function (err) {
            if (err && global.logger) {
                global.logger.error(err);
            }
        });

        var colors = [];
        var i = 0;
        while (colors.length < Classes.length) {
            if (typeof colorsJSON !== 'undefined' && i >= colorsJSON.length) {
                i = 0;
            }
            colors.push(typeof colorsJSON !== 'undefined' ? colorsJSON[i] : "#FF0000");
            i++;
        }

        res.render("annotate", {
            title: "annotate",
            user: user,
            access: access,
            image_width: image_width,
            image_height: image_height,
            image_path: rel_image_path,
            image_name: results4[0].IName,
            image_ratio: image_ratio,
            classes: Classes,
            images: results2 || [],
            labels: results3 || [],
            colors: colors,
            IName: IName,
            prev_IName: prev_IName,
            next_IName: next_IName,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            images_length: results2 ? results2.length : 0,
            curr_index: curr_index,
            curr_class: curr_class,
            rev_image: results4[0].reviewImage,
            list_counter: list_counter,
            AutoSave: results5 ? (results5.AutoSave !== undefined ? results5.AutoSave : 0) : 0,
            logged: req.query.logged,
            reviewFilter: reviewFilter,
            activePage: "project",
        });
    }
}

module.exports = getAnnotatePage;
