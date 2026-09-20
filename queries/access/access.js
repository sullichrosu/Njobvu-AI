module.exports = {
    managed: {
        getUserProjects: async function(username) {
            const query = "SELECT * FROM Access WHERE Username = ?";
            const result = await global.managedDbClient.all(query, [username]);

            if (result && result.error) {
                throw result.error instanceof Error ? result.error : new Error(result.error);
            }

            return { success: true, rows: result.rows };
        },
        deleteAccessFromProject: async function(username, projectName) {
            const query = "DELETE FROM Access WHERE Username = ? AND PName = ?";
            const result = await global.managedDbClient.run(query, [
                username,
                projectName,
            ]);

            return result;
        },
        deleteAllUserAccess: async function(username) {
            const query = "DELETE FROM Access WHERE Username = ?";
            const result = await global.managedDbClient.run(query, [username]);

            return result;
        },
        deleteAllAdminAccess: async function(username) {
            const query = "DELETE FROM Access WHERE Admin = ?";
            const result = await global.managedDbClient.run(query, [username]);

            return result;
        },
        changeAllAccessForUsername: async function(
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
        changeAllAccessAdminForUsername: async function(
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
