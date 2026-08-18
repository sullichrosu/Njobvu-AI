module.exports = {
    managed: {
        attachBucket: async function(
            projectName,
            admin,
            bucketName,
            region,
            prefix,
            accessKeyId,
            secretAccessKey,
            endpoint,
            maxImages
        ) {
            const parsedMax = (maxImages !== undefined && maxImages !== null && maxImages !== "")
                ? parseInt(maxImages, 10)
                : null;
            const validMax = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null;

            const query =
                "INSERT INTO S3Buckets (PName, Admin, BucketName, Region, Prefix, AccessKeyId, SecretAccessKey, Endpoint, MaxImages) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT(PName, Admin) DO UPDATE SET " +
                "BucketName = excluded.BucketName, Region = excluded.Region, Prefix = excluded.Prefix, " +
                "AccessKeyId = excluded.AccessKeyId, SecretAccessKey = excluded.SecretAccessKey, Endpoint = excluded.Endpoint, MaxImages = excluded.MaxImages";

            const result = await global.managedDbClient.run(query, [
                projectName,
                admin,
                bucketName,
                region,
                prefix || "",
                accessKeyId || null,
                secretAccessKey || null,
                endpoint || "",
                validMax,
            ]);

            return result;
        },
        getBucket: async function(projectName, admin) {
            const query =
                "SELECT * FROM S3Buckets WHERE PName = ? AND Admin = ?";

            const result = await global.managedDbClient.get(query, [
                projectName,
                admin,
            ]);

            return result;
        },
        deleteBucket: async function(projectName, admin) {
            const query =
                "DELETE FROM S3Buckets WHERE PName = ? AND Admin = ?";
            const result = await global.managedDbClient.run(query, [
                projectName,
                admin,
            ]);

            return result;
        },
        touchBucketSyncedAt: async function(projectName, admin, syncedAt) {
            const query =
                "UPDATE S3Buckets SET LastSyncedAt = ? WHERE PName = ? AND Admin = ?";
            const result = await global.managedDbClient.run(query, [
                syncedAt,
                projectName,
                admin,
            ]);

            return result;
        },
    },
};
