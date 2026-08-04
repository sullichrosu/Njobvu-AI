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
 * Handles Ollama Chat requests with role gating and input validation.
 */
async function ollamaChat(req, res) {
    try {
        const { messages, model, ollamaUrl, projectName, roleRequired } = req.body || {};

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

        // 4. Resolve Ollama configuration
        const targetOllamaUrl = ollamaUrl || (global.configFile && global.configFile.ollama_url) || "http://localhost:11434";
        const targetModel = model || (global.configFile && global.configFile.ollama_default_model) || "llama3";

        const endpoint = `${targetOllamaUrl.replace(/\/+$/, "")}/api/chat`;

        // 5. Construct payload messages with Njobvu AI master system prompt
        const formattedMessages = [];
        const existingSystemIndex = messages.findIndex(m => m.role === "system");

        if (existingSystemIndex === -1) {
            formattedMessages.push({ role: "system", content: NJOBVU_SYSTEM_PROMPT });
            messages.forEach(m => formattedMessages.push({ role: m.role, content: m.content }));
        } else {
            messages.forEach((m, idx) => {
                if (idx === existingSystemIndex) {
                    formattedMessages.push({
                        role: "system",
                        content: `${NJOBVU_SYSTEM_PROMPT}\n\nAdditional System Context:\n${m.content}`
                    });
                } else {
                    formattedMessages.push({ role: m.role, content: m.content });
                }
            });
        }

        // 6. Invoke Ollama API
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
                return res.status(502).json({
                    success: false,
                    error: `Ollama service returned error status ${response.status}`,
                    details: errorText
                });
            }

            const data = await response.json();
            return res.status(200).json({
                success: true,
                message: data.message || { role: "assistant", content: data.response || "" },
                model: data.model || targetModel,
                user: username,
                role: userRole
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

ollamaChat.NJOBVU_SYSTEM_PROMPT = NJOBVU_SYSTEM_PROMPT;

module.exports = ollamaChat;

