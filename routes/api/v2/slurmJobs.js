const queries = require("../../../queries/queries");
const { hasSlurmAccess, isSlurmConfigured, getSlurmPartitions, isValidSlurmPartition } = require("../../../utils/slurmAccess");
const { submitSbatchJob, getSlurmJobRuntimeStatus } = require("../../../utils/slurmSubmit");
const { prepareTrainingSubmission } = require("../../../utils/slurmTrainingJob");
const { prepareInferenceSubmission } = require("../../../utils/slurmInferenceJob");

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT", "NODE_FAIL", "OUT_OF_MEMORY"]);

// GET /api/v2/slurm/access - lets the front end decide whether to offer an
// "HPC" launch option at all, and why not when it can't. `partitions` drives
// a plain <select> on the client - an empty list means the cluster has no
// partition concept worth exposing, so the client skips the selector.
async function getSlurmAccess(req, res) {
    const username = req.cookies && req.cookies.Username;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    return res.status(200).json({
        success: true,
        configured: isSlurmConfigured(),
        allowed: hasSlurmAccess(username),
        partitions: getSlurmPartitions(),
    });
}

// Resolves and validates req.body.partition against the admin-curated
// slurm_partitions list. When the list is empty, partition selection isn't
// offered at all, so no partition is required or forwarded to sbatch. When
// it's non-empty, a partition is required and must be on the list - this is
// the server-side half of "foolproof": the frontend only ever offers a
// <select> built from this same list, but the backend can't trust that.
function resolvePartition(req) {
    const partitions = getSlurmPartitions();

    if (partitions.length === 0) {
        return undefined;
    }

    const partition = req.body.partition;

    if (!partition || !isValidSlurmPartition(partition)) {
        const err = new Error(`Invalid or missing Slurm partition - expected one of: ${partitions.join(", ")}`);
        err.statusCode = 400;
        throw err;
    }

    return partition;
}

// GET /api/v2/slurm/jobs - job history for the requesting user, across projects.
async function listSlurmJobs(req, res) {
    const username = req.cookies && req.cookies.Username;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    try {
        const result = await queries.managed.listSlurmJobsForUser(username);

        return res.status(200).json({ success: true, jobs: (result && result.rows) || [] });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error listing Slurm jobs" });
    }
}

// GET /api/v2/slurm/jobs/:slurmJobId - status of a single submitted job.
async function getSlurmJobStatus(req, res) {
    const username = req.cookies && req.cookies.Username;
    const { slurmJobId } = req.params;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    try {
        const result = await queries.managed.getSlurmJob(slurmJobId);
        let job = result && result.row;

        if (!job || job.Username !== username) {
            return res.status(404).json({ success: false, error: "Job not found" });
        }

        // Refresh from the scheduler while the job hasn't reached a terminal
        // state yet. Nothing else in this app updates SlurmJobs.Status once
        // sbatch has queued it, so a status read is also the point where we
        // reconcile it against squeue/sacct.
        if (isSlurmConfigured() && !TERMINAL_STATUSES.has(job.Status)) {
            const runtimeStatus = await getSlurmJobRuntimeStatus(slurmJobId);

            if (runtimeStatus && runtimeStatus !== job.Status) {
                const updatedAt = new Date().toISOString();
                await queries.managed.updateSlurmJobStatus(slurmJobId, runtimeStatus, updatedAt);
                job = { ...job, Status: runtimeStatus, UpdatedAt: updatedAt };
            }
        }

        return res.status(200).json({ success: true, job });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error fetching Slurm job status" });
    }
}

// POST /api/v2/slurm/training-jobs - submit a training run to the HPC via
// `sbatch` instead of the local `exec` path in routes/training/run.js.
// Additive: routes/training/run.js is untouched and keeps working exactly
// as before for users who don't opt into the HPC launch option.
async function submitTrainingJob(req, res) {
    const username = req.cookies && req.cookies.Username;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    if (!hasSlurmAccess(username)) {
        return res.status(403).json({ success: false, error: "Slurm access is not enabled for this user" });
    }

    if (!isSlurmConfigured()) {
        return res.status(400).json({ success: false, error: "Slurm is not configured on this server" });
    }

    let partition;
    try {
        partition = resolvePartition(req);
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }

    let submission;
    try {
        submission = await prepareTrainingSubmission(req);
    } catch (err) {
        global.logger.error("Error preparing Slurm training job:", err);
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }

    try {
        const { slurmJobId } = await submitSbatchJob({ ...submission, partition });

        await queries.managed.recordSlurmJob(
            slurmJobId,
            username,
            submission.PName,
            submission.Admin,
            "training",
            submission.runPath,
            new Date().toISOString(),
            partition,
        );

        return res.status(200).json({ success: true, slurmJobId, runPath: submission.runPath });
    } catch (err) {
        global.logger.error("Error submitting Slurm training job:", err);
        return res.status(500).json({ success: false, error: "Error submitting Slurm job: " + err.message });
    }
}

// POST /api/v2/slurm/inference-jobs - submit an inference run to the HPC.
// Mirrors routes/inference/*.js (selected via req.body.inference_type: one
// of "yolo" | "megadetector" | "inception") but launches via `sbatch`
// instead of `exec`. Additive: the local-exec inference routes are
// untouched.
async function submitInferenceJob(req, res) {
    const username = req.cookies && req.cookies.Username;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    if (!hasSlurmAccess(username)) {
        return res.status(403).json({ success: false, error: "Slurm access is not enabled for this user" });
    }

    if (!isSlurmConfigured()) {
        return res.status(400).json({ success: false, error: "Slurm is not configured on this server" });
    }

    let partition;
    try {
        partition = resolvePartition(req);
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }

    let submission;
    try {
        submission = await prepareInferenceSubmission(req);
    } catch (err) {
        global.logger.error("Error preparing Slurm inference job:", err);
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }

    try {
        const { slurmJobId } = await submitSbatchJob({ ...submission, partition });

        await queries.managed.recordSlurmJob(
            slurmJobId,
            username,
            submission.PName,
            submission.Admin,
            "inference",
            submission.runPath,
            new Date().toISOString(),
            partition,
        );

        return res.status(200).json({ success: true, slurmJobId, runPath: submission.runPath });
    } catch (err) {
        global.logger.error("Error submitting Slurm inference job:", err);
        return res.status(500).json({ success: false, error: "Error submitting Slurm job: " + err.message });
    }
}

module.exports = {
    getSlurmAccess,
    listSlurmJobs,
    getSlurmJobStatus,
    submitTrainingJob,
    submitInferenceJob,
};
