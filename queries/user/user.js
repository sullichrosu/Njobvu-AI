module.exports = {
    managed: {
        getUserProjects: async function (username) {
            const query = `SELECT * FROM Access WHERE Username = ?`;
            const result = await global.managedDbClient.all(query, [username]);

            return result;
        },
        getUser: async function (username) {
            const query = "SELECT * FROM Users WHERE Username = ?";
            const result = await global.managedDbClient.get(query, [username]);

            return result;
        },
        createUser: async function (
            username,
            digest,
            firstName,
            lastName,
            email,
        ) {
            const query =
                "INSERT INTO Users (Username, Password, FirstName, LastName, Email) VALUES (?, ?, ?, ?, ?)";
            const result = await global.managedDbClient.run(query, [
                username,
                digest,
                firstName,
                lastName,
                email,
            ]);

            return result;
        },
        checkUserExists: async function (username) {
            const query =
                "SELECT COUNT(*) AS ExistingUsers FROM `Users` WHERE Username = ?";
            const result = await global.managedDbClient.get(query, [username]);

            return result;
        },
        checkUserHasProjectAccess: async function (
            username,
            projectName,
            admin,
        ) {
            const query =
                "SELECT COUNT(*) AS ExistingAccess FROM Access WHERE Username = ? AND Pname = ? AND Admin = ?";
            const result = await global.managedDbClient.get(query, [
                username,
                projectName,
                admin,
            ]);

            return result;
        },
        grantUserAccess: async function (username, projectName, admin) {
            const query =
                "INSERT INTO Access (Username, PName, Admin) VALUES(?, ?, ?)";
            const result = await global.managedDbClient.run(query, [
                username,
                projectName,
                admin,
            ]);

            return result;
        },
        updateUser: async function (
            username,
            newUserName = null,
            digest = null,
            firstName = null,
            lastName = null,
            email = null,
        ) {
            const query = `UPDATE users
                SET
                    Username = CASE WHEN ? IS NOT NULL THEN ? ELSE Username END,
                    Password = CASE WHEN ? IS NOT NULL THEN ? ELSE Password END,
                    FirstName = CASE WHEN ? IS NOT NULL THEN ? ELSE FirstName END,
                    LastName = CASE WHEN ? IS NOT NULL THEN ? ELSE LastName END,
                    Email = CASE WHEN ? IS NOT NULL THEN ? ELSE Email END
                WHERE Username = ?;
                `;
            const result = await global.managedDbClient.run(query, [
                newUserName,
                newUserName,
                digest,
                digest,
                firstName,
                firstName,
                lastName,
                lastName,
                email,
                email,
                username,
            ]);

            return result;
        },
        deleteUser: async function (username) {
            const query = "DELETE FROM Users WHERE Username = ?";
            const result = await global.managedDbClient.run(query, query, [
                username,
            ]);

            return result;
        },
    },
};
