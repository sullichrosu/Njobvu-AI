const queries = require("../queries/queries");

// User access to the HPC is config-driven rather than a DB/role table: this
// app has no existing global-admin concept (Access/Users only model
// per-project ownership), so gating Slurm submission behind an operator-set
// allowlist in config.json avoids inventing a parallel authority model.
// An empty allowlist means Slurm is available to every logged-in user.
function hasSlurmAccess(username) {
    if (!username) {
        return false;
    }

    const config = global.configFile || {};
    const allowedUsers = config.slurm_allowed_users;

    if (!Array.isArray(allowedUsers) || allowedUsers.length === 0) {
        return isSlurmConfigured();
    }

    return allowedUsers.includes(username);
}

function isSlurmConfigured() {
    const config = global.configFile || {};

    return typeof config.slurm_bin_path === "string" && config.slurm_bin_path.trim().length > 0;
}

// Admin-curated list of partitions users may submit to. Empty = the cluster
// has no partition concept worth exposing, so the frontend skips the
// selector entirely and no `--partition` flag is sent.
function getSlurmPartitions() {
    const config = global.configFile || {};

    return Array.isArray(config.slurm_partitions) ? config.slurm_partitions : [];
}

// A partition is valid only if it's on the configured list. When no
// partitions are configured there's nothing to validate against, so any
// caller asking for a partition in that state should be rejected upstream
// rather than silently accepted. This is a generic "is this a real
// partition" check - it does not consider per-user grants. It's what the
// admin form handler (routes/admin/updatePartitionAccess.js) uses to reject
// garbage partition names, since granting access is exactly how a partition
// is supposed to go from "not allowed" to "allowed" for a user.
function isValidSlurmPartition(partition) {
    return getSlurmPartitions().includes(partition);
}

// Partitions a specific user may submit to: the admin-curated
// slurm_partitions list narrowed down to whatever's been explicitly granted
// to them in PartitionAccess. A grant for a partition that's since been
// removed from slurm_partitions doesn't resurrect it here - the config list
// is still the outer bound.
async function getPartitionsForUser(username) {
    const configuredPartitions = getSlurmPartitions();

    if (!username || configuredPartitions.length === 0) {
        return [];
    }

    let result;
    try {
        result = await queries.managed.listPartitionsForUser(username);
    } catch (err) {
        return [];
    }

    const grantedPartitions = ((result && result.rows) || []).map(
        (row) => row.Partition,
    );

    return configuredPartitions.filter((partition) =>
        grantedPartitions.includes(partition),
    );
}

module.exports = {
    hasSlurmAccess,
    isSlurmConfigured,
    getSlurmPartitions,
    isValidSlurmPartition,
    getPartitionsForUser,
};
