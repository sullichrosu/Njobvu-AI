const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// Bridges the gap between the Njobvu server's disk and the Slurm
// submission host's disk when they're two separate machines. Three modes,
// set via `slurm_staging.mode` in config.json:
//
//   "none"   - no shared storage assumed. Every absolute path baked into a
//              generated command/logFile/errFile has to already resolve
//              identically wherever the job actually runs - nothing here
//              helps or checks that.
//   "shared" - a real shared mount already exists between the workstation
//              and the cluster (e.g. NFS). There's nothing to copy - a
//              write on one side is immediately visible on the other,
//              because it's the same file. All this mode does is verify
//              that assumption before every submission, so a
//              misconfigured mount fails with a clear error up front
//              instead of a cryptic "file not found" deep inside a job.
//   "rsync"  - no shared mount (the homelab-over-Tailscale case). Fake one
//              by mirroring public/projects to `slurm_staging.remote_root`
//              before every submission, and pulling it back once a job
//              reaches a terminal state. `rsync` only transfers deltas, so
//              re-running this every time is cheap once the remote side is
//              warm.
//
// In both "shared" and "rsync" modes, `remote_root` is expected to mirror
// `global.currentPath` on the submission host - keeping the two app roots
// at the same absolute path means every path the training/inference
// builders generate just resolves correctly on both ends with zero
// rewriting.
function getStagingMode() {
    const staging = global.configFile && global.configFile.slurm_staging;

    if (!staging || !staging.ssh_destination || !staging.remote_root) {
        return "none";
    }

    return staging.mode === "shared" || staging.mode === "rsync" ? staging.mode : "none";
}

function sshCommand() {
    const staging = global.configFile.slurm_staging;

    return `ssh -i ${staging.ssh_key} -o StrictHostKeyChecking=accept-new`;
}

function runRsync(subpath, direction) {
    const staging = global.configFile.slurm_staging;
    const local = path.join(global.currentPath, subpath) + "/";
    const remote = `${staging.ssh_destination}:${path.join(staging.remote_root, subpath)}/`;
    const [src, dest] = direction === "push" ? [local, remote] : [remote, local];

    return new Promise((resolve, reject) => {
        execFile("rsync", ["-az", "-e", sshCommand(), src, dest], (err, stdout, stderr) => {
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

// Writes a small sentinel file into public/projects locally, then SSHes
// into the submission host and reads it back from the equivalent path
// under remote_root. If the mount is real, the submission host sees the
// exact byte this process just wrote - no copying involved. Cleans up with
// a single local unlink: on a true shared mount, that's the same inode on
// both ends, so there's nothing left to clean up remotely.
function verifySharedMount() {
    const staging = global.configFile.slurm_staging;
    const subpath = path.join("public/projects", `.slurm_staging_check_${process.pid}_${Date.now()}`);
    const localPath = path.join(global.currentPath, subpath);
    const remotePath = path.join(staging.remote_root, subpath);
    const token = `ok-${Date.now()}`;

    fs.writeFileSync(localPath, token);

    return new Promise((resolve, reject) => {
        execFile("ssh", ["-i", staging.ssh_key, "-o", "StrictHostKeyChecking=accept-new", staging.ssh_destination, "cat", remotePath], (err, stdout) => {
            let cleanupErr = null;

            try {
                fs.unlinkSync(localPath);
            } catch (unlinkErr) {
                cleanupErr = unlinkErr;
            }

            if (err || (stdout || "").trim() !== token) {
                return reject(new Error(
                    `Shared mount check failed - ${remotePath} is not visible from ${staging.ssh_destination}. `
                    + "Is slurm_staging.remote_root actually mounted there?",
                ));
            }

            if (cleanupErr) {
                return reject(cleanupErr);
            }

            resolve();
        });
    });
}

// Call before every sbatch submission. Mode-dispatches to the right
// pre-flight behavior; a no-op in "none" mode.
async function beforeSubmit() {
    const mode = getStagingMode();

    if (mode === "rsync") {
        await stageProjectsToRemote();
    } else if (mode === "shared") {
        await verifySharedMount();
    }
}

// Call once a job's status has just transitioned into a terminal state.
// Only "rsync" mode needs to do anything here - "shared" mode's results
// were never anywhere else to begin with.
async function afterTerminal() {
    if (getStagingMode() === "rsync") {
        await fetchProjectsFromRemote();
    }
}

module.exports = {
    getStagingMode,
    stageProjectsToRemote,
    fetchProjectsFromRemote,
    verifySharedMount,
    beforeSubmit,
    afterTerminal,
};
