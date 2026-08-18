const fs = require('fs');
const path = require('path');

// Default configuration fallback
const defaultConfig = {
    port: 3000,
    hostname: "http://localhost",
    default_python_path: "/usr/bin/python3",
    default_python_venv_path: "",
    default_darknet_path: "/usr/local/darknet",
    default_yolo_path: "/usr/local/bin/yolo",
    ollama_url: "http://localhost:11434",
    ollama_default_model: "gemma4:14b",
    default_7z_path: "/usr/bin/7z",
    training_max_buffer_size: 5,
    ssl_key_path: "",
    ssl_cert_path: "",
    chat_required_role: "user"
};

// Numeric fields that should be parsed as integers
const numericFields = new Set(['port', 'training_max_buffer_size']);

function loadConfig() {
    let fileConfig = {};
    const rootDir = path.join(__dirname, '..');
    const configPath = path.join(rootDir, 'config.json');
    const exampleConfigPath = path.join(rootDir, 'config.example.json');

    if (fs.existsSync(configPath)) {
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            fileConfig = JSON.parse(raw);
        } catch (err) {
            console.error(`Warning: Failed to parse config.json: ${err.message}`);
        }
    } else if (fs.existsSync(exampleConfigPath)) {
        try {
            const raw = fs.readFileSync(exampleConfigPath, 'utf8');
            fileConfig = JSON.parse(raw);
        } catch (err) {
            console.error(`Warning: Failed to parse config.example.json: ${err.message}`);
        }
    }

    const config = { ...defaultConfig, ...fileConfig };

    // Support CONFIG_JSON env var for passing a full JSON string
    if (process.env.CONFIG_JSON) {
        try {
            const parsedJson = JSON.parse(process.env.CONFIG_JSON);
            Object.assign(config, parsedJson);
        } catch (err) {
            console.error(`Warning: Failed to parse CONFIG_JSON env var: ${err.message}`);
        }
    }

    // Process environment variable overrides for known keys
    const knownKeys = Object.keys(config);
    for (const key of knownKeys) {
        const envCandidates = [
            `CONFIG_${key.toUpperCase()}`,
            key.toUpperCase(),
            `CONFIG_${key}`,
            key
        ];

        for (const envName of envCandidates) {
            if (process.env[envName] !== undefined && process.env[envName] !== '') {
                const val = process.env[envName];
                if (numericFields.has(key)) {
                    const parsed = parseInt(val, 10);
                    if (!isNaN(parsed)) {
                        config[key] = parsed;
                    }
                } else {
                    config[key] = val;
                }
                break;
            }
        }
    }

    // Process any arbitrary CONFIG_<KEY> env vars (e.g. CONFIG_CUSTOM_SETTING)
    for (const envKey of Object.keys(process.env)) {
        if (envKey.startsWith('CONFIG_') && envKey !== 'CONFIG_JSON') {
            const keyLower = envKey.slice(7).toLowerCase();
            if (config[keyLower] === undefined) {
                config[keyLower] = process.env[envKey];
            }
        }
    }

    return config;
}

const config = loadConfig();
config.loadConfig = loadConfig;

module.exports = config;
