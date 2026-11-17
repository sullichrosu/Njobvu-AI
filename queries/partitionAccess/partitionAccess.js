module.exports = {
    managed: {
        listPartitionAccess: async function() {
            const query =
                "SELECT * FROM PartitionAccess ORDER BY Username, Partition";
            return await global.managedDbClient.all(query, []);
        },
        listPartitionsForUser: async function(username) {
            const query =
                "SELECT Partition FROM PartitionAccess WHERE Username = ?";
            return await global.managedDbClient.all(query, [username]);
        },
        listUsersForPartition: async function(partition) {
            const query =
                "SELECT Username FROM PartitionAccess WHERE Partition = ?";
            return await global.managedDbClient.all(query, [partition]);
        },
        checkPartitionAccess: async function(username, partition) {
            const query =
                "SELECT COUNT(*) AS ExistingAccess FROM PartitionAccess WHERE Username = ? AND Partition = ?";
            return await global.managedDbClient.get(query, [
                username,
                partition,
            ]);
        },
        grantPartitionAccess: async function(username, partition) {
            const query =
                "INSERT OR IGNORE INTO PartitionAccess (Username, Partition) VALUES (?, ?)";
            return await global.managedDbClient.run(query, [
                username,
                partition,
            ]);
        },
        revokePartitionAccess: async function(username, partition) {
            const query =
                "DELETE FROM PartitionAccess WHERE Username = ? AND Partition = ?";
            return await global.managedDbClient.run(query, [
                username,
                partition,
            ]);
        },
        revokeAllPartitionAccessForUser: async function(username) {
            const query = "DELETE FROM PartitionAccess WHERE Username = ?";
            return await global.managedDbClient.run(query, [username]);
        },
    },
};
