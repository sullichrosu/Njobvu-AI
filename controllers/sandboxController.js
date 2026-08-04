const path = require("path");
const fs = require("fs");
const { runSandboxedPython } = require("../utils/sandboxedPythonRunner");
const { generateRunSummary, listAvailableRuns, buildRunDocumentContext, persistCustomSummary } = require("../utils/runSummaryGenerator");

async function executePythonSandbox(req, res) {
    try {
        const { code, scriptPath, args, userRole } = req.body;
        const role = userRole || (req.session && req.session.role) || req.cookies.Role || "user";

        const result = await runSandboxedPython({
            code,
            scriptPath,
            args: args || [],
            userRole: role
        });

        if (!result.success && result.error) {
            return res.status(400).json(result);
        }
        return res.status(200).json(result);
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
}

async function handleRunSummary(req, res) {
    try {
        const { runDir, runType, runName, projectName, PName, allRuns } = req.body || {};
        const targetProject = projectName || PName || null;

        let targetDir = runDir;
        if (!targetDir && targetProject) {
            targetDir = path.join(__dirname, "..", "public", "projects", targetProject);
            if (!fs.existsSync(targetDir)) {
                targetDir = path.join(__dirname, "..", "runs");
            }
        }
        if (!targetDir) {
            targetDir = path.join(__dirname, "..", "runs");
        }

        const summary = await generateRunSummary(targetDir, {
            runType,
            runName,
            projectName: targetProject,
            allRuns: allRuns || !runDir
        });

        return res.status(200).json({
            success: true,
            summary
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
}

async function handleListRuns(req, res) {
    try {
        const projectName = (req.query && (req.query.projectName || req.query.PName)) || 
                            (req.body && (req.body.projectName || req.body.PName)) || null;
        const baseRunsDir = (req.query && req.query.baseRunsDir) || (req.body && req.body.baseRunsDir) || null;

        const runs = listAvailableRuns(projectName, baseRunsDir);
        return res.status(200).json({
            success: true,
            projectName: projectName || null,
            runs
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
}

async function handleRunDocumentContext(req, res) {
    try {
        const { runDir, projectName, PName } = req.body || req.query || {};
        const contextText = await buildRunDocumentContext(runDir, { projectName: projectName || PName });
        return res.status(200).json({
            success: true,
            runDir,
            contextText
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
}

async function handlePersistCustomSummary(req, res) {
    try {
        const { runDir, customNarrative, narrative } = req.body || {};
        const content = customNarrative || narrative;
        if (!runDir || !content) {
            return res.status(400).json({ success: false, error: "runDir and customNarrative are required" });
        }
        const summaryData = persistCustomSummary(runDir, content);
        return res.status(200).json({
            success: true,
            summary: summaryData
        });
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message
        });
    }
}

module.exports = {
    executePythonSandbox,
    handleRunSummary,
    handleListRuns,
    handleRunDocumentContext,
    handlePersistCustomSummary
};
