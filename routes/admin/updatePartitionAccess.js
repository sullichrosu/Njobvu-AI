const queries = require("../../queries/queries");
const { isValidSlurmPartition } = require("../../utils/slurmAccess");

async function updatePartitionAccess(req, res) {
    const user = req.cookies.Username;

    if (!user) {
        return res.redirect("/");
    }

    const config = global.configFile || {};

    if (!config.admin || user !== config.admin) {
        return res.redirect("/home");
    }

    let usernames = req.body.usernames;
    if (!Array.isArray(req.body.usernames)) {
        usernames = [req.body.usernames];
    }

    let accessEntries = req.body.access;
    if (!Array.isArray(req.body.access)) {
        accessEntries = [req.body.access];
    }

    const desiredByUser = {};
    for (const username of usernames) {
        desiredByUser[username] = new Set();
    }

    for (const entry of accessEntries) {
        const separatorIndex = entry.indexOf(":");
        if (separatorIndex === -1) continue;

        const username = entry.slice(0, separatorIndex);
        const partition = entry.slice(separatorIndex + 1);

        if (!desiredByUser[username] || !isValidSlurmPartition(partition)) {
            continue;
        }

        desiredByUser[username].add(partition);
    }

    try {
        for (const username of Object.keys(desiredByUser)) {
            const desiredPartitions = desiredByUser[username];

            const currentResult =
                await queries.managed.listPartitionsForUser(username);
            const currentPartitions = (
                (currentResult && currentResult.rows) ||
                []
            ).map((row) => row.Partition);

            for (const partition of currentPartitions) {
                if (desiredPartitions.has(partition)) {
                    continue;
                }

                await queries.managed.revokePartitionAccess(
                    username,
                    partition,
                );
            }

            for (const partition of desiredPartitions) {
                if (currentPartitions.includes(partition)) {
                    continue;
                }

                await queries.managed.grantPartitionAccess(
                    username,
                    partition,
                );
            }
        }
    } catch (err) {
        global.logger.error(err);
    }

    return res.redirect("/admin/partitions");
}

module.exports = updatePartitionAccess;
