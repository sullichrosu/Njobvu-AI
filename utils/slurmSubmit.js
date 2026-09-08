const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

// Submits a shell command to the HPC scheduler via `sbatch` instead of
// running it in-process with `exec`. Uses execFile (argv array, no shell)
// so job names / paths built from user-influenced project data can't be
// interpreted as shell metacharacters.
function submitSbatchJob({ jobName, command, runPath, logFile, errFile }) {
    return new Promise((resolve, reject) => {
        const slurmBinPath = (global.configFile && global.configFile.slurm_bin_path) || "";

        if (!slurmBinPath) {
            return reject(new Error("Slurm is not configured (slurm_bin_path is not set)"));
        }

        const scriptPath = path.join(runPath, "slurm_submit.sh");
        const scriptContent = [
            "#!/bin/bash",
            `#SBATCH --job-name=${jobName}`,
            `#SBATCH --output=${logFile}`,
            `#SBATCH --error=${errFile}`,
            "",
            command,
            "",
        ].join("\n");

        try {
            fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
        } catch (err) {
            return reject(err);
        }

        const sbatchBin = path.join(slurmBinPath, "sbatch");

        execFile(sbatchBin, [scriptPath], (err, stdout, stderr) => {
            if (err) {
                return reject(new Error((stderr && stderr.trim()) || err.message));
            }

            const match = /Submitted batch job (\d+)/.exec(stdout || "");
            if (!match) {
                return reject(new Error(`Could not parse Slurm job id from sbatch output: ${(stdout || "").trim()}`));
            }

            resolve({ slurmJobId: match[1], scriptPath, raw: stdout.trim() });
        });
    });
}

// Best-effort live status lookup for a previously submitted job: `squeue`
// covers pending/running jobs, `sacct` covers ones that already left the
// queue (completed/failed/cancelled). Returns null (never throws) when the
// scheduler can't be reached or the job id is unknown to it - callers should
// treat that as "no update available" and keep the last known DB status.
function getSlurmJobRuntimeStatus(slurmJobId) {
    return new Promise((resolve) => {
        const slurmBinPath = (global.configFile && global.configFile.slurm_bin_path) || "";

        if (!slurmBinPath) {
            return resolve(null);
        }

        const squeueBin = path.join(slurmBinPath, "squeue");

        execFile(squeueBin, ["-j", String(slurmJobId), "-h", "-o", "%T"], (err, stdout) => {
            const squeueStatus = !err && stdout && stdout.trim() ? stdout.trim().split("\n")[0] : null;

            if (squeueStatus) {
                return resolve(squeueStatus);
            }

            const sacctBin = path.join(slurmBinPath, "sacct");

            execFile(sacctBin, ["-j", String(slurmJobId), "-n", "-o", "State", "-X"], (sacctErr, sacctStdout) => {
                if (!sacctErr && sacctStdout && sacctStdout.trim()) {
                    return resolve(sacctStdout.trim().split("\n")[0].trim().split(" ")[0]);
                }

                resolve(null);
            });
        });
    });
}

module.exports = { submitSbatchJob, getSlurmJobRuntimeStatus };
