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
// rather than silently accepted.
function isValidSlurmPartition(partition) {
    return getSlurmPartitions().includes(partition);
}

module.exports = { hasSlurmAccess, isSlurmConfigured, getSlurmPartitions, isValidSlurmPartition };
