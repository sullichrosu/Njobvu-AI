const path = require("path");
const { execFile } = require("child_process");

// Bridges the gap between the Njobvu server's disk and the Slurm
// submission host's disk when they're two separate machines with no shared
// filesystem (homelab-over-Tailscale today; possibly a production cluster
// with its own storage tomorrow). Rather than rewriting every absolute path
// the training/inference builders already generate, `slurm_staging.remote_root`
// is expected to mirror `global.currentPath` on the submission host - keep
// the two app roots at the *same absolute path* on both sides, and every
// path baked into a generated command, logFile, errFile, or the sbatch
// script itself just resolves correctly without any rewriting. `rsync` only
// transfers deltas, so re-running this on every submission is cheap once
// the remote side is warm.
function isStagingEnabled() {
    const staging = global.configFile && global.configFile.slurm_staging;

    return !!(staging && staging.enabled && staging.ssh_destination && staging.remote_root);
}

function runRsync(subpath, direction) {
    const staging = global.configFile.slurm_staging;
    const local = path.join(global.currentPath, subpath) + "/";
    const remote = `${staging.ssh_destination}:${path.join(staging.remote_root, subpath)}/`;
    const [src, dest] = direction === "push" ? [local, remote] : [remote, local];
    const sshCommand = `ssh -i ${staging.ssh_key} -o StrictHostKeyChecking=accept-new`;

    return new Promise((resolve, reject) => {
        execFile("rsync", ["-az", "-e", sshCommand, src, dest], (err, stdout, stderr) => {
            if (err) {
                return reject(new Error((stderr && stderr.trim()) || err.message));
            }

            resolve();
        });
    });
}

// Push project data (images, labels, weights, and the freshly-written
// slurm_submit.sh/logs dir) to the submission host before sbatch is called.
function stageProjectsToRemote() {
    return runRsync("public/projects", "push");
}

// Pull results (trained weights, run logs) back once a job reaches a
// terminal state, so the local app/UI can read them same as a local run.
function fetchProjectsFromRemote() {
    return runRsync("public/projects", "pull");
}

module.exports = { isStagingEnabled, stageProjectsToRemote, fetchProjectsFromRemote };
