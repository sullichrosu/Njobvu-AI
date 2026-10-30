const path = require("path");
const fs = require("fs");
const queries = require("../../queries/queries");

const MEGADETECTOR_MODELS = ["MDV5A", "MDV5B", "MDv1000-redwood"];

async function getMegadetectorSettingsPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects;
    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));
    } catch (err) {
        global.logger.error("Error loading megadetector settings page:", err);
        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    if (idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    const projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
    const inferencePath = path.join(projectDir, "inference");
    const inferenceUploadPath = path.join(inferencePath, "uploads");

    const fsObj = global.fs || fs;

    if (!fsObj.existsSync(inferencePath)) {
        try { fsObj.mkdirSync(inferencePath, { recursive: true }); } catch (e) { }
    }

    if (!fsObj.existsSync(inferenceUploadPath)) {
        try { fsObj.mkdirSync(inferenceUploadPath, { recursive: true }); } catch (e) { }
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );

        accessUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
    }

    let globalInferenceUpload = [];
    try {
        globalInferenceUpload = fsObj.readdirSync(inferenceUploadPath);
    } catch (e) {
        globalInferenceUpload = [];
    }

    globalInferenceUpload.push(path.join(projectDir, "images"));

    res.render("training/megadetectorSettings", {
        title: "megadetectorSettings",
        user,
        access: accessUsers,
        PName,
        Admin: admin,
        IDX: idx,
        global_inference_upload: globalInferenceUpload,
        megadetector_models: MEGADETECTOR_MODELS,
        activePage: "megadetectorSettings",
    });
}

module.exports = getMegadetectorSettingsPage;
