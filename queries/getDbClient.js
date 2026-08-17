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

    // Determine actual .db file path
    let dbFile = normalized;
    if (!dbFile.endsWith(".db")) {
        const folderName = path.basename(normalized);
        const parts = folderName.split("-");
        const pName = parts.length > 1 ? parts.slice(1).join("-") : folderName;
        dbFile = path.join(normalized, `${pName}.db`);
    }

    if (fs.existsSync(dbFile)) {
        const client = new Client(dbFile);
        client.open();
        global.projectDbClients[projectPath] = client;
        global.projectDbClients[normalized] = client;
        return client;
    }

    throw new Error(`Project database client not found for project path: ${projectPath}`);
}

module.exports = getDbClient;
