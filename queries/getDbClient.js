const path = require("path");

function getDbClient(projectPath) {
    if (!projectPath || !global.projectDbClients) {
        throw new Error(`Project database clients not initialized or invalid project path: ${projectPath}`);
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

    throw new Error(`Project database client not found for project path: ${projectPath}`);
}

module.exports = getDbClient;
