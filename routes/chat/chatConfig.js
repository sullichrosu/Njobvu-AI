const fs = require("fs");
const path = require("path");
const fetch = require("fetch");

const configFilePath = path.join(__dirname, "../../config.json");

/**
 * Get current chat & Ollama configuration.
 */
async function getChatConfig(req, res) {
    try {
        const config = global.configFile || {};
        return res.status(200).json({
            success: true,
            config: {
                ollama_url: config.ollama_url || "http://localhost:11434",
                ollama_default_model: config.ollama_default_model || "llama3",
                chat_required_role: config.chat_required_role || "user"
            }
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: "Failed to read chat configuration.",
            details: err.message
        });
    }
}

/**
 * Update chat & Ollama configuration.
 */
async function updateChatConfig(req, res) {
    try {
        const username = req.cookies?.Username || req.headers["x-user-id"] || req.body?.username;
        if (!username) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized: User login required."
            });
        }

        const { ollama_url, ollama_default_model, chat_required_role } = req.body || {};

        if (ollama_url && (typeof ollama_url !== "string" || !ollama_url.startsWith("http"))) {
            return res.status(400).json({
                success: false,
                error: "Bad Request: 'ollama_url' must be a valid URL starting with http:// or https://"
            });
        }

        if (chat_required_role && !["all", "user", "admin"].includes(chat_required_role)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request: 'chat_required_role' must be one of ['all', 'user', 'admin']"
            });
        }

        // Update global configuration object
        if (!global.configFile) global.configFile = {};
        if (ollama_url) global.configFile.ollama_url = ollama_url;
        if (ollama_default_model) global.configFile.ollama_default_model = ollama_default_model;
        if (chat_required_role) global.configFile.chat_required_role = chat_required_role;

        // Persist to config.json file
        try {
            fs.writeFileSync(configFilePath, JSON.stringify(global.configFile, null, 4), "utf-8");
        } catch (writeErr) {
            global.logger?.error("Could not write config.json:", writeErr);
        }

        return res.status(200).json({
            success: true,
            message: "Chat configuration updated successfully.",
            config: {
                ollama_url: global.configFile.ollama_url,
                ollama_default_model: global.configFile.ollama_default_model,
                chat_required_role: global.configFile.chat_required_role
            }
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: "Failed to update chat configuration.",
            details: err.message
        });
    }
}

/**
 * Fetch available models from Ollama server.
 */
async function getOllamaModels(req, res) {
    try {
        const config = global.configFile || {};
        const baseUrl = config.ollama_url || "http://localhost:11434";
        const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/tags`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(endpoint, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const models = (data.models || []).map(m => m.name || m.name);
                return res.status(200).json({
                    success: true,
                    connected: true,
                    models: models.length > 0 ? models : ["llama3"]
                });
            }
        } catch (fetchErr) {
            clearTimeout(timeoutId);
        }

        // Fallback default models if Ollama is currently offline or unreachable
        return res.status(200).json({
            success: true,
            connected: false,
            models: ["llama3", "llama2", "mistral", "codellama"]
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: "Failed to fetch Ollama models.",
            details: err.message
        });
    }
}

module.exports = {
    getChatConfig,
    updateChatConfig,
    getOllamaModels
};
