async function getYoloXInferencePage(req, res) {
    const readdir = util.promisify(fs.readdir);
    const readFile = util.promisify(fs.readFile);

    // get URL variables
    var IDX = parseInt(req.query.IDX),
        IName = String(req.query.IName),
        curr_class = req.query.curr_class,
        user = req.cookies.Username;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }
    if (user == undefined) {
        return res.redirect("/l");
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
        project_path = main_path + admin + "-" + PName,
        path = project_path + "/" + PName + ".db",
        training_path = project_path + "/training",
        weights_path = training_path + "/weights",
        inference_path = project_path + "/inference",
        inference_upload_path = project_path + "/inference/uploads",
        log_path = training_path + "/logs/",
        python_path = training_path + "/python",
        python_path_file = training_path + "/Paths.txt",
        yolovx_path_file = training_path + "/yolovxPaths.txt";

    if (!fs.existsSync(training_path)) {
        fs.mkdirSync(training_path);
        fs.mkdirSync(log_path);
        fs.mkdirSync(python_path);
        fs.mkdirSync(weights_path);
        fs.writeFile(python_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
        fs.writeFile(yolovx_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
    } else if (!fs.existsSync(weights_path)) {
        fs.mkdirSync(weights_path);
    } else if (!fs.existsSync(yolovx_path_file)) {
        fs.writeFile(yolovx_path_file, "", function (err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }

    // connect to project database
    var tdb = new sqlite3.Database(path, (err) => {
        if (err) {
            return global.logger.error(err.message);
        }
        global.logger.info("Connected to tdb.")
    });

    // create async database object functions
    tdb.getAsync = function (sql) {
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
    tdb.allAsync = function (sql) {
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

    var results1 = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );
    var results2 = await tdb.allAsync("SELECT * FROM `Classes`");

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

    //Get global weights///////////////////////////////////////////
    var global_weights = await readdirAsync(weights_path);
    var global_inference = await readdirAsync(inference_path);
    var global_inference_upload = await readdirAsync(inference_upload_path);
    global_inference_upload.push(project_path + "/images");

    // get runs
    var runs = await readdirAsync(log_path);
    runs = runs.reverse();
    // get logfiles
    var logs = [];

    var log_idx;
    var err_idx;
    var done_idx;
    var run_status = [];
    var log_files = [];
    var log_contents = [];
    var weights = [];
    var weight = [];
    var err_file = [];
    var err = [];
    var prev = 0;
    var weights_names = [];
    var weights_files = [];
    var run_path = "";
    var run_paths = [];
    var idx = 0;

    // Get weights files and log files for each run
    for (var i = 0; i < runs.length; i++) {
        weight = [];
        run_path = `${log_path}${runs[i]}/`;
        run_paths.push(run_path);
        // get all files for each run
        logs = await readdirAsync(`${run_path}`);
        // get index of log file
        log_idx = logs.indexOf(`${runs[i]}.log`);
        // get log file for each run
        log_files.push(`${runs[i]}.log`);

        log_contents.push(fs.readFileSync(`${run_path}${runs[i]}.log`, "utf8"));

        //check for error file
        err_idx = logs.indexOf(`${runs[i]}-error.log`);
        done_idx = logs.indexOf("done.log");

        if (err_idx >= 0) {
            // Add error to arrays
            run_status.push("FAILED");
            err_file.push(`${logs[err_idx]}`);
            err.push(fs.readFileSync(run_path + logs[err_idx], "utf8"));

            // Add weights to array
            for (var j = 0; j < logs.length; j++) {
                if (j == log_idx || j == err_idx) {
                    continue;
                }
                weight.push(`${run_path}${logs[j]}`);
                weights_names.push(logs[j]);
            }
        } else if (done_idx >= 0) {
            run_status.push("DONE");

            err_file.push("NULL");
            err.push("NULL");
            // Add weights to array
            for (var j = 0; j < logs.length; j++) {
                if (j == log_idx || j == done_idx) {
                    continue;
                }
                weight.push(`${run_path}${logs[j]}`);
                weights_names.push(logs[j]);
            }
        } else {
            run_status.push("RUNNING");

            err_file.push("NULL");
            err.push("NULL");
            // Add weights to array
            for (var j = 0; j < logs.length; j++) {
                if (j == log_idx) {
                    continue;
                }
                weight.push(`${run_path}${logs[j]}`);
                weights_names.push(logs[j]);
            }
        }
        weights.push(weight);
        weights_files.push(weights_names);
    }

    // close the database
    tdb.close(function (err) {
        if (err) {
            global.logger.error(err);
        } else {
        }
    });

    // get python scripts
    var scripts = await readdirAsync(python_path);

    // get python paths
    // This places the entire file into memory
    // Will not work with large files, apx 10000000 lines
    var paths = fs
        .readFileSync(yolovx_path_file, "utf-8")
        .split("\n")
        .filter(Boolean);

    // Get default python path
    var default_path = configFile.default_yolo_path;
    if (!default_path) {
        default_path = null;
    }

    res.render("training/yolovXInferenceSettings", {
        title: "yolovXInferenceSettings",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        PDescription: results1.PDescription,
        AutoSave: results1.AutoSave,
        classes: results2,
        logs: log_files,
        err_file: err_file,
        err_contents: err,
        default_path: default_path,
        paths: paths,
        scripts: scripts,
        global_weights: global_weights,
        global_inference: global_inference,
        global_inference_upload: global_inference_upload,
        weights: weights,
        weight_names: weights_files,
        run_status: run_status,
        run_paths: run_paths,
        log_contents: log_contents,
        logged: req.query.logged,
        activePage: "yolovXSettings",
    });
}

module.exports = getYoloXInferencePage;
