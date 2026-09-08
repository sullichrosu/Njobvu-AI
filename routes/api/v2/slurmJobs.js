const queries = require("../../../queries/queries");
const { hasSlurmAccess, isSlurmConfigured } = require("../../../utils/slurmAccess");

// GET /api/v2/slurm/access - lets the front end decide whether to offer an
// "HPC" launch option at all, and why not when it can't.
async function getSlurmAccess(req, res) {
    const username = req.cookies && req.cookies.Username;

    if (!username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    return res.status(200).json({
        success: true,
        configured: isSlurmConfigured(),
        allowed: hasSlurmAccess(username),
    });
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
        const job = result && result.row;

        if (!job || job.Username !== username) {
            return res.status(404).json({ success: false, error: "Job not found" });
        }

        return res.status(200).json({ success: true, job });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error fetching Slurm job status" });
    }
}

// POST /api/v2/slurm/training-jobs - submit a training run to the HPC via
// `sbatch` instead of the local `exec` path in routes/training/run.js.
//
// TODO(njobvu-cv-pipeline): build the sbatch script/wrapper invocation for
// controllers/training/train_data_from_project.py, submit it with
// `${configFile.slurm_bin_path}/sbatch`, capture the returned Slurm job id,
// and persist it with queries.managed.recordSlurmJob(...). Keep
// routes/training/run.js (local launch) working unchanged - this is an
// additive v2 endpoint, not a replacement.
async function submitTrainingJob(req, res) {
    return res.status(501).json({ success: false, error: "Not implemented" });
}

// POST /api/v2/slurm/inference-jobs - submit an inference run to the HPC.
//
// TODO(njobvu-cv-pipeline): mirror submitTrainingJob for the inference
// scripts under controllers/inference/ (see routes/inference/*.js for the
// existing local-exec equivalents), reusing the same SlurmJobs bookkeeping.
async function submitInferenceJob(req, res) {
    return res.status(501).json({ success: false, error: "Not implemented" });
}

module.exports = {
    getSlurmAccess,
    listSlurmJobs,
    getSlurmJobStatus,
    submitTrainingJob,
    submitInferenceJob,
};
