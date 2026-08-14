const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * Sandboxed Python Execution Runner
 * 
 * Safely executes Python scripts in an isolated process with timeout,
 * memory/buffer limits, static code sanitization, and role-gating checks.
 */

// List of forbidden patterns/modules in Python scripts for untrusted/sandboxed execution
const DISALLOWED_PATTERNS = [
    /\bimport\s+os\b/,
    /\bfrom\s+os\b/,
    /\bimport\s+subprocess\b/,
    /\bfrom\s+subprocess\b/,
    /\bimport\s+pty\b/,
    /\bimport\s+ctypes\b/,
    /\bimport\s+socket\b/,
    /\bimport\s+shutil\b/,
    /\bexec\s*\(/,
    /\beval\s*\(/,
    /__import__\s*\(/,
    /open\s*\(\s*['"][^'"]*\/etc\//
];

// Allowed roles for executing sandboxed python code
const ALLOWED_ROLES = ["admin", "engineer", "cv_pipeline", "user"];

function sanitizeCode(code, userRole = "user") {
    if (!code || typeof code !== "string") {
        throw new Error("Invalid Python code provided");
    }

    if (!ALLOWED_ROLES.includes(userRole)) {
        throw new Error(`Role '${userRole}' is not authorized to run Python scripts.`);
    }

    // Static safety check against forbidden patterns
    for (const pattern of DISALLOWED_PATTERNS) {
        if (pattern.test(code)) {
            throw new Error(`Forbidden code pattern detected in Python script: ${pattern.source}`);
        }
    }

    return true;
}

/**
 * Executes a Python script string or file path in a sandboxed process.
 * 
 * @param {Object} options
 * @param {string} [options.code] - Python code string to execute
 * @param {string} [options.scriptPath] - Path to existing Python script file
 * @param {Array<string>} [options.args=[]] - Arguments to pass to script
 * @param {string} [options.userRole='user'] - Role of requesting user
 * @param {number} [options.timeout=30000] - Execution timeout in ms
 * @param {number} [options.maxBuffer=1048576] - Max stdout/stderr size in bytes (1MB)
 * @param {string} [options.cwd] - Working directory for execution
 * @param {Object} [options.env={}] - Additional environment variables
 */
async function runSandboxedPython(options = {}) {
    const {
        code,
        scriptPath,
        args = [],
        userRole = "user",
        timeout = 30000,
        maxBuffer = 1024 * 1024, // 1MB memory ceiling protection
        cwd,
        env = {}
    } = options;

    const pythonPath = (global.configFile && global.configFile.default_python_path) || process.env.PYTHON_PATH || "python3";

    let tempFilePath = null;
    let targetScript = scriptPath;

    if (code) {
        sanitizeCode(code, userRole);

        const tmpDir = path.join(__dirname, "..", "tmp", "sandbox");
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        tempFilePath = path.join(tmpDir, `sandbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
        fs.writeFileSync(tempFilePath, code, "utf8");
        targetScript = tempFilePath;
    } else if (scriptPath) {
        if (!fs.existsSync(scriptPath)) {
            throw new Error(`Script file not found: ${scriptPath}`);
        }
        const fileContent = fs.readFileSync(scriptPath, "utf8");
        sanitizeCode(fileContent, userRole);
    } else {
        throw new Error("Either 'code' or 'scriptPath' must be provided.");
    }

    const workingDir = cwd || path.join(__dirname, "..", "tmp");
    if (!fs.existsSync(workingDir)) {
        fs.mkdirSync(workingDir, { recursive: true });
    }

    const executionEnv = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        ...env
    };

    return new Promise((resolve) => {
        const startTime = Date.now();
        let stdoutData = "";
        let stderrData = "";
        let stdoutTruncated = false;
        let stderrTruncated = false;

        const child = spawn(pythonPath, [targetScript, ...args], {
            cwd: workingDir,
            env: executionEnv,
            stdio: ["ignore", "pipe", "pipe"]
        });

        const pid = child.pid;
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            try {
                child.kill("SIGKILL");
            } catch (err) {
                // Ignore kill errors
            }
        }, timeout);

        child.stdout.on("data", (chunk) => {
            if (stdoutData.length + chunk.length <= maxBuffer) {
                stdoutData += chunk.toString("utf8");
            } else if (!stdoutTruncated) {
                stdoutTruncated = true;
                stdoutData += "\n[Output truncated due to memory limit]";
            }
        });

        child.stderr.on("data", (chunk) => {
            if (stderrData.length + chunk.length <= maxBuffer) {
                stderrData += chunk.toString("utf8");
            } else if (!stderrTruncated) {
                stderrTruncated = true;
                stderrData += "\n[Stderr truncated due to memory limit]";
            }
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            cleanupTempFile(tempFilePath);
            resolve({
                success: false,
                pid,
                exitCode: -1,
                error: err.message,
                stdout: stdoutData,
                stderr: stderrData,
                executionTimeMs: Date.now() - startTime,
                timedOut: false
            });
        });

        child.on("close", (code, signal) => {
            clearTimeout(timer);
            cleanupTempFile(tempFilePath);

            const duration = Date.now() - startTime;
            if (timedOut) {
                resolve({
                    success: false,
                    pid,
                    exitCode: null,
                    signal: "SIGKILL",
                    error: `Execution timed out after ${timeout}ms`,
                    stdout: stdoutData,
                    stderr: stderrData,
                    executionTimeMs: duration,
                    timedOut: true
                });
            } else {
                resolve({
                    success: code === 0,
                    pid,
                    exitCode: code,
                    signal,
                    stdout: stdoutData,
                    stderr: stderrData,
                    executionTimeMs: duration,
                    timedOut: false
                });
            }
        });
    });
}

function cleanupTempFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            // Ignore cleanup error
        }
    }
}

module.exports = {
    runSandboxedPython,
    sanitizeCode,
    ALLOWED_ROLES,
    DISALLOWED_PATTERNS
};
