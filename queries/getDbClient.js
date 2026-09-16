const path = require("path");
const fs = require("fs");
const { Client } = require("./client");

function getDbClient(projectPath) {
    if (!projectPath) {
        throw new Error(`Invalid project path: ${projectPath}`);
    }

    if (!global.projectDbClients) {
        global.projectDbClients = {};
    }

    if (global.projectDbClients[projectPath]) {
        return global.projectDbClients[projectPath];
    }

    const normalized = path.normalize(projectPath);
    if (global.projectDbClients[normalized]) {
        return global.projectDbClients[normalized];
    }

    for (const key of Object.keys(global.projectDbClients)) {
        if (path.normalize(key) === normalized) {
            return global.projectDbClients[key];
        }
    }

    if (fs.existsSync(projectPath)) {
        const files = fs.readdirSync(projectPath);
        const dbFile = files.find((f) => f.endsWith(".db"));
        if (dbFile) {
            const dbPath = path.join(projectPath, dbFile);
            const client = new Client(dbPath);
            global.projectDbClients[projectPath] = client;
            global.projectDbClients[normalized] = client;
            return client;
        }
    }

    throw new Error(`Project database client not found for project path: ${projectPath}`);
}

module.exports = getDbClient;
