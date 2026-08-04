const { runSandboxedPython } = require("../utils/sandboxedPythonRunner");
const { generateRunSummary, listAvailableRuns } = require("../utils/runSummaryGenerator");

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
        const { runDir, runType, runName } = req.body;
        if (!runDir) {
            return res.status(400).json({ error: "runDir is required" });
        }

        const summary = await generateRunSummary(runDir, { runType, runName });
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
        const baseRunsDir = (req.query && req.query.baseRunsDir) || (req.body && req.body.baseRunsDir);
        const runs = listAvailableRuns(baseRunsDir);
        return res.status(200).json({
            success: true,
            runs
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
    handleListRuns
};
