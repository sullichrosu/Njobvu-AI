const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const queries = require("../../../queries/queries");
const config = require("../../../utils/config");
const { sanitizeCode } = require("../../../utils/sandboxedPythonRunner");

const BUILTIN_STEP_TYPES = new Set([
    "illumination_normalization",
    "resize",
    "rotate",
    "crop",
    "pad",
    "noise",
]);
const MAX_SCRIPT_SIZE_BYTES = 1024 * 1024; // 1MB is generous for a single pre-processing step script.
const MAX_PARAMS_JSON_LENGTH = 10000;
const MAX_PYTHON_PATH_LENGTH = 1024;
const JOB_ID_PATTERN = /^\d+$/;

function jobStatusPath(projectPath, jobId) {
    return path.join(projectPath, "preprocessing", "jobs", `${jobId}-status.json`);
}

function readJobStatus(statusPath) {
    try {
        return JSON.parse(fs.readFileSync(statusPath, "utf8"));
    } catch (err) {
        return null;
    }
}

function writeJobStatus(statusPath, status) {
    // Same temp-file + rename dance as run_pipeline.py so a poll never reads half a file.
    const tmpPath = `${statusPath}.node.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(status));
    fs.renameSync(tmpPath, statusPath);
}

/**
 * Validates a user-supplied interpreter path. Returns { value } (null clears the
 * setting and falls back to the server default) or { error }.
 *
 * Run later through execFile (no shell), so metacharacters are not an injection
 * risk; the checks below make sure it is a real, runnable file the server
 * can reach, and keep control characters out of stored paths and logs.
 */
function validatePythonPath(raw) {
    if (raw === undefined || raw === null) {
        return { value: null };
    }
    if (typeof raw !== "string") {
        return { error: "pythonPath must be a string" };
    }

    const value = raw.trim();
    if (value === "") {
        return { value: null };
    }
    if (value.length > MAX_PYTHON_PATH_LENGTH) {
        return { error: `pythonPath is too long (max ${MAX_PYTHON_PATH_LENGTH} characters)` };
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
        return { error: "pythonPath contains invalid characters" };
    }
    if (!path.isAbsolute(value)) {
        return { error: "pythonPath must be an absolute path" };
    }

    let stat;
    try {
        stat = fs.statSync(value);
    } catch (err) {
        return { error: "pythonPath does not exist on the server" };
    }
    if (!stat.isFile()) {
        return { error: "pythonPath must point to an executable file" };
    }
    try {
        fs.accessSync(value, fs.constants.X_OK);
    } catch (err) {
        return { error: "pythonPath is not executable" };
    }

    return { value };
}

const EXAMPLE_SCRIPT_PATH = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "controllers",
    "preprocessing",
    "example_custom_script.py",
);
const EXAMPLE_SCRIPT_FILENAME = "example_custom_script.py";

function getProjectPath(admin, projectName) {
    return path.join(currentPath, "public", "projects", `${admin}-${projectName}`);
}

function isOwner(req, admin) {
    return req.cookies && req.cookies.Username === admin;
}

function sanitizeFileName(name) {
    return path
        .basename(name)
        .trim()
        .split(" ")
        .join("_")
        .replace(/[^a-zA-Z0-9._-]/g, "");
}

function validatePipelineBody(pipeline, existingScriptIds) {
    if (!Array.isArray(pipeline)) {
        return "pipeline must be an array";
    }

    for (const step of pipeline) {
        if (!step || typeof step !== "object") {
            return "Each pipeline step must be an object";
        }
        if (step.type !== "custom" && !BUILTIN_STEP_TYPES.has(step.type)) {
            return `Unknown step type: ${step.type}`;
        }
        if (step.type === "custom") {
            if (!step.scriptId || !existingScriptIds.has(step.scriptId)) {
                return `Custom step references an unknown scriptId: ${step.scriptId}`;
            }
        }
        if (step.params && typeof step.params !== "object") {
            return "Step params must be an object";
        }
        if (step.params && JSON.stringify(step.params).length > MAX_PARAMS_JSON_LENGTH) {
            return "Step params payload is too large";
        }
    }

    return null;
}

async function getPreprocessingPipeline(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    try {
        const steps = await queries.project.getPipeline(projectPath);
        const scripts = await queries.project.getCustomScripts(projectPath);

        return res.status(200).json({
            success: true,
            pipeline: (steps.rows || steps || []).map((row) => ({
                id: row.StepId,
                type: row.StepType,
                scriptId: row.ScriptId || undefined,
                enabled: !!row.Enabled,
                order: row.StepOrder,
                params: JSON.parse(row.Params || "{}"),
            })),
            customScripts: (scripts.rows || scripts || []).map((row) => ({
                id: row.ScriptId,
                name: row.Name,
                filename: row.FileName,
                uploadedAt: row.UploadedAt,
                pythonPath: row.PythonPath || null,
            })),
        });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error fetching pre-processing pipeline" });
    }
}

async function savePreprocessingPipeline(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const pipeline = (req.body && req.body.pipeline) || [];

    try {
        const scriptsResult = await queries.project.getCustomScripts(projectPath);
        const existingScriptIds = new Set(
            (scriptsResult.rows || scriptsResult || []).map((row) => row.ScriptId),
        );

        const validationError = validatePipelineBody(pipeline, existingScriptIds);
        if (validationError) {
            return res.status(400).json({ success: false, error: validationError });
        }

        const normalizedSteps = pipeline.map((step, index) => ({
            id: step.id || crypto.randomUUID(),
            type: step.type,
            scriptId: step.type === "custom" ? step.scriptId : null,
            enabled: !!step.enabled,
            order: index,
            params: step.params || {},
        }));

        await queries.project.replacePipeline(projectPath, normalizedSteps);

        return res.status(200).json({ success: true });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error saving pre-processing pipeline" });
    }
}

async function uploadCustomScript(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const file = req.files && req.files.script;
    if (!file) {
        return res.status(400).json({ success: false, error: "No script file uploaded (expected field 'script')" });
    }
    if (path.extname(file.name).toLowerCase() !== ".py") {
        return res.status(400).json({ success: false, error: "Custom pipeline scripts must be a .py file" });
    }
    if (file.size > MAX_SCRIPT_SIZE_BYTES) {
        return res.status(400).json({ success: false, error: "Script file is too large (max 1MB)" });
    }

    // Custom steps run in-process inside the generated pipeline (run_pipeline.py
    // importlib-imports and calls them directly) - reject anything that trips the
    // existing sandboxed-runner's static checks before it's ever written to disk,
    // rather than after it can already execute.
    try {
        sanitizeCode(file.data.toString("utf8"));
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }

    const scriptId = crypto.randomUUID();
    const fileName = `${scriptId}-${sanitizeFileName(file.name)}`;
    const scriptsDir = path.join(projectPath, "preprocessing", "scripts");

    try {
        if (!fs.existsSync(scriptsDir)) {
            fs.mkdirSync(scriptsDir, { recursive: true });
        }

        await file.mv(path.join(scriptsDir, fileName));

        const script = {
            id: scriptId,
            name: file.name,
            fileName: fileName,
            uploadedAt: new Date().toISOString(),
            pythonPath: null,
        };
        await queries.project.addCustomScript(projectPath, script);

        return res.status(200).json({ success: true, script });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error uploading custom pipeline script" });
    }
}

async function setCustomScriptPythonPath(req, res) {
    const { admin, projectName, scriptId } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const validation = validatePythonPath(req.body && req.body.pythonPath);
    if (validation.error) {
        return res.status(400).json({ success: false, error: validation.error });
    }

    try {
        const script = await queries.project.getCustomScriptById(projectPath, scriptId);
        const row = script && script.row;
        if (!row) {
            return res.status(404).json({ success: false, error: "Custom script not found" });
        }

        await queries.project.setCustomScriptPythonPath(projectPath, scriptId, validation.value);

        return res.status(200).json({ success: true, pythonPath: validation.value });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error saving custom script Python path" });
    }
}

async function deleteCustomScript(req, res) {
    const { admin, projectName, scriptId } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    try {
        const script = await queries.project.getCustomScriptById(projectPath, scriptId);
        const row = script && script.row;
        if (!row) {
            return res.status(404).json({ success: false, error: "Custom script not found" });
        }

        await queries.project.deleteCustomScript(projectPath, scriptId);

        const scriptPath = path.join(projectPath, "preprocessing", "scripts", row.FileName);
        if (fs.existsSync(scriptPath)) {
            fs.unlinkSync(scriptPath);
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error deleting custom pipeline script" });
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
        const stepsResult = await queries.project.getPipeline(projectPath);
        const scriptsResult = await queries.project.getCustomScripts(projectPath);
        const scriptsById = new Map(
            (scriptsResult.rows || scriptsResult || []).map((row) => [row.ScriptId, row]),
        );

        const enabledSteps = (stepsResult.rows || stepsResult || [])
            .filter((row) => !!row.Enabled)
            .sort((a, b) => a.StepOrder - b.StepOrder)
            .map((row) => {
                const step = {
                    type: row.StepType,
                    order: row.StepOrder,
                    params: JSON.parse(row.Params || "{}"),
                };
                if (row.StepType === "custom") {
                    const script = scriptsById.get(row.ScriptId);
                    step.scriptPath = script
                        ? path.join(projectPath, "preprocessing", "scripts", script.FileName)
                        : null;
                    if (script && script.PythonPath) {
                        step.pythonPath = script.PythonPath;
                        step.scriptName = script.Name;
                    }
                }
                return step;
            });

        // The configured interpreter may have been removed since it was saved; fail the
        // request up front rather than inside the background job.
        for (const step of enabledSteps) {
            if (step.pythonPath) {
                const check = validatePythonPath(step.pythonPath);
                if (check.error) {
                    return res.status(400).json({
                        success: false,
                        error: `Custom script "${step.scriptName}": ${check.error}`,
                    });
                }
            }
        }

        if (enabledSteps.length === 0) {
            return res.status(400).json({ success: false, error: "Pipeline has no enabled steps to apply" });
        }

        const jobId = `${Date.now()}`;
        const jobsDir = path.join(projectPath, "preprocessing", "jobs");
        if (!fs.existsSync(jobsDir)) {
            fs.mkdirSync(jobsDir, { recursive: true });
        }

        const manifestPath = path.join(jobsDir, `${jobId}-manifest.json`);
        const logPath = path.join(jobsDir, `${jobId}.log`);
        const statusPath = jobStatusPath(projectPath, jobId);
        const outputPath = path.join(projectPath, "preprocessing", "output", jobId);
        fs.writeFileSync(manifestPath, JSON.stringify({ steps: enabledSteps }, null, 2));

        const pythonPath = config.default_python_path || "python3";
        const wrapperPath = path.join(currentPath, "controllers", "preprocessing", "run_pipeline.py");
        const imagesPath = path.join(projectPath, "images");

        let totalImages = 0;
        try {
            totalImages = fs
                .readdirSync(imagesPath, { withFileTypes: true })
                .filter((entry) => entry.isFile()).length;
        } catch (err) {
            totalImages = 0;
        }

        // Record the job as running before the interpreter is even spawned so the UI
        // always has something to poll, even if the process dies immediately.
        const startedAt = new Date().toISOString();
        writeJobStatus(statusPath, {
            state: "running",
            total: totalImages,
            processed: 0,
            skipped: 0,
            startedAt,
        });

        // execFile (no shell) rather than exec(<interpolated string>): projectName/paths
        // land in this argument list, and a shell would let a metacharacter in either
        // break out of the command instead of being passed through as a literal arg.
        execFile(
            pythonPath,
            [
                wrapperPath,
                "--images",
                imagesPath,
                "--manifest",
                manifestPath,
                "--output",
                outputPath,
                "--status",
                statusPath,
            ],
            (err, stdout, stderr) => {
                const summary = err
                    ? `FAILED: ${err.message}\n${stderr || ""}`
                    : `SUCCEEDED\n${stdout || ""}`;
                fs.writeFile(logPath, summary, () => {});

                // The wrapper reports progress itself; this callback is the authority on
                // how the process ended, including when it never got as far as Python
                // code (bad interpreter, missing OpenCV, ...).
                const last = readJobStatus(statusPath) || {};
                try {
                    writeJobStatus(statusPath, {
                        ...last,
                        startedAt,
                        state: err ? "failed" : "completed",
                        error: err ? tailOf(`${stderr || ""}` || err.message) : undefined,
                        finishedAt: new Date().toISOString(),
                    });
                } catch (writeErr) {
                    global.logger.error(writeErr);
                }
                if (err) {
                    global.logger.error(`Pre-processing job ${jobId} failed:`, err);
                }
            },
        );

        return res.status(200).json({ success: true, jobId });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error starting pre-processing job" });
    }
}

function tailOf(text) {
    return text.length > 2000 ? text.slice(-2000) : text;
}

/**
 * GET /api/v2/projects/:admin/:projectName/preprocessing/jobs/:jobId
 *
 * Progress of an /apply job: { state: running|completed|failed, total, processed, skipped, error? }.
 */
async function getPreprocessingJobStatus(req, res) {
    const { admin, projectName, jobId } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }
    if (!JOB_ID_PATTERN.test(jobId)) {
        return res.status(400).json({ success: false, error: "Invalid job id" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const status = readJobStatus(jobStatusPath(projectPath, jobId));
    if (!status) {
        return res.status(404).json({ success: false, error: "Job not found" });
    }

    return res.status(200).json({ success: true, jobId, ...status });
}

/**
 * GET /api/v2/projects/preprocessing/example-script
 *
 * Returns a heavily commented example custom step users can download, edit and
 * upload back as a pipeline script. Content is static, so no project is needed.
 */
async function downloadExampleScript(req, res) {
    try {
        const content = await fs.promises.readFile(EXAMPLE_SCRIPT_PATH, "utf8");
        res.set("Content-Type", "text/x-python; charset=utf-8");
        res.set("Content-Disposition", `attachment; filename="${EXAMPLE_SCRIPT_FILENAME}"`);
        return res.send(content);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error reading example script" });
    }
}

module.exports = {
    downloadExampleScript,
    getPreprocessingPipeline,
    savePreprocessingPipeline,
    uploadCustomScript,
    setCustomScriptPythonPath,
    deleteCustomScript,
    applyPreprocessingPipeline,
    getPreprocessingJobStatus,
};
