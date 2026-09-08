const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

const { submitSbatchJob, getSlurmJobRuntimeStatus } = require('../../utils/slurmSubmit');

describe('utils/slurmSubmit', () => {
    let runPath;

    beforeEach(() => {
        jest.clearAllMocks();
        runPath = fs.mkdtempSync(path.join(os.tmpdir(), 'slurm-submit-test-'));
        global.configFile = { slurm_bin_path: '/opt/slurm/bin' };
    });

    afterEach(() => {
        fs.rmSync(runPath, { recursive: true, force: true });
        global.configFile = undefined;
    });

    describe('submitSbatchJob', () => {
        it('rejects when Slurm is not configured', async () => {
            global.configFile = { slurm_bin_path: '' };

            await expect(submitSbatchJob({
                jobName: 'job', command: 'echo hi', runPath, logFile: `${runPath}/log`, errFile: `${runPath}/err`,
            })).rejects.toThrow(/not configured/);

            expect(execFile).not.toHaveBeenCalled();
        });

        it('writes an sbatch script and parses the returned job id', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, 'Submitted batch job 4242\n', ''));

            const result = await submitSbatchJob({
                jobName: 'my_job', command: 'python3 train.py', runPath, logFile: `${runPath}/log`, errFile: `${runPath}/err`,
            });

            expect(result.slurmJobId).toBe('4242');
            expect(execFile).toHaveBeenCalledWith(
                path.join('/opt/slurm/bin', 'sbatch'),
                [path.join(runPath, 'slurm_submit.sh')],
                expect.any(Function),
            );

            const scriptContent = fs.readFileSync(path.join(runPath, 'slurm_submit.sh'), 'utf8');
            expect(scriptContent).toContain('#SBATCH --job-name=my_job');
            expect(scriptContent).toContain('python3 train.py');
        });

        it('rejects when sbatch exits with an error', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(new Error('boom'), '', 'sbatch: error: bad partition'));

            await expect(submitSbatchJob({
                jobName: 'job', command: 'echo hi', runPath, logFile: `${runPath}/log`, errFile: `${runPath}/err`,
            })).rejects.toThrow('sbatch: error: bad partition');
        });

        it('rejects when sbatch output cannot be parsed for a job id', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, 'something unexpected', ''));

            await expect(submitSbatchJob({
                jobName: 'job', command: 'echo hi', runPath, logFile: `${runPath}/log`, errFile: `${runPath}/err`,
            })).rejects.toThrow(/Could not parse Slurm job id/);
        });
    });

    describe('getSlurmJobRuntimeStatus', () => {
        it('resolves null when Slurm is not configured', async () => {
            global.configFile = { slurm_bin_path: '' };

            const status = await getSlurmJobRuntimeStatus('123');

            expect(status).toBeNull();
            expect(execFile).not.toHaveBeenCalled();
        });

        it('returns the squeue status when the job is still queued/running', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, 'RUNNING\n'));

            const status = await getSlurmJobRuntimeStatus('123');

            expect(status).toBe('RUNNING');
            expect(execFile).toHaveBeenCalledTimes(1);
        });

        it('falls back to sacct once the job has left the queue', async () => {
            execFile
                .mockImplementationOnce((bin, args, cb) => cb(new Error('not found'), ''))
                .mockImplementationOnce((bin, args, cb) => cb(null, 'COMPLETED\n'));

            const status = await getSlurmJobRuntimeStatus('123');

            expect(status).toBe('COMPLETED');
            expect(execFile).toHaveBeenCalledTimes(2);
        });

        it('resolves null when neither squeue nor sacct know about the job', async () => {
            execFile
                .mockImplementationOnce((bin, args, cb) => cb(new Error('not found'), ''))
                .mockImplementationOnce((bin, args, cb) => cb(new Error('not found'), ''));

            const status = await getSlurmJobRuntimeStatus('123');

            expect(status).toBeNull();
        });
    });
});
