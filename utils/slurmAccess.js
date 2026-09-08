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

module.exports = { hasSlurmAccess, isSlurmConfigured };
