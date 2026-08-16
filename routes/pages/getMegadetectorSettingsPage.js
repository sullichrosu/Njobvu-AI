async function getMegadetectorSettingsPage(req, res) {
    // get URL variables
    var IDX = parseInt(req.query.IDX),
        user = req.cookies.Username;

    if (IDX == undefined) {
        IDX = 0;
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
        python_path_file = training_path + "/Paths.txt",
        yolovx_path_file = training_path + "/yolovxPaths.txt";

    if (!fs.existsSync(training_path)) {
        fs.mkdirSync(training_path);
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

    if (!fs.existsSync(inference_path)) {
        fs.mkdirSync(inference_path);
    }
    if (!fs.existsSync(inference_upload_path)) {
        fs.mkdirSync(inference_upload_path);
    }

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

    var global_weights = await readdirAsync(weights_path);
    var global_inference_upload = await readdirAsync(inference_upload_path);
    global_inference_upload.push(project_path + "/images");

    // get the ultralytics/yolo CLI paths already configured for this project
    var paths = fs
        .readFileSync(yolovx_path_file, "utf-8")
        .split("\n")
        .filter(Boolean);

    var default_path = configFile.default_yolo_path;
    if (!default_path) {
        default_path = null;
    }

    // prebuilt MegaDetector models are admin-provisioned via config.json
    // (megadetector_models: { "<label>": "<local weights path>" })
    var megadetector_models = (configFile && configFile.megadetector_models) || {};

    res.render("training/megadetectorSettings", {
        title: "megadetectorSettings",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        default_path: default_path,
        paths: paths,
        global_weights: global_weights,
        global_inference_upload: global_inference_upload,
        megadetector_models: megadetector_models,
        activePage: "megadetectorSettings",
    });
}

module.exports = getMegadetectorSettingsPage;
