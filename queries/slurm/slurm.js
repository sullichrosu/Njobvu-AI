module.exports = {
    managed: {
        recordSlurmJob: async function (
            slurmJobId,
            username,
            projectName,
            admin,
            jobType,
            runPath,
            submittedAt,
        ) {
            const query =
                "INSERT INTO SlurmJobs (SlurmJobId, Username, PName, Admin, JobType, RunPath, Status, SubmittedAt) " +
                "VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)";

            return await global.managedDbClient.run(query, [
                slurmJobId,
                username,
                projectName,
                admin,
                jobType,
                runPath,
                submittedAt,
            ]);
        },
        updateSlurmJobStatus: async function (slurmJobId, status, updatedAt) {
            const query =
                "UPDATE SlurmJobs SET Status = ?, UpdatedAt = ? WHERE SlurmJobId = ?";

            return await global.managedDbClient.run(query, [
                status,
                updatedAt,
                slurmJobId,
            ]);
        },
        getSlurmJob: async function (slurmJobId) {
            const query = "SELECT * FROM SlurmJobs WHERE SlurmJobId = ?";

            return await global.managedDbClient.get(query, [slurmJobId]);
        },
        listSlurmJobsForUser: async function (username) {
            const query =
                "SELECT * FROM SlurmJobs WHERE Username = ? ORDER BY SubmittedAt DESC";

            return await global.managedDbClient.all(query, [username]);
        },
        listSlurmJobsForProject: async function (projectName, admin) {
            const query =
                "SELECT * FROM SlurmJobs WHERE PName = ? AND Admin = ? ORDER BY SubmittedAt DESC";

            return await global.managedDbClient.all(query, [
                projectName,
                admin,
            ]);
        },
    },
};
