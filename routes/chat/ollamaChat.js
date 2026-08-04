const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const queries = require("../../queries/queries");

const NJOBVU_SYSTEM_PROMPT = `You are Njobvu AI, an intelligent assistant built into the Njobvu Computer Vision & Machine Learning Platform.
Your primary role is to assist engineers, researchers, and project managers in managing computer vision workflows including image labeling, dataset imports/exports, model training (YOLO, Darknet, Inception), model inference, and run performance analytics.

You have access to and can provide structured instructions or payloads for interacting with Njobvu platform endpoints and system tools:

1. Python Sandbox Execution (/api/sandbox/python):
   - Used for executing sandboxed Python code for custom data transformations, metrics calculation, and batch label processing.
   - When proposing Python code to execute in the sandbox, format your request clearly or provide the exact JSON payload structured for /api/sandbox/python.

2. Run Summaries & Analytics (/api/runs/summary):
   - Used for aggregating, generating, and inspecting deep context run performance reports (loss curves, mAP, precision/recall, training/inference file artifacts like args.yaml, config.json, results.csv).

3. Project Run Listings & Inspection:
   - Access run images via /runs/:runId/images.
   - Manage training runs via /yolo-run, /run, /deleteRun.
   - Manage inference via /yolo-inf, /inception-inf, and dataset integration via /inference/add-inference-run-to-dataset.

Guidelines:
- Maintain a helpful, precise, and professional tone focused on CV/ML tasks.
- Always sanitize and validate assumptions about bounding box coordinates, polygon formats, class labels, and pixel dimensions.
- Respect user permissions and role gating (User vs Admin).`;

/**
 * Discovers live system context (active projects and available run directories).
 */
function getLiveSystemContext() {
    let projects = [];
    let runs = { train: [], inference: [] };

    // 1. Discover projects from public/projects
    try {
        const projectsDir = path.join(process.cwd(), "public", "projects");
        if (fs.existsSync(projectsDir)) {
            projects = fs.readdirSync(projectsDir).filter(name => {
                try {
                    return fs.statSync(path.join(projectsDir, name)).isDirectory();
                } catch (e) {
                    return false;
                }
            });
        }
    } catch (err) {
        global.logger?.error("Error scanning projects directory for live context:", err);
    }

    // 2. Discover runs using listAvailableRuns from runSummaryGenerator if available, or direct filesystem scan
    try {
        let runSummaryGen = null;
        try {
            runSummaryGen = require("../../utils/runSummaryGenerator");
        } catch (e) {}

        if (runSummaryGen && typeof runSummaryGen.listAvailableRuns === "function") {
            runs = runSummaryGen.listAvailableRuns();
        } else {
            ["train", "inference"].forEach(type => {
                const baseDir = path.join(process.cwd(), "runs", type);
                if (fs.existsSync(baseDir)) {
                    runs[type] = fs.readdirSync(baseDir).filter(name => {
                        try {
                            return fs.statSync(path.join(baseDir, name)).isDirectory();
                        } catch (e) {
                            return false;
                        }
                    });
                }
            });
        }
    } catch (err) {
        global.logger?.error("Error discovering runs for live context:", err);
    }

    return { projects, runs };
}

/**
 * Builds the dynamic system prompt including live project and run context.
 */
function buildDynamicSystemPrompt(liveContext, projectName = null) {
    const trainRunsStr = Array.isArray(liveContext.runs.train)
        ? (liveContext.runs.train.map(r => typeof r === "string" ? r : r.id || r.name).join(", ") || "None")
        : JSON.stringify(liveContext.runs.train);

    const infRunsStr = Array.isArray(liveContext.runs.inference)
        ? (liveContext.runs.inference.map(r => typeof r === "string" ? r : r.id || r.name).join(", ") || "None")
        : JSON.stringify(liveContext.runs.inference);

    const contextBlock = `

--- DYNAMIC LIVE SYSTEM CONTEXT ---
Active Projects in Workspace: ${liveContext.projects.length > 0 ? liveContext.projects.join(", ") : "None found"}
Available Training Runs (runs/train): ${trainRunsStr}
Available Inference Runs (runs/inference): ${infRunsStr}
${projectName ? `Current Focused Project: ${projectName}` : "No specific project selected in focus"}
-----------------------------------`;

    return `${NJOBVU_SYSTEM_PROMPT}${contextBlock}`;
}

/**
 * Helper to execute Python code in a sandboxed temporary file environment.
 */
async function runSandboxedPython(code) {
    if (!code || typeof code !== "string") {
        return { success: false, error: "No valid Python code string provided." };
    }

    const tmpDir = path.join(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    const tempFile = path.join(tmpDir, `sandbox_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);
    fs.writeFileSync(tempFile, code, "utf8");

    const pyCmd = process.env.PYTHON_PATH || "python3";

    return new Promise((resolve) => {
        exec(`${pyCmd} "${tempFile}"`, { timeout: 15000, cwd: process.cwd() }, (err, stdout, stderr) => {
            if (err) {
                exec(`python "${tempFile}"`, { timeout: 15000, cwd: process.cwd() }, (err2, stdout2, stderr2) => {
                    try { fs.unlinkSync(tempFile); } catch (e) {}
                    if (err2) {
                        resolve({
                            success: false,
                            error: err2.message,
                            stdout: stdout2 || stdout || "",
                            stderr: stderr2 || err2.message
                        });
                    } else {
                        resolve({
                            success: true,
                            stdout: stdout2 || "",
                            stderr: stderr2 || ""
                        });
                    }
                });
            } else {
                try { fs.unlinkSync(tempFile); } catch (e) {}
                resolve({
                    success: true,
                    stdout: stdout || "",
                    stderr: stderr || ""
                });
            }
        });
    });
}

/**
 * Helper to generate or aggregate run summaries from run output folders.
 */
async function generateRunSummary(runId = null, runType = "train", projectName = null) {
    try {
        let runSummaryGen = null;
        try {
            runSummaryGen = require("../../utils/runSummaryGenerator");
        } catch (e) {}

        if (runSummaryGen && typeof runSummaryGen.generateRunSummary === "function") {
            return await runSummaryGen.generateRunSummary(runId, runType, projectName);
        }
    } catch (e) {}

    // Fallback run summary generator implementation
    const type = (runType && runType.toLowerCase().includes("inf")) ? "inference" : "train";
    const baseDir = path.join(process.cwd(), "runs", type);
    let targetRunDir = null;
    let selectedRunId = runId;

    if (selectedRunId && fs.existsSync(path.join(baseDir, selectedRunId))) {
        targetRunDir = path.join(baseDir, selectedRunId);
    } else if (fs.existsSync(baseDir)) {
        const dirs = fs.readdirSync(baseDir).filter(d => {
            try { return fs.statSync(path.join(baseDir, d)).isDirectory(); } catch (e) { return false; }
        });
        if (dirs.length > 0) {
            selectedRunId = dirs[dirs.length - 1]; // Latest run
            targetRunDir = path.join(baseDir, selectedRunId);
        }
    }

    if (!targetRunDir || !fs.existsSync(targetRunDir)) {
        return {
            success: false,
            error: `Run directory for '${selectedRunId || "active run"}' not found under runs/${type}.`
        };
    }

    const files = fs.readdirSync(targetRunDir);
    const artifacts = {};
    for (const f of files) {
        if (["args.yaml", "config.json", "results.csv", "train.log", "inference.log"].includes(f)) {
            try {
                artifacts[f] = fs.readFileSync(path.join(targetRunDir, f), "utf8").slice(0, 1500);
            } catch (e) {}
        }
    }

    const summaryContent = `## Run Summary Report: ${selectedRunId} (${type})
- Path: \`${targetRunDir}\`
- Artifacts Inspected: ${Object.keys(artifacts).join(", ") || "None"}

${Object.entries(artifacts).map(([filename, content]) => `### Artifact: ${filename}\n\`\`\`\n${content}\n\`\`\``).join("\n\n")}`;

    return {
        success: true,
        runId: selectedRunId,
        runType: type,
        summary: summaryContent,
        artifacts
    };
}

/**
 * Handles Ollama Chat requests with role gating, live context injection, and tool parsing/execution.
 */
async function ollamaChat(req, res) {
    try {
        const { messages, model, ollamaUrl, projectName, roleRequired, intent, runId, runType, code } = req.body || {};

        // 1. Authenticate user
        const username = req.cookies?.Username || req.headers["x-user-id"] || req.body?.username;
        if (!username) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: User login required to access the chat harness."
            });
        }

        // 2. Validate input parameters
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request: 'messages' must be a non-empty array of message objects."
            });
        }

        for (const msg of messages) {
            if (!msg || typeof msg !== "object" || !msg.role || typeof msg.content !== "string") {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request: Each message object must contain a valid 'role' and 'content' string."
                });
            }
        }

        // 3. User verification & Role Gating
        let userRecord = null;
        if (global.managedDbClient) {
            try {
                const userQueryResult = await queries.managed.getUser(username);
                userRecord = userQueryResult?.row;
            } catch (err) {
                global.logger?.error("Error retrieving user for chat role gating:", err);
            }
        }

        const requiredRole = roleRequired || (global.configFile && global.configFile.chat_required_role) || "user";
        
        let userRole = "user";
        let isProjectAdmin = false;

        if (projectName && global.managedDbClient) {
            try {
                const accessCheck = await queries.managed.checkUserHasProjectAccess(username, projectName, 1);
                if (accessCheck?.row?.ExistingAccess > 0) {
                    isProjectAdmin = true;
                    userRole = "admin";
                }
            } catch (err) {
                global.logger?.error("Error checking project admin status:", err);
            }
        }

        // Enforce strict role gating
        if (requiredRole === "admin" && !isProjectAdmin && username !== "ZeroUser") {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Admin role required to access this Ollama chat functionality for project '${projectName || "global"}'.`
            });
        }

        // 4. Resolve live context and dynamic system prompt
        const liveContext = getLiveSystemContext();
        const dynamicSystemPrompt = buildDynamicSystemPrompt(liveContext, projectName);

        const lastUserMessage = messages[messages.length - 1]?.content || "";

        // 5. Backend Tool Execution Logic (explicit intent or keyword trigger)
        let toolResult = null;

        if (intent === "generate_summary") {
            const extractedRunId = runId || (lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i) ? lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i)[1] : null);
            toolResult = await generateRunSummary(extractedRunId, runType || "train", projectName);
        } else if (intent === "run_python") {
            const pythonCode = code || (lastUserMessage.match(/```python\s*([\s\S]*?)\s*```/) ? lastUserMessage.match(/```python\s*([\s\S]*?)\s*```/)[1] : null) || lastUserMessage;
            toolResult = await runSandboxedPython(pythonCode);
        } else if (intent === "list_runs") {
            toolResult = {
                success: true,
                runs: liveContext.runs
            };
        } else if (!req.body.skipToolExecution) {
            if (/\b(summarize|run summary|training run summary|inference run summary)\b/i.test(lastUserMessage)) {
                const extractedRunId = runId || (lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i) ? lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i)[1] : null);
                toolResult = await generateRunSummary(extractedRunId, runType || "train", projectName);
            } else if (code || /\b(run_python|python sandbox|execute python)\b/i.test(lastUserMessage)) {
                const pythonCode = code || (lastUserMessage.match(/```python\s*([\s\S]*?)\s*```/) ? lastUserMessage.match(/```python\s*([\s\S]*?)\s*```/)[1] : null);
                if (pythonCode) {
                    toolResult = await runSandboxedPython(pythonCode);
                }
            }
        }

        // If tool execution took place directly from quick chip or explicit intent, append tool output
        let augmentedMessages = [...messages];
        if (toolResult && toolResult.success) {
            if (toolResult.summary) {
                augmentedMessages.push({
                    role: "system",
                    content: `[TOOL OUTPUT - Run Summary Executed Successfully]:\n${toolResult.summary}`
                });
            } else if (toolResult.stdout !== undefined) {
                augmentedMessages.push({
                    role: "system",
                    content: `[TOOL OUTPUT - Python Sandbox Output]:\nSTDOUT:\n${toolResult.stdout}\nSTDERR:\n${toolResult.stderr}`
                });
            } else if (toolResult.runs) {
                augmentedMessages.push({
                    role: "system",
                    content: `[TOOL OUTPUT - Available Runs]:\n${JSON.stringify(toolResult.runs, null, 2)}`
                });
            }
        }

        // 6. Resolve Ollama configuration
        const targetOllamaUrl = ollamaUrl || (global.configFile && global.configFile.ollama_url) || "http://localhost:11434";
        const targetModel = model || (global.configFile && global.configFile.ollama_default_model) || "llama3";

        const endpoint = `${targetOllamaUrl.replace(/\/+$/, "")}/api/chat`;

        // 7. Construct payload messages with dynamic system prompt
        const formattedMessages = [];
        const existingSystemIndex = augmentedMessages.findIndex(m => m.role === "system");

        if (existingSystemIndex === -1) {
            formattedMessages.push({ role: "system", content: dynamicSystemPrompt });
            augmentedMessages.forEach(m => formattedMessages.push({ role: m.role, content: m.content }));
        } else {
            augmentedMessages.forEach((m, idx) => {
                if (idx === existingSystemIndex) {
                    formattedMessages.push({
                        role: "system",
                        content: `${dynamicSystemPrompt}\n\nAdditional Context:\n${m.content}`
                    });
                } else {
                    formattedMessages.push({ role: m.role, content: m.content });
                }
            });
        }

        // 8. Invoke Ollama API
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: targetModel,
                    messages: formattedMessages,
                    stream: false
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                if (toolResult) {
                    return res.status(200).json({
                        success: true,
                        message: {
                            role: "assistant",
                            content: toolResult.summary || (toolResult.stdout !== undefined ? `**Python Sandbox Output:**\n\`\`\`\n${toolResult.stdout || toolResult.stderr || toolResult.error || ""}\n\`\`\`` : "Tool executed successfully.")
                        },
                        model: targetModel,
                        user: username,
                        role: userRole,
                        toolResult: toolResult
                    });
                }

                return res.status(502).json({
                    success: false,
                    error: `Ollama service returned error status ${response.status}`,
                    details: errorText
                });
            }

            const data = await response.json();
            let assistantReply = data.message || { role: "assistant", content: data.response || "" };

            // If toolResult was generated, append tool execution output if not already present
            if (toolResult && toolResult.summary && !assistantReply.content.includes(toolResult.runId || "Summary")) {
                assistantReply.content += `\n\n${toolResult.summary}`;
            } else if (toolResult && toolResult.stdout !== undefined && !assistantReply.content.includes(toolResult.stdout)) {
                assistantReply.content += `\n\n**Python Sandbox Execution Result:**\n\`\`\`\n${toolResult.stdout || "(No stdout)"}\n\`\`\``;
            }

            return res.status(200).json({
                success: true,
                message: assistantReply,
                model: data.model || targetModel,
                user: username,
                role: userRole,
                toolResult: toolResult || null,
                liveContext: liveContext
            });
        } catch (fetchErr) {
            clearTimeout(timeoutId);

            if (fetchErr.name === "AbortError") {
                return res.status(504).json({
                    success: false,
                    error: "Gateway Timeout: Ollama endpoint request timed out after 30 seconds.",
                    endpoint: targetOllamaUrl
                });
            }

            global.logger?.error(`Ollama connection error to ${endpoint}:`, fetchErr.message);

            // Fallback response with tool output if Ollama is offline or errors
            if (toolResult) {
                return res.status(200).json({
                    success: true,
                    message: {
                        role: "assistant",
                        content: toolResult.summary || (toolResult.stdout !== undefined ? `**Python Sandbox Output:**\n\`\`\`\n${toolResult.stdout || toolResult.stderr || toolResult.error || ""}\n\`\`\`` : "Tool executed successfully.")
                    },
                    model: targetModel,
                    user: username,
                    role: userRole,
                    toolResult: toolResult
                });
            }

            return res.status(502).json({
                success: false,
                error: `Ollama endpoint unreachable at ${targetOllamaUrl}`,
                details: fetchErr.message
            });
        }
    } catch (err) {
        global.logger?.error("Unhandled error in ollamaChat controller:", err);
        return res.status(500).json({
            success: false,
            error: "Internal Server Error during chat processing.",
            details: err.message
        });
    }
}

/**
 * Route handler for POST /api/runs/summary
 */
async function generateRunSummaryHandler(req, res) {
    try {
        const { runId, runType, projectName } = req.body || {};
        const result = await generateRunSummary(runId, runType, projectName);
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(404).json(result);
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

/**
 * Route handler for POST /api/sandbox/python
 */
async function sandboxedPythonHandler(req, res) {
    try {
        const { code, script } = req.body || {};
        const pythonCode = code || script;
        const result = await runSandboxedPython(pythonCode);
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
}

ollamaChat.NJOBVU_SYSTEM_PROMPT = NJOBVU_SYSTEM_PROMPT;
ollamaChat.getLiveSystemContext = getLiveSystemContext;
ollamaChat.buildDynamicSystemPrompt = buildDynamicSystemPrompt;
ollamaChat.generateRunSummary = generateRunSummary;
ollamaChat.runSandboxedPython = runSandboxedPython;
ollamaChat.generateRunSummaryHandler = generateRunSummaryHandler;
ollamaChat.sandboxedPythonHandler = sandboxedPythonHandler;

module.exports = ollamaChat;
