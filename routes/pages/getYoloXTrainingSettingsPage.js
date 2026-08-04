async function getYoloXInferencePage(req, res) {
    global.logger.debug("get yolo (ultralytics) X training Setting Page");
    const readdir = util.promisify(fs.readdir);
    const readFile = util.promisify(fs.readFile);

    // Helper function to categorize file types
    function getFileType(filename) {
        var ext = filename.split('.').pop().toLowerCase();
        if (['png', 'jpg', 'jpeg'].includes(ext)) {
            if (filename.includes('curve') || filename.includes('confusion') || filename.includes('results')) {
                return 'graph';
            } else if (filename.includes('batch') || filename.includes('train') || filename.includes('val')) {
                return 'sample_image';
            } else {
                return 'image';
            }
        } else if (['pt', 'weights'].includes(ext)) {
            return 'weights';
        } else if (['yaml', 'yml'].includes(ext)) {
            return 'config';
        } else if (['csv', 'txt'].includes(ext) && !filename.includes('log')) {
            return 'data';
        } else if (filename.includes('log')) {
            return 'log';
        } else {
            return 'other';
        }
    }

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

    global.logger.debug("this is PName :", PName);
    global.logger.debug("this is PName :", admin);

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

    // Get all files for each run - categorized properly
    var all_run_files = [];
    var run_file_categories = [];

    for (var i = 0; i < runs.length; i++) {
        weight = [];
        run_path = `${log_path}${runs[i]}/`;
        run_paths.push(run_path);
        
        // get all files for each run (including subdirectories)
        var runFiles = [];
        
        // Read main directory files
        logs = await readdirAsync(`${run_path}`);
        
        // Add files from main directory
        for (var j = 0; j < logs.length; j++) {
            var filePath = run_path + logs[j];
            try {
                var stat = fs.statSync(filePath);
                if (stat.isFile()) {
                    runFiles.push({
                        name: logs[j],
                        path: filePath,
                        relativePath: logs[j],
                        size: stat.size,
                        type: getFileType(logs[j])
                    });
                }
            } catch (err) {
                global.logger.debug("Error reading file stats:", err);
            }
        }
        
        // Read subdirectories for additional files (like plots, results, etc.)
        // We need to go deeper since YOLO puts training files in train/ subdirectory
        for (var j = 0; j < logs.length; j++) {
            var filePath = run_path + logs[j];
            try {
                var stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    // Read subdirectory contents
                    var subFiles = await readdirAsync(filePath);
                    for (var k = 0; k < subFiles.length; k++) {
                        var subFilePath = filePath + "/" + subFiles[k];
                        try {
                            var subStat = fs.statSync(subFilePath);
                            if (subStat.isFile()) {
                                runFiles.push({
                                    name: subFiles[k],
                                    path: subFilePath,
                                    relativePath: logs[j] + "/" + subFiles[k],
                                    size: subStat.size,
                                    type: getFileType(subFiles[k])
                                });
                            } else if (subStat.isDirectory()) {
                                // Go one level deeper for directories like train/weights, images/train, etc.
                                var subSubFiles = await readdirAsync(subFilePath);
                                for (var l = 0; l < subSubFiles.length; l++) {
                                    var subSubFilePath = subFilePath + "/" + subSubFiles[l];
                                    try {
                                        var subSubStat = fs.statSync(subSubFilePath);
                                        if (subSubStat.isFile()) {
                                            runFiles.push({
                                                name: subSubFiles[l],
                                                path: subSubFilePath,
                                                relativePath: logs[j] + "/" + subFiles[k] + "/" + subSubFiles[l],
                                                size: subSubStat.size,
                                                type: getFileType(subSubFiles[l])
                                            });
                                        }
                                    } catch (subSubErr) {
                                        global.logger.debug("Error reading nested subdirectory file stats:", subSubErr);
                                    }
                                }
                            }
                        } catch (subErr) {
                            global.logger.debug("Error reading subdirectory file stats:", subErr);
                        }
                    }
                }
            } catch (err) {
                global.logger.debug("Error checking directory:", err);
            }
        }
        
        all_run_files.push(runFiles);
        
        // get index of log file
        log_idx = logs.indexOf(`${runs[i]}.log`);
        // get log file for each run
        log_files.push(`${runs[i]}.log`);

        try {
            log_contents.push(fs.readFileSync(`${run_path}${runs[i]}.log`, "utf8"));
        } catch (err) {
            log_contents.push("Log file not found or unreadable");
        }

        //check for error file
        err_idx = logs.indexOf(`${runs[i]}-error.log`);
        done_idx = logs.indexOf("done.log");

        if (err_idx >= 0) {
            // Add error to arrays
            run_status.push("FAILED");
            err_file.push(`${logs[err_idx]}`);
            try {
                err.push(fs.readFileSync(run_path + logs[err_idx], "utf8"));
            } catch (errReadErr) {
                err.push("Error file not readable");
            }

            // Add non-log files to weights array for backward compatibility
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
            // Add non-log files to weights array for backward compatibility
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
            // Add non-log files to weights array for backward compatibility
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

    // Debug logging to check all_run_files data
    global.logger.debug("Debug: all_run_files length:", all_run_files.length);
    for (var i = 0; i < all_run_files.length && i < 2; i++) {
        global.logger.debug(`Debug: all_run_files[${i}] has ${all_run_files[i].length} files`);
        if (all_run_files[i].length > 0) {
            global.logger.debug(`Debug: First file example:`, all_run_files[i][0]);
        }
    }

    res.render("training/yolovXTrainingSettings", {
        title: "yolovXTrainingSettings",
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
        all_run_files: all_run_files, // New: All files categorized by run
        logged: req.query.logged,
        activePage: "yolovXSettings",
    });
}

module.exports = getYoloXInferencePage;
