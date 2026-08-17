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

    let projects = [];
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql("SELECT * FROM Access WHERE Username = ?", [user]);
            projects = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }

    if (!projects || idx < 0 || idx >= projects.length) {
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
        try { fsObj.mkdirSync(inferencePath, { recursive: true }); } catch (e) {}
    }
    if (!fsObj.existsSync(inferenceUploadPath)) {
        try { fsObj.mkdirSync(inferenceUploadPath, { recursive: true }); } catch (e) {}
    }

    let accessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
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
