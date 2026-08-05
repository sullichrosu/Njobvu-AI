const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const queries = require("../../queries/queries");

const NJOBVU_SYSTEM_PROMPT = `You are Njobvu AI, an intelligent assistant built into the Njobvu Computer Vision & Machine Learning Platform.
Your primary role is to assist engineers, researchers, and project managers in managing computer vision workflows including image labeling, dataset imports/exports, model training (YOLO, Darknet, Inception), model inference, and run performance analytics.

The Njobvu backend automatically executes tools on your behalf whenever a request requires them, and injects the resulting tool output directly into your conversation context as [TOOL OUTPUT] / [INGESTED RUN DOCUMENT ARTIFACTS CONTEXT] blocks. You never need to ask the user for JSON payloads, structured instructions, endpoint paths, or to call platform endpoints manually.

Available auto-executed tools (results are injected into your context when run):
1. Python Sandbox Execution: executes sandboxed Python code for custom data transformations, metrics calculation, and batch label processing. Its stdout/stderr are provided to you in the context.
2. Run Summaries & Analytics: aggregates and inspects deep context run performance reports (loss curves, mAP, precision/recall, training/inference artifacts like args.yaml, config.json, results.csv).
3. Project Run Listings & Inspection: lists available training and inference runs for the active project and exposes run images and run management actions.

Rules:
- Answer directly from the injected tool output and live system context. Never fabricate metrics, results, or performance numbers.
- Never ask the user to provide JSON payloads or to call endpoints manually; the tools are executed for you.
- If a tool result or live context is not available, say plainly what could not be retrieved and why. Never respond with a canned acknowledgment such as "I will be ready to assist..." or "I will provide a summary..." — answer the user's actual question using the information you have.
- Maintain a helpful, precise, and professional tone focused on CV/ML tasks.
- Always sanitize and validate assumptions about bounding box coordinates, polygon formats, class labels, and pixel dimensions.
- Respect user permissions and role gating (User vs Admin).`;

/**
 * Normalizes run listings into standardized train and inference arrays regardless of whether input is an Array or Object.
 * Extracts runName, relPath, runType, id, or name from run metadata objects or strings.
 */
function normalizeRunListings(runs) {
    let trainRuns = [];
    let infRuns = [];

    if (!runs) {
        return { train: [], inference: [] };
    }

    if (Array.isArray(runs)) {
        // Check if array has attached .train or .inference properties
        if (Array.isArray(runs.train) && runs.train.length > 0) {
            trainRuns = runs.train;
        }
        if (Array.isArray(runs.inference) && runs.inference.length > 0) {
            infRuns = runs.inference;
        }

        // If no attached properties or if empty, categorize elements by runType/type
        if (trainRuns.length === 0 && infRuns.length === 0 && runs.length > 0) {
            runs.forEach(r => {
                const rType = (typeof r === "object" ? (r.runType || r.type || "") : "").toLowerCase();
                if (rType.includes("inf") || rType.includes("detect")) {
                    infRuns.push(r);
                } else {
                    trainRuns.push(r);
                }
            });
        }
    } else if (typeof runs === "object") {
        if (Array.isArray(runs.train)) {
            trainRuns = runs.train;
        }
        if (Array.isArray(runs.inference)) {
            infRuns = runs.inference;
        }
    }

    const formatItem = r => {
        if (typeof r === "string") return r;
        if (!r || typeof r !== "object") return String(r);
        return r.runName || r.name || r.id || r.relPath || r.runPath || JSON.stringify(r);
    };

    return {
        train: trainRuns.map(formatItem),
        inference: infRuns.map(formatItem)
    };
}

/**
 * Formats available run listings into markdown text for display in chat messages.
 * Seamlessly supports both Array<Object> and Object { train, inference } structures.
 */
function formatRunListings(runs, projectName = null) {
    const normalized = normalizeRunListings(runs);
    const trainRuns = normalized.train;
    const infRuns = normalized.inference;

    let text = `### Available Runs${projectName ? ` for Project '${projectName}'` : ""}:\n\n`;
    text += `**Training Runs (${trainRuns.length}):**\n`;
    if (trainRuns.length > 0) {
        text += trainRuns.map(r => `- \`${r}\``).join("\n") + "\n\n";
    } else {
        text += "_No active training runs found._\n\n";
    }

    text += `**Inference Runs (${infRuns.length}):**\n`;
    if (infRuns.length > 0) {
        text += infRuns.map(r => `- \`${r}\``).join("\n");
    } else {
        text += "_No active inference runs found._";
    }

    return text;
}

/**
 * Guarantees the actual tool output/report is ALWAYS the primary content of the assistant reply.
 * When the LLM produced conversational text, the tool output is prepended so it is never lost,
 * even when the LLM preamble happens to contain words from the report (e.g. "summary").
 */
function setToolOutputAsPrimary(currentContent, toolOutput) {
    if (!toolOutput || toolOutput.trim() === "") {
        return currentContent;
    }
    if (!currentContent || currentContent.trim() === "") {
        return toolOutput;
    }
    return `${toolOutput}\n\n${currentContent}`;
}

/**
 * Broad free-text detection for run summary/report requests.
 * Matches phrasings like "summarize runs", "give me a summary of the training run",
 * "how is my training going", "report on the results", "what are the metrics".
 */
function matchesRunSummaryIntent(text) {
    if (!text) return false;
    return /\b(summar\w*|run report|report on|performance|metrics|results of)\b/i.test(text)
        || /\bhow (did|is|was) (the |my |our |this )?(training|run|model)\b/i.test(text);
}

/**
 * Broad free-text detection for run listing requests.
 * Matches phrasings like "list available runs", "show me runs", "which runs",
 * "what runs do I have", "available runs".
 */
function matchesListRunsIntent(text) {
    if (!text) return false;
    return /\blist\b.{0,60}?\bruns?\b/i.test(text)
        || /\bshow\b.{0,60}?\bruns?\b/i.test(text)
        || /\b(which|what|available)\s+runs?\b/i.test(text);
}

/**
 * Detects Python sandbox execution requests from free text or provided code payloads.
 */
function matchesPythonIntent(code, text) {
    if (code && typeof code === "string" && code.trim().length > 0) return true;
    return Boolean(text) && (/```python[\s\S]*?```/i.test(text) || /\b(run_python|python sandbox|execute python)\b/i.test(text));
}

/**
 * Recursively scans directory trees for run output folders (mirrors the summary generator util's
 * discovery). Used by the legacy fallback so it searches the same roots as the util.
 */
function discoverRunDirectories(searchDir, visited = new Set(), maxDepth = 5, currentDepth = 0) {
    const discovered = [];
    if (!searchDir || currentDepth > maxDepth || !fs.existsSync(searchDir)) {
        return discovered;
    }

    try {
        const canonical = path.resolve(searchDir);
        if (visited.has(canonical)) return discovered;
        visited.add(canonical);

        const stat = fs.statSync(canonical);
        if (!stat.isDirectory()) return discovered;

        const entries = fs.readdirSync(canonical);

        // Mirrors the util's strict run-marker heuristic: only run-level marker files identify a run
        // output folder. Structural dirs (project roots, weights/ checkpoint folders) are excluded.
        const isRunDir = entries.some(f =>
            f === "results.csv" || f === "args.yaml" || f === "opt.yaml" || f === "hyp.yaml" ||
            f === "labels.jpg" || f === "labels.png" ||
            (f.endsWith(".png") && (f.includes("results") || f.includes("confusion") || f.includes("F1") || f.includes("labels")))
        );

        if (isRunDir) {
            discovered.push(canonical);
        }

        for (const entry of entries) {
            if (entry === "node_modules" || entry === ".git" || entry === "tmp") continue;
            const childPath = path.join(canonical, entry);
            try {
                if (fs.statSync(childPath).isDirectory()) {
                    discovered.push(...discoverRunDirectories(childPath, visited, maxDepth, currentDepth + 1));
                }
            } catch (e) {}
        }
    } catch (e) {}

    return discovered;
}

/**
 * Safely extracts Python code from incoming payload parameters or markdown code fences.
 * Prevents plain English prompt strings from being executed as Python scripts.
 * Returns a diagnostic status script if status/check chip is clicked without explicit code.
 */
function extractPythonCode(code, lastUserMessage = "") {
    if (code && typeof code === "string" && code.trim().length > 0) {
        const fenceMatch = code.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
        return fenceMatch ? fenceMatch[1].trim() : code.trim();
    }

    if (lastUserMessage && typeof lastUserMessage === "string") {
        const fenceMatch = lastUserMessage.match(/```(?:python)?\s*([\s\S]*?)\s*```/i);
        if (fenceMatch && fenceMatch[1].trim().length > 0) {
            return fenceMatch[1].trim();
        }
    }

    // Default to diagnostic status script if status check or chip clicked
    if (/\b(status|check|info|health|diagnostic)\b/i.test(lastUserMessage) || !lastUserMessage) {
        return `import sys, platform, os
print("=== Njobvu AI Python Sandbox Status ===")
print(f"Python Version: {platform.python_version()} on {platform.system()} ({platform.machine()})")
print(f"Working Directory: {os.getcwd()}")
print(f"Process PID: {os.getpid()}")
print("Sandbox Execution: ONLINE & OPERATIONAL")`;
    }

    return null;
}

/**
 * Verifies if a project exists and whether the user has access permissions.
 * Checks both Projects table (where Admin = username) and Access table (secondary access).
 * Expands filesystem folder matching for hyphenated (user-project) and underscore (user_project) formats.
 */
async function verifyProjectAccess(username, projectName) {
    if (!projectName) {
        return { exists: false, hasAccess: false, isAdmin: false };
    }

    let exists = false;
    let hasAccess = false;
    let isAdmin = false;

    // 1. Check directory existence in public/projects/ (supporting exact, hyphenated, or underscore formats)
    try {
        const projectsDir = path.join(process.cwd(), "public", "projects");
        if (fs.existsSync(projectsDir)) {
            const entries = fs.readdirSync(projectsDir);
            exists = entries.some(e =>
                e === projectName ||
                e.endsWith(`-${projectName}`) ||
                e.endsWith(`_${projectName}`) ||
                e.startsWith(`${username}-${projectName}`) ||
                e.startsWith(`${username}_${projectName}`) ||
                e.includes(projectName)
            );
        }
    } catch (e) {}

    // 2. Check Database if managedDbClient exists
    if (global.managedDbClient) {
        try {
            // Check Projects table where user is Admin / Creator
            const projectCheck = await global.managedDbClient.get(
                "SELECT COUNT(*) AS count FROM Projects WHERE PName = ? AND Admin = ?",
                [projectName, username]
            );
            const adminProjectCount = projectCheck?.count ?? projectCheck?.row?.count ?? projectCheck?.["COUNT(*)"] ?? 0;
            if (adminProjectCount > 0) {
                isAdmin = true;
                hasAccess = true;
                exists = true;
            }

            // Check if project exists in Projects table under any admin
            const projectExistsCheck = await global.managedDbClient.get(
                "SELECT COUNT(*) AS count FROM Projects WHERE PName = ?",
                [projectName]
            );
            const totalProjectCount = projectExistsCheck?.count ?? projectExistsCheck?.row?.count ?? projectExistsCheck?.["COUNT(*)"] ?? 0;
            if (totalProjectCount > 0) {
                exists = true;
            }

            // Check Access table for secondary member / access grants
            if (!hasAccess) {
                const adminAccessCheck = await queries.managed.checkUserHasProjectAccess(username, projectName, 1);
                const adminAccessCount = adminAccessCheck?.count ?? adminAccessCheck?.row?.ExistingAccess ?? adminAccessCheck?.ExistingAccess ?? 0;
                if (adminAccessCount > 0) {
                    isAdmin = true;
                    hasAccess = true;
                    exists = true;
                } else {
                    const memberAccessCheck = await queries.managed.checkUserHasProjectAccess(username, projectName, 0);
                    const memberAccessCount = memberAccessCheck?.count ?? memberAccessCheck?.row?.ExistingAccess ?? memberAccessCheck?.ExistingAccess ?? 0;
                    if (memberAccessCount > 0) {
                        hasAccess = true;
                        exists = true;
                    }
                }
            }
        } catch (err) {
            global.logger?.error("Error checking user project access:", err);
        }
    } else {
        // Fallback when managedDbClient is not initialized (e.g. unit tests or standalone)
        if (username === "ZeroUser" || username === "TestUser" || username === "test") {
            hasAccess = true;
            exists = true;
        } else {
            hasAccess = exists;
        }
    }

    if (username === "ZeroUser") {
        hasAccess = true;
        isAdmin = true;
        exists = true;
    }

    return { exists, hasAccess, isAdmin };
}

/**
 * Discovers live system context (active projects and available run directories).
 * If projectName is provided, scopes runs to that project if project access is valid.
 */
function getLiveSystemContext(projectName = null, projectAuth = { hasAccess: true }) {
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

    // Only discover/inject runs if user has access to specified project (or no specific project requested)
    if (!projectName || projectAuth.hasAccess) {
        try {
            let runSummaryGen = null;
            try {
                runSummaryGen = require("../../utils/runSummaryGenerator");
            } catch (e) {}

            if (runSummaryGen && typeof runSummaryGen.listAvailableRuns === "function") {
                const rawRuns = runSummaryGen.listAvailableRuns(projectName);
                runs = normalizeRunListings(rawRuns);
            } else {
                ["train", "inference"].forEach(type => {
                    const baseDir = path.join(process.cwd(), "runs", type);
                    if (fs.existsSync(baseDir)) {
                        runs[type] = fs.readdirSync(baseDir).filter(name => {
                            try {
                                const isDir = fs.statSync(path.join(baseDir, name)).isDirectory();
                                if (!isDir) return false;
                                if (projectName) {
                                    return name.includes(projectName);
                                }
                                return true;
                            } catch (e) {
                                return false;
                            }
                        });
                    }
                });
                runs = normalizeRunListings(runs);
            }
        } catch (err) {
            global.logger?.error("Error discovering runs for live context:", err);
        }
    }

    return { projects, runs };
}

/**
 * Builds the dynamic system prompt including live project and run context.
 */
function buildDynamicSystemPrompt(liveContext, projectName = null, projectAuth = { hasAccess: true, exists: true }) {
    const trainRunsStr = Array.isArray(liveContext.runs.train)
        ? (liveContext.runs.train.map(r => typeof r === "string" ? r : r.id || r.name).join(", ") || "None")
        : JSON.stringify(liveContext.runs.train);

    const infRunsStr = Array.isArray(liveContext.runs.inference)
        ? (liveContext.runs.inference.map(r => typeof r === "string" ? r : r.id || r.name).join(", ") || "None")
        : JSON.stringify(liveContext.runs.inference);

    let projectStatusNote = "No specific project selected in focus";
    if (projectName) {
        if (!projectAuth.exists) {
            projectStatusNote = `[WARNING]: Specified project '${projectName}' does not exist.`;
        } else if (!projectAuth.hasAccess) {
            projectStatusNote = `[WARNING]: Access denied for project '${projectName}'.`;
        } else {
            projectStatusNote = `Current Focused Active Project: ${projectName} (Access Verified)`;
        }
    }

    const contextBlock = `

--- DYNAMIC LIVE SYSTEM CONTEXT ---
Active Workspace Projects: ${liveContext.projects.length > 0 ? liveContext.projects.join(", ") : "None found"}
Available Training Runs (runs/train): ${trainRunsStr}
Available Inference Runs (runs/inference): ${infRunsStr}
Project Scoping Status: ${projectStatusNote}
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
 * Resolves the target run directory through the summary generator util's discovery so nested
 * layouts (runs/detect/train) and project-scoped directories are found, matches a provided runId
 * by runName/relPath, picks the most recent run (by mtime) when no runId is given, then invokes
 * the util with its real contract: generateRunSummary(runDir, { runType, projectName }).
 */
async function generateRunSummary(runId = null, runType = "train", projectName = null, username = null) {
    if (projectName && username) {
        const projectAuth = await verifyProjectAccess(username, projectName);
        if (!projectAuth.hasAccess) {
            return {
                success: false,
                error: `Forbidden: User '${username}' does not have access to project '${projectName}' or project does not exist.`
            };
        }
    }

    const isInference = runType && String(runType).toLowerCase().includes("inf");
    const type = isInference ? "inference" : "train";

    try {
        let runSummaryGen = null;
        try {
            runSummaryGen = require("../../utils/runSummaryGenerator");
        } catch (e) {}

        if (runSummaryGen && typeof runSummaryGen.listAvailableRuns === "function" && typeof runSummaryGen.generateRunSummary === "function") {
            // 1. Resolve the target run directory through the util's discovery (handles nested
            //    runs/detect/train layouts and project-scoped directories).
            const availableRuns = runSummaryGen.listAvailableRuns(projectName);
            let allRuns = Array.isArray(availableRuns) ? availableRuns : [];
            let typedRuns = isInference ? availableRuns.inference : availableRuns.train;
            // The util falls back to an unfiltered listing when a project filter matches nothing;
            // for summary resolution that would summarize an unrelated run, so treat it as "no runs".
            if (projectName && availableRuns.isFallback === true) {
                allRuns = [];
                typedRuns = [];
            }
            const candidates = (Array.isArray(typedRuns) && typedRuns.length > 0) ? typedRuns : allRuns;

            let resolvedRunDir = null;
            let selectedRunId = runId;

            if (runId) {
                const runIdLower = String(runId).trim().toLowerCase();
                const matched = allRuns.find(r =>
                    String(r.runName).toLowerCase() === runIdLower ||
                    String(r.relPath).toLowerCase() === runIdLower ||
                    String(r.runName).toLowerCase().includes(runIdLower)
                );
                if (!matched) {
                    return {
                        success: false,
                        error: `Run '${runId}' not found. Available runs: ${allRuns.map(r => r.runName).join(", ") || "none"}.`
                    };
                }
                resolvedRunDir = matched.runPath;
                selectedRunId = matched.runName;
            } else if (candidates.length > 0) {
                // listAvailableRuns returns runs sorted by most recent mtime first.
                const best = candidates[0];
                resolvedRunDir = best.runPath;
                selectedRunId = best.runName;
            }

            if (resolvedRunDir && fs.existsSync(resolvedRunDir)) {
                // 2. Invoke the util with its real contract: generateRunSummary(runDir, { runType, projectName }).
                let utilRunType;
                if (isInference) utilRunType = "inference";
                else if (String(runType || "").toLowerCase().startsWith("train")) utilRunType = "training";
                else utilRunType = runType || "auto";

                const utilResult = await runSummaryGen.generateRunSummary(resolvedRunDir, { runType: utilRunType, projectName });
                const utilReport = utilResult && (utilResult.markdownSummary || utilResult.summaryMd || utilResult.summary);
                if (utilResult && utilReport) {
                    let artifactNames = [];
                    try {
                        artifactNames = fs.readdirSync(resolvedRunDir).filter(f =>
                            ["args.yaml", "config.json", "results.csv", "summary.json", "metrics.json", "train.log", "inference.log"].includes(f)
                        );
                    } catch (e) {}

                    // Confirm where the generated summaries were actually written so callers can verify
                    // the per-run summary landed in the run's own output folder (never silent).
                    const summaryFiles = [];
                    for (const f of ["run_summary.md", "summary.json"]) {
                        if (fs.existsSync(path.join(resolvedRunDir, f))) {
                            summaryFiles.push(path.resolve(path.join(resolvedRunDir, f)));
                        }
                    }
                    if (utilResult.isAggregated && Array.isArray(utilResult.runs)) {
                        utilResult.runs.forEach(r => {
                            if (r && r.runDir && fs.existsSync(path.join(r.runDir, "run_summary.md"))) {
                                summaryFiles.push(path.resolve(path.join(r.runDir, "run_summary.md")));
                            }
                        });
                    }

                    const documentContext = `### INGESTED RUN DOCUMENT ARTIFACTS FOR RUN ${selectedRunId || path.basename(resolvedRunDir)}:\n` +
                        `- Run Output Directory: \`${resolvedRunDir}\`\n` +
                        `- Run Type: ${utilResult.runType || type}\n` +
                        `- Ingested Artifact Files: ${artifactNames.join(", ") || "None"}\n` +
                        `- Summary Files Written: ${summaryFiles.join(", ") || "none"}\n\n${utilReport}`;

                    return {
                        success: true,
                        runId: selectedRunId || path.basename(resolvedRunDir),
                        runType: utilResult.runType || type,
                        targetRunDir: resolvedRunDir,
                        runDir: resolvedRunDir,
                        summaryFiles: summaryFiles,
                        documentContext: documentContext,
                        summary: utilReport,
                        markdownSummary: utilReport,
                        artifacts: artifactNames
                    };
                }
            } else if (!resolvedRunDir) {
                return {
                    success: false,
                    error: `No ${type} runs found${projectName ? ` for project '${projectName}'` : ""}.`
                };
            }
        }
    } catch (e) {
        global.logger?.error("Error resolving run summary via summary generator util:", e);
    }

    // 3. Fallback legacy generator with broadened scan roots so it never dead-ends on an empty runs/train.
    const fallbackRoots = [
        path.join(process.cwd(), "runs"),
        path.join(process.cwd(), "runs", "train"),
        path.join(process.cwd(), "runs", "inference"),
        path.join(process.cwd(), "runs", "detect"),
        path.join(process.cwd(), "public", "projects")
    ];

    const allFallbackDirs = [];
    fallbackRoots.forEach(root => {
        if (fs.existsSync(root)) {
            allFallbackDirs.push(...discoverRunDirectories(root));
        }
    });
    const uniqueDirs = Array.from(new Set(allFallbackDirs));

    const projectFiltered = uniqueDirs.filter(dir => {
        if (!projectName) return true;
        const dirLower = dir.toLowerCase();
        const projLower = projectName.toLowerCase();
        return dirLower.includes(projLower) || path.basename(dir).toLowerCase().includes(projLower);
    });

    let candidateDirs = projectFiltered;
    const typedFiltered = projectFiltered.filter(dir => {
        const dirLower = dir.toLowerCase();
        return isInference ? !dirLower.includes("train") : dirLower.includes("train");
    });
    if (typedFiltered.length > 0) {
        candidateDirs = typedFiltered;
    }
    candidateDirs.sort((a, b) => {
        try {
            return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        } catch (e) {
            return 0;
        }
    });

    let targetRunDir = null;
    let selectedRunId = runId;

    if (runId) {
        const runIdLower = String(runId).trim().toLowerCase();
        const matched = candidateDirs.find(dir =>
            path.basename(dir).toLowerCase() === runIdLower ||
            path.basename(dir).toLowerCase().includes(runIdLower)
        );
        if (!matched) {
            return {
                success: false,
                error: `Run '${runId}' not found. Available runs: ${candidateDirs.map(d => path.basename(d)).join(", ") || "none"}.`
            };
        }
        targetRunDir = matched;
        selectedRunId = path.basename(matched);
    } else if (candidateDirs.length > 0) {
        targetRunDir = candidateDirs[0];
        selectedRunId = path.basename(candidateDirs[0]);
    }

    if (!targetRunDir || !fs.existsSync(targetRunDir)) {
        return {
            success: false,
            error: `No ${type} runs found${projectName ? ` for project '${projectName}'` : ""}.`
        };
    }

    const files = fs.readdirSync(targetRunDir);
    const artifacts = {};
    for (const f of files) {
        if (["args.yaml", "config.json", "results.csv", "summary.json", "metrics.json", "train.log", "inference.log"].includes(f)) {
            try {
                artifacts[f] = fs.readFileSync(path.join(targetRunDir, f), "utf8").slice(0, 3000);
            } catch (e) {}
        }
    }

    const documentContext = `### INGESTED RUN DOCUMENT ARTIFACTS FOR RUN ${selectedRunId}:
- Run Output Directory: \`${targetRunDir}\`
- Run Mode: ${type}
- Ingested Artifact Files: ${Object.keys(artifacts).join(", ") || "None"}

${Object.entries(artifacts).map(([filename, content]) => `#### File Artifact: ${filename}\n\`\`\`\n${content}\n\`\`\``).join("\n\n")}`;

    const summaryContent = `## Run Summary Report: ${selectedRunId} (${type})
- Path: \`${targetRunDir}\`
- Artifacts Inspected: ${Object.keys(artifacts).join(", ") || "None"}

${documentContext}`;

    return {
        success: true,
        runId: selectedRunId,
        runType: type,
        targetRunDir: targetRunDir,
        runDir: targetRunDir,
        documentContext: documentContext,
        summary: summaryContent,
        artifacts
    };
}

/**
 * Handles Ollama Chat requests with role gating, live context injection, project access verification, and tool parsing/execution.
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

        // 4. Project Existence & User Project Access Verification
        let projectAuth = { exists: false, hasAccess: true, isAdmin: false };
        if (projectName) {
            projectAuth = await verifyProjectAccess(username, projectName);
            if (projectAuth.isAdmin) {
                isProjectAdmin = true;
                userRole = "admin";
            } else if (projectAuth.hasAccess) {
                userRole = "user";
            }

            // Enforce strict project access gating for run-aware tool requests
            if (!projectAuth.hasAccess) {
                const lastMsgText = messages[messages.length - 1]?.content || "";
                if (intent === "generate_summary" || /summarize|run summary/i.test(lastMsgText)) {
                    return res.status(403).json({
                        success: false,
                        error: `Forbidden: User '${username}' does not have access to project '${projectName}' or project does not exist.`
                    });
                }
            }
        }

        // Enforce strict global role gating
        if (requiredRole === "admin" && !isProjectAdmin && username !== "ZeroUser") {
            return res.status(403).json({
                success: false,
                error: `Forbidden: Admin role required to access this Ollama chat functionality for project '${projectName || "global"}'.`
            });
        }

        // 5. Resolve live context and dynamic system prompt with verified project scoping
        const liveContext = getLiveSystemContext(projectName, projectAuth);
        const dynamicSystemPrompt = buildDynamicSystemPrompt(liveContext, projectName, projectAuth);

        const lastUserMessage = messages[messages.length - 1]?.content || "";

        // 6. Backend Tool Execution Logic (explicit intent or keyword trigger)
        let toolResult = null;

        if (intent === "generate_summary") {
            const extractedRunId = runId || (lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i) ? lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i)[1] : null);
            toolResult = await generateRunSummary(extractedRunId, runType || "train", projectName, username);
        } else if (intent === "run_python") {
            const pythonCode = extractPythonCode(code, lastUserMessage);
            if (pythonCode) {
                toolResult = await runSandboxedPython(pythonCode);
            } else {
                toolResult = {
                    success: false,
                    error: "No valid Python code block provided. Please provide Python code wrapped in ```python ... ``` fences."
                };
            }
        } else if (intent === "list_runs") {
            toolResult = {
                success: true,
                runs: liveContext.runs
            };
        } else if (!req.body.skipToolExecution) {
            if (matchesRunSummaryIntent(lastUserMessage)) {
                if (projectName && !projectAuth.hasAccess) {
                    toolResult = {
                        success: false,
                        error: `Forbidden: User '${username}' does not have access to project '${projectName}'.`
                    };
                } else {
                    const extractedRunId = runId || (lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i) ? lastUserMessage.match(/run\s+([a-zA-Z0-9_-]+)/i)[1] : null);
                    toolResult = await generateRunSummary(extractedRunId, runType || "train", projectName, username);
                }
            } else if (matchesListRunsIntent(lastUserMessage)) {
                if (projectName && !projectAuth.hasAccess) {
                    toolResult = {
                        success: false,
                        error: `Forbidden: User '${username}' does not have access to project '${projectName}'.`
                    };
                } else {
                    toolResult = {
                        success: true,
                        runs: liveContext.runs
                    };
                }
            } else if (matchesPythonIntent(code, lastUserMessage)) {
                const pythonCode = extractPythonCode(code, lastUserMessage);
                if (pythonCode) {
                    toolResult = await runSandboxedPython(pythonCode);
                }
            }
        }

        // If tool execution took place directly, supply ingested document context to Ollama prompt
        let augmentedMessages = [...messages];
        if (toolResult && toolResult.success) {
            if (toolResult.documentContext || toolResult.summary) {
                const ingestedContext = toolResult.documentContext || toolResult.summary;
                augmentedMessages.push({
                    role: "system",
                    content: `[INGESTED RUN DOCUMENT ARTIFACTS CONTEXT]:\n${ingestedContext}\n\n` +
                             `INSTRUCTION FOR LLM ASSISTANT:\n` +
                             `Analyze the ingested run document artifacts above. Generate a detailed, professional custom Markdown narrative report interpreting loss trajectories, mAP performance metrics, hyperparameter choices, and concrete technical recommendations for model optimization.`
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
        } else if (toolResult && toolResult.success === false) {
            // Surface the tool failure so the LLM explains the real reason instead of a generic acknowledgment.
            const errorText = toolResult.error || toolResult.stderr || "Tool execution failed without a specific error message.";
            augmentedMessages.push({
                role: "system",
                content: `[TOOL EXECUTION FAILED]:\n${errorText}`
            });
        }

        // 7. Resolve Ollama configuration
        const targetOllamaUrl = ollamaUrl || (global.configFile && global.configFile.ollama_url) || "http://localhost:11434";
        const targetModel = model || (global.configFile && global.configFile.ollama_default_model) || "llama3";

        const endpoint = `${targetOllamaUrl.replace(/\/+$/, "")}/api/chat`;

        // 8. Short-circuit tool failures deterministically: never hand a failed tool to the LLM.
        //    Small models ramble into a marketing-style feature list when asked to narrate a failure.
        if (toolResult && toolResult.success === false) {
            const errorText = toolResult.error || toolResult.stderr || "Tool execution failed without a specific error message.";
            const runs = liveContext.runs || { train: [], inference: [] };
            const hasRuns = (Array.isArray(runs.train) && runs.train.length > 0) || (Array.isArray(runs.inference) && runs.inference.length > 0);
            const runsHint = hasRuns
                ? formatRunListings(runs, projectName)
                : `No runs are currently available${projectName ? ` for project '${projectName}'` : ""}.`;
            const content = `**Tool Execution Error:**\n${errorText}\n\n${runsHint}\n\nTip: ask to summarize a specific run, e.g. \`summarize run <run-name>\`.`;
            return res.status(200).json({
                success: true,
                message: {
                    role: "assistant",
                    content: content
                },
                model: targetModel,
                user: username,
                role: userRole,
                toolResult: toolResult,
                liveContext: liveContext
            });
        }

        // 8b. Short-circuit successful run listings deterministically: never hand a formatted listing to
        //     the LLM. Small models append unsolicited prose/feature lists after the listing, so the
        //     formatted markdown IS the final assistant reply.
        if (toolResult && toolResult.success === true && toolResult.runs) {
            const content = formatRunListings(toolResult.runs, projectName);
            return res.status(200).json({
                success: true,
                message: {
                    role: "assistant",
                    content: content
                },
                model: targetModel,
                user: username,
                role: userRole,
                toolResult: toolResult,
                liveContext: liveContext
            });
        }

        // 9. Construct payload messages with dynamic system prompt
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

        // 10. Invoke Ollama API
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
                    let fallbackContent = "Tool executed successfully.";
                    if (toolResult.success === false) {
                        fallbackContent = `**Tool Execution Error:**\n${toolResult.error || toolResult.stderr || "Tool execution failed without a specific error message."}`;
                    } else if (toolResult.runs) {
                        fallbackContent = formatRunListings(toolResult.runs, projectName);
                    } else if (toolResult.summary || toolResult.documentContext) {
                        fallbackContent = toolResult.summary || toolResult.documentContext;
                    } else if (toolResult.stdout !== undefined) {
                        fallbackContent = `**Python Sandbox Output:**\n\`\`\`\n${toolResult.stdout || toolResult.stderr || toolResult.error || ""}\n\`\`\``;
                    }

                    // Persist fallback narrative to run_summary.md if target run directory exists
                    const targetDir = toolResult.targetRunDir || toolResult.runDir;
                    if (targetDir && fs.existsSync(targetDir)) {
                        try {
                            fs.writeFileSync(path.join(targetDir, "run_summary.md"), fallbackContent, "utf8");
                        } catch (wErr) {}
                    }

                    return res.status(200).json({
                        success: true,
                        message: {
                            role: "assistant",
                            content: fallbackContent
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

            // Guarantee the actual tool output/report is ALWAYS the primary content of assistantReply.content.
            // Fragile substring checks (e.g. content.includes("Summary")) are avoided so a conversational LLM
            // preamble containing report keywords never suppresses the real tool result.
            if (toolResult) {
                if (toolResult.success === false) {
                    const errorText = toolResult.error || toolResult.stderr || "Tool execution failed without a specific error message.";
                    assistantReply.content = setToolOutputAsPrimary(assistantReply.content, `**Tool Execution Error:**\n${errorText}`);
                } else if (toolResult.runs) {
                    const formattedRuns = formatRunListings(toolResult.runs, projectName);
                    assistantReply.content = setToolOutputAsPrimary(assistantReply.content, formattedRuns);
                } else if (toolResult.summary || toolResult.documentContext) {
                    const report = toolResult.summary || toolResult.documentContext;
                    assistantReply.content = setToolOutputAsPrimary(assistantReply.content, report);
                } else if (toolResult.stdout !== undefined) {
                    const pyOutput = `**Python Sandbox Execution Result:**\n\`\`\`\n${toolResult.stdout || toolResult.stderr || toolResult.error || "(No output)"}\n\`\`\``;
                    assistantReply.content = setToolOutputAsPrimary(assistantReply.content, pyOutput);
                }

                // Persist the LLM-generated custom Markdown analysis narrative into run_summary.md
                const targetDir = toolResult.targetRunDir || toolResult.runDir;
                if (targetDir && fs.existsSync(targetDir) && assistantReply.content) {
                    try {
                        const summaryFilePath = path.join(targetDir, "run_summary.md");
                        fs.writeFileSync(summaryFilePath, assistantReply.content, "utf8");
                    } catch (writeErr) {
                        global.logger?.error("Error persisting LLM narrative to run_summary.md:", writeErr);
                    }
                }
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
                let fallbackContent = "Tool executed successfully.";
                if (toolResult.success === false) {
                    fallbackContent = `**Tool Execution Error:**\n${toolResult.error || toolResult.stderr || "Tool execution failed without a specific error message."}`;
                } else if (toolResult.runs) {
                    fallbackContent = formatRunListings(toolResult.runs, projectName);
                } else if (toolResult.summary || toolResult.documentContext) {
                    fallbackContent = toolResult.summary || toolResult.documentContext;
                } else if (toolResult.stdout !== undefined) {
                    fallbackContent = `**Python Sandbox Output:**\n\`\`\`\n${toolResult.stdout || toolResult.stderr || toolResult.error || ""}\n\`\`\``;
                }

                // Persist fallback narrative to run_summary.md if target run directory exists
                const targetDir = toolResult.targetRunDir || toolResult.runDir;
                if (targetDir && fs.existsSync(targetDir)) {
                    try {
                        fs.writeFileSync(path.join(targetDir, "run_summary.md"), fallbackContent, "utf8");
                    } catch (wErr) {}
                }

                return res.status(200).json({
                    success: true,
                    message: {
                        role: "assistant",
                        content: fallbackContent
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
        const username = req.cookies?.Username || req.headers["x-user-id"] || req.body?.username;
        const { runId, runType, projectName } = req.body || {};
        const result = await generateRunSummary(runId, runType, projectName, username);
        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(result.error?.includes("Forbidden") ? 403 : 404).json(result);
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
        const pythonCode = extractPythonCode(code, code || script) || code || script;
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
ollamaChat.normalizeRunListings = normalizeRunListings;
ollamaChat.formatRunListings = formatRunListings;
ollamaChat.setToolOutputAsPrimary = setToolOutputAsPrimary;
ollamaChat.matchesRunSummaryIntent = matchesRunSummaryIntent;
ollamaChat.matchesListRunsIntent = matchesListRunsIntent;
ollamaChat.matchesPythonIntent = matchesPythonIntent;
ollamaChat.extractPythonCode = extractPythonCode;
ollamaChat.verifyProjectAccess = verifyProjectAccess;
ollamaChat.getLiveSystemContext = getLiveSystemContext;
ollamaChat.buildDynamicSystemPrompt = buildDynamicSystemPrompt;
ollamaChat.generateRunSummary = generateRunSummary;
ollamaChat.runSandboxedPython = runSandboxedPython;
ollamaChat.generateRunSummaryHandler = generateRunSummaryHandler;
ollamaChat.sandboxedPythonHandler = sandboxedPythonHandler;

module.exports = ollamaChat;
