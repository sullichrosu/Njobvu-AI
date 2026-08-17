module.exports = {
    managed: {
        getUserProjects: async function (username) {
            const query = "SELECT * FROM Access WHERE Username = ?";
            try {
                if (global.managedDbClient && typeof global.managedDbClient.all === "function") {
                    const res = await global.managedDbClient.all(query, [username]);
                    const rows = Array.isArray(res) ? res : (res && res.rows ? res.rows : []);
                    return { success: true, rows };
                }
                if (global.managedDbClient && typeof global.managedDbClient.run === "function") {
                    const res = await global.managedDbClient.run(query, [username]);
                    const rows = Array.isArray(res) ? res : (res && res.rows ? res.rows : []);
                    return { success: true, rows };
                }
            } catch (err) {}
            return { success: false, rows: [] };
        },
        deleteAccessFromProject: async function (username, projectName) {
            const query = "DELETE FROM Access WHERE Username = ? AND PName = ?";
            const result = await global.managedDbClient.run(query, [
                username,
                projectName,
            ]);

            return result;
        },
        deleteAllUserAccess: async function (username) {
            const query = "DELETE FROM Access WHERE Username = ?";
            const result = await global.managedDbClient.run(query, [username]);

            return result;
        },
        deleteAllAdminAccess: async function (username) {
            const query = "DELETE FROM Access WHERE Admin = ?";
            const result = await global.managedDbClient.run(query, [username]);

            return result;
        },
        changeAllAccessForUsername: async function (
            currentUsername,
            newUsername,
        ) {
            const query = "UPDATE Access SET Username = ? WHERE Username = ?";
            const result = await global.managedDbClient.run(query, [
                currentUsername,
                newUsername,
            ]);

            return result;
        },
        changeAllAccessAdminForUsername: async function (
            currentUsername,
            newUsername,
        ) {
            const query = "UPDATE Access SET Admin = ? WHERE Admin = ?";
            const result = await global.managedDbClient.run(query, [
                currentUsername,
                newUsername,
            ]);
        },
    },
};
