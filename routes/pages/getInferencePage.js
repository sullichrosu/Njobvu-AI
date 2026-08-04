const fsPath = require("path");
const fs = require("fs");

async function getProcessingPage(req, res) {
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
        project_path = main_path + admin + "-" + PName,
        path = project_path + "/" + PName + ".db",
        training_path = project_path + "/training",
        weights_path = training_path + "/weights",
        inference_path = project_path + "/inference",
        inference_upload_path = project_path + "/inference/uploads",
        log_path = training_path + "/logs/",
        trn_log_path = training_path + "/logs/",
        inf_log_path = inference_path + "/logs/",
        inf_upload_path = inference_path + "/uploads/",
        python_path = training_path + "/python",
        python_path_file = training_path + "/Paths.txt",
        darknet_path_file = training_path + "/darknetPaths.txt";
    weights_output = training_path + "train/weights/best.pt";

    if (!fs.existsSync(training_path)) {
        fs.mkdirSync(training_path);
        fs.mkdirSync(log_path);
        fs.mkdirSync(trn_log_path);
        fs.mkdirSync(python_path);
        fs.mkdirSync(weights_path);
        fs.writeFile(python_path_file, "", function(err) {
            if (err) {
                global.logger.error(err);
            }
        });
        fs.writeFile(darknet_path_file, "", function(err) {
            if (err) {
                global.logger.error(err);
            }
        });
    }
    if (!fs.existsSync(inference_path)) {
        fs.mkdirSync(inference_path);
    }
    if (!fs.existsSync(inf_log_path)) {
        fs.mkdirSync(inf_log_path);
    }
    if (!fs.existsSync(inf_upload_path)) {
        fs.mkdirSync(inf_upload_path);
    }
    if (!fs.existsSync(weights_path)) {
        fs.mkdirSync(weights_path);
    }
    if (!fs.existsSync(darknet_path_file)) {
        fs.writeFile(darknet_path_file, "", function(err) {
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
    tdb.getAsync = function(sql) {
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
        });
    };
    tdb.allAsync = function(sql) {
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

    // get training runs
    var runs = await readdirAsync(log_path);
    runs = runs.reverse();

    // get training logfiles
    var logs = [];
    var logs_trn = [];
    var log_idx;
    var log_folder = [];
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
    let run_types = [];
    var idx = 0;

    // get inference runs
    var inf_runs = await readdirAsync(inf_log_path);
    inf_runs = inf_runs.reverse();

    // get inference logfiles
    var logs_inf = [];
    var log_idx_inf;
    var err_idx_inf;
    var done_idx_inf;
    var run_status_inf = [];
    var log_files_inf = [];
    var log_folder_inf = [];
    var log_contents_inf = [];
    var weights_inf = [];
    var weight_inf = [];
    var err_file_inf = [];
    var err_inf = [];
    var prev_inf = 0;
    var weights_names_inf = [];
    var weights_files_inf = [];
    var run_path_inf = "";
    var run_paths_inf = [];
    var idx_inf = 0;

    // Get training weights files and log files for each run
    for (var i = 0; i < runs.length; i++) {
        weight = [];
        run_path = `${log_path}${runs[i]}/`;
        run_paths.push(run_path);
        // get all files for each run
        logs = await readdirAsync(`${run_path}`);
        // get index of log file
        log_idx = logs.indexOf(`${runs[i]}.log`);
        log_folder.push(`${runs[i]}`);
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
                if (j == err_idx) {
                    continue;
                }
                if (
                    `${logs[j]}` == "datatovalues.py" ||
                    `${logs[j]}` == "images" ||
                    `${logs[j]}` == "labels" ||
                    `${logs[j]}` == "train" ||
                    `${logs[j]}` == "weights"
                ) {
                    continue;
                }
                // weight.push(`${run_path}${logs[j]}`);
                weight.push(`${logs[j]}`);
                weights_names.push(logs[j]);
            }
        } else if (done_idx >= 0) {
            run_status.push("DONE");

            err_file.push("NULL");
            err.push("NULL");
            global.logger.debug("");
            global.logger.debug("train logs:" + logs);
            global.logger.debug("");
            // Add weights to array
            for (var j = 0; j < logs.length; j++) {
                if (j == done_idx) {
                    continue;
                }
                if (
                    `${logs[j]}` == "datatovalues.py" ||
                    `${logs[j]}` == "images" ||
                    `${logs[j]}` == "labels" ||
                    `${logs[j]}` == "train" ||
                    `${logs[j]}` == "weights"
                ) {
                    continue;
                }
                // weight.push(`${run_path}${logs[j]}`);
                weight.push(`${logs[j]}`);
                weights_names.push(logs[j]);
            }
        } else {
            run_status.push("RUNNING");

            err_file.push("NULL");
            err.push("NULL");
            // Add weights to array
            for (var j = 0; j < logs.length; j++) {
                // if(j == log_idx)
                // {
                // 	continue;
                // }
                if (
                    `${logs[j]}` == "datatovalues.py" ||
                    `${logs[j]}` == "images" ||
                    `${logs[j]}` == "labels" ||
                    `${logs[j]}` == "train" ||
                    `${logs[j]}` == "weights"
                ) {
                    continue;
                }
                // weight.push(`${run_path}${logs[j]}`);
                weight.push(`${logs[j]}`);
                weights_names.push(logs[j]);
            }
        }
        global.logger.debug("");
        global.logger.debug("weight:" + weight);
        global.logger.debug("weight.length:" + weight.length);
        global.logger.debug("weights_names:" + weights_names);
        global.logger.debug("weights_names.length:" + weights_names.length);
        global.logger.debug("");
        weights.push(weight);
        weights_files.push(weights_names);
    }

    // Get inference weights files and log files for each run
    for (var i = 0; i < inf_runs.length; i++) {
        weight_inf = [];
        run_path_inf = `${inf_log_path}${inf_runs[i]}/`;
        run_paths_inf.push(run_path_inf);
        // get all files for each run
        logs_inf = await readdirAsync(`${run_path_inf}`);
        log_folder_inf.push(`${inf_runs[i]}`);
        // get index of log file
        log_idx_inf = logs.indexOf(`${inf_runs[i]}.log`);
        // get log file for each run
        log_files_inf.push(`${inf_runs[i]}.log`);

        log_contents_inf.push(
            fs.readFileSync(`${run_path_inf}${inf_runs[i]}.log`, "utf8"),
        );

        //check for error file
        err_idx_inf = logs_inf.indexOf(`${inf_runs[i]}-error.log`);
        done_idx_inf = logs_inf.indexOf("done.log");
        let runTypePath = logs_inf.indexOf("type.txt");

        const fileExistsRecursive = (dirPath, target) => {
            let entries;

            try {
                entries = fs.readdirSync(dirPath, { withFileTypes: true });
            } catch {
                return false;
            }

            for (const entry of entries) {
                const fullPath = fsPath.join(dirPath, entry.name);

                if (entry.name === target) {
                    return true;
                }

                if (entry.isDirectory()) {
                    if (fileExistsRecursive(fullPath, target)) {
                        return true;
                    }
                }
            }

            return false;
        };

        if (runTypePath >= 0) {
            const type = fs.readFileSync(
                fsPath.join(run_path_inf, logs_inf[runTypePath]),
                "utf8"
            );

            if (type.trim() === "inception") {
                run_types.push("Inception");
            } else if (type.trim() === "yolo") {
                run_types.push("YOLO");
            } else {
                run_types.push("Unknown");
            }
        } else {
            const inceptionExists = fileExistsRecursive(run_path_inf, "inception.py");
            const yoloExists = fileExistsRecursive(run_path_inf, "datatovalues.py");

            if (inceptionExists) {
                run_types.push("Inception");
            } else if (yoloExists) {
                run_types.push("YOLO");
            } else {
                run_types.push("Unknown");
            }
        }

        if (err_idx_inf >= 0 && done_idx_inf == -1) {
            // Add error to arrays
            run_status_inf.push("FAILED");
            err_file_inf.push(`${logs_inf[err_idx_inf]}`);
            err_inf.push(
                fs.readFileSync(run_path_inf + logs_inf[err_idx_inf], "utf8"),
            );

            // Add weights to array
            for (var j = 0; j < logs_inf.length; j++) {
                if (j == err_idx_inf) {
                    continue;
                }
                if (
                    `${logs_inf[j]}` == "datatovalues.py" ||
                    `${logs_inf[j]}` == "output"
                ) {
                    continue;
                }
                // weight_inf.push(`${run_path_inf}${logs_inf[j]}`);
                weight_inf.push(`${logs_inf[j]}`);
                weights_names_inf.push(logs_inf[j]);
            }
        } else if (done_idx_inf >= 0) {
            run_status_inf.push("DONE");

            err_file_inf.push("NULL");
            err_inf.push("NULL");
            // Add weights to array
            for (var j = 0; j < logs_inf.length; j++) {
                if (j == done_idx_inf) {
                    continue;
                }
                if (
                    `${logs_inf[j]}` == "datatovalues.py" ||
                    `${logs_inf[j]}` == "output"
                ) {
                    continue;
                }
                // weight_inf.push(`${run_path_inf}${logs_inf[j]}`);
                weight_inf.push(`${logs_inf[j]}`);
                weights_names_inf.push(logs_inf[j]);
            }
        } else {
            run_status_inf.push("RUNNING");

            err_file_inf.push("NULL");
            err_inf.push("NULL");
            // Add weights to array
            for (var j = 0; j < logs_inf.length; j++) {
                // if(j == log_idx_inf)
                // {
                // 	continue;
                // }
                if (
                    `${logs_inf[j]}` == "datatovalues.py" ||
                    `${logs_inf[j]}` == "output"
                ) {
                    continue;
                }
                // weight_inf.push(`${run_path_inf}${logs_inf[j]}`);
                weight_inf.push(`${logs_inf[j]}`);
                weights_names_inf.push(logs_inf[j]);
            }
        }
        // if(`${logs_inf[j]}` == "datatovalues.py" || `${logs_inf[j]}`  == "output") {
        // 		continue;
        // }
        global.logger.debug("");
        global.logger.debug("weight_inf:" + weight_inf);
        global.logger.debug("weight_inf.length:" + weight_inf.length);
        global.logger.debug("weights_names_inf:" + weights_names_inf);
        global.logger.debug("weights_names_inf.length:" + weights_names_inf.length);
        global.logger.debug("");
        weights_inf.push(weight_inf);
        weights_files_inf.push(weights_names_inf);
    }

    // close the database
    tdb.close(function(err) {
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
        .readFileSync(darknet_path_file, "utf-8")
        .split("\n")
        .filter(Boolean);

    // Get default python path
    var default_path = configFile.default_yolo_path;
    if (!default_path) {
        default_path = null;
    }

    res.render("inference", {
        title: "inference",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        PDescription: results1.PDescription,
        AutoSave: results1.AutoSave,
        log_folder: log_folder,
        log_folder_inf: log_folder_inf,
        classes: results2,
        logs: log_files,
        logs_inf: log_files_inf,
        err_file: err_file,
        err_file_inf: err_file_inf,
        err_contents: err,
        err_contents_inf: err_inf,
        default_path: default_path,
        paths: paths,
        scripts: scripts,
        global_weights: global_weights,
        global_inference: global_inference,
        global_inference_upload: global_inference_upload,
        weights: weights,
        weights_inf: weights_inf,
        weights_names: weights_files,
        weights_names_inf: weights_files_inf,
        weights_files_inf: weights_files_inf,
        weights_output: weights_output,
        run_status: run_status,
        run_status_inf: run_status_inf,
        run_paths: run_paths,
        run_paths_inf: run_paths_inf,
        run_types,
        log_contents: log_contents,
        log_contents_inf: log_contents_inf,
        logged: req.query.logged,
        activePage: "Processing",
    });
}

module.exports = getProcessingPage;
