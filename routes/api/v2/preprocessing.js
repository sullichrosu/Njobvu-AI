const fs = require("fs");
const path = require("path");
const queries = require("../../../queries/queries");
const { applyPipelineToProject } = require("../../../controllers/preprocessing/applyPipeline");

const BUILTIN_TYPES = new Set([
    "illumination_normalization",
    "resize",
    "rotate",
    "crop",
    "pad",
    "noise",
]);

function getProjectPath(admin, projectName) {
    return path.join(currentPath, "public", "projects", `${admin}-${projectName}`);
}

function isOwner(req, admin) {
    return req.cookies && req.cookies.Username === admin;
}

function mapStepRow(row) {
    let params = {};
    try {
        params = row.Params ? JSON.parse(row.Params) : {};
    } catch (err) {
        params = {};
    }

    return {
        id: row.Id,
        type: row.Type,
        scriptId: row.ScriptId || undefined,
        enabled: !!row.Enabled,
        order: row.StepOrder,
        params,
    };
}

function mapScriptRow(row) {
    return { id: row.Id, name: row.Name, filename: row.Filename };
}

function validatePipelineSteps(pipeline) {
    for (const step of pipeline) {
        const isCustom = step.type === "custom";

        if (!isCustom && !BUILTIN_TYPES.has(step.type)) {
            return `Unknown step type: ${step.type}`;
        }

        if (isCustom && !step.scriptId) {
            return "Custom steps require a scriptId";
        }
    }

    return null;
}

async function getPreprocessingPipeline(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    try {
        const stepsResult = await queries.managed.listSteps(projectName, admin);
        const scriptsResult = await queries.managed.listScripts(projectName, admin);

        return res.status(200).json({
            success: true,
            pipeline: (stepsResult.rows || []).map(mapStepRow),
            customScripts: (scriptsResult.rows || []).map(mapScriptRow),
        });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error fetching pipeline" });
    }
}

async function savePreprocessingPipeline(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const pipeline = Array.isArray(req.body && req.body.pipeline) ? req.body.pipeline : null;
    if (!pipeline) {
        return res.status(400).json({ success: false, error: "pipeline must be an array" });
    }

    const validationError = validatePipelineSteps(pipeline);
    if (validationError) {
        return res.status(400).json({ success: false, error: validationError });
    }

    try {
        await queries.managed.replaceSteps(projectName, admin, pipeline);
        return res.status(200).json({ success: true });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error saving pipeline" });
    }
}

async function uploadPreprocessingScript(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const file = req.files && req.files.script;
    if (!file) {
        return res.status(400).json({ success: false, error: "No script file uploaded" });
    }

    if (!file.name.toLowerCase().endsWith(".py")) {
        return res.status(400).json({ success: false, error: "Only .py files are supported" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const scriptsDir = path.join(projectPath, "preprocessing", "scripts");

    try {
        if (!fs.existsSync(scriptsDir)) {
            fs.mkdirSync(scriptsDir, { recursive: true });
        }

        const filename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await file.mv(path.join(scriptsDir, filename));

        const result = await queries.managed.addScript(projectName, admin, file.name, filename);

        return res.status(200).json({
            success: true,
            script: { id: result.lastID, name: file.name, filename },
        });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error uploading script" });
    }
}

async function applyPreprocessingPipeline(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    try {
        const stepsResult = await queries.managed.listSteps(projectName, admin);
        const scriptsResult = await queries.managed.listScripts(projectName, admin);
        const pipeline = (stepsResult.rows || []).map(mapStepRow).filter((step) => step.enabled);

        if (!pipeline.length) {
            return res.status(400).json({ success: false, error: "Pipeline has no enabled steps" });
        }

        const { processed } = await applyPipelineToProject({
            projectPath,
            pipeline,
            customScripts: (scriptsResult.rows || []).map(mapScriptRow),
        });

        return res.status(200).json({ success: true, processed });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error applying pipeline" });
    }
}

module.exports = {
    getPreprocessingPipeline,
    savePreprocessingPipeline,
    uploadPreprocessingScript,
    applyPreprocessingPipeline,
};
