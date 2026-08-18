// MegaDetector ships these built-in model weights; the megadetector
// package resolves/downloads them by name, so no local weight management
// or admin configuration is needed.
const MEGADETECTOR_MODELS = ["MDV5A", "MDV5B", "MDv1000-redwood"];

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
        inference_path = project_path + "/inference",
        inference_upload_path = project_path + "/inference/uploads";

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

    var global_inference_upload = await readdirAsync(inference_upload_path);
    global_inference_upload.push(project_path + "/images");

    const attachedBucket = await queries.managed.getBucket(PName, admin);
    if (attachedBucket && attachedBucket.row) {
        global_inference_upload.push("s3");
    }

    res.render("training/megadetectorSettings", {
        title: "megadetectorSettings",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        global_inference_upload: global_inference_upload,
        megadetector_models: MEGADETECTOR_MODELS,
        activePage: "megadetectorSettings",
    });
}

module.exports = getMegadetectorSettingsPage;
