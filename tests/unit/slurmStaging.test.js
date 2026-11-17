const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

const slurmStaging = require('../../utils/slurmStaging');

describe('utils/slurmStaging', () => {
    let currentPath;

    beforeEach(() => {
        jest.clearAllMocks();
        currentPath = fs.mkdtempSync(path.join(os.tmpdir(), 'slurm-staging-test-'));
        fs.mkdirSync(path.join(currentPath, 'public/projects'), { recursive: true });
        global.currentPath = currentPath + '/';
    });

    afterEach(() => {
        fs.rmSync(currentPath, { recursive: true, force: true });
        global.configFile = undefined;
        global.currentPath = undefined;
    });

    describe('getStagingMode', () => {
        it('is "none" when slurm_staging is missing', () => {
            global.configFile = {};
            expect(slurmStaging.getStagingMode()).toBe('none');
        });

        it('is "none" when ssh_destination or remote_root is missing', () => {
            global.configFile = { slurm_staging: { mode: 'rsync', ssh_destination: '', remote_root: '/x' } };
            expect(slurmStaging.getStagingMode()).toBe('none');
        });

        it('is "none" for an unrecognized mode value', () => {
            global.configFile = { slurm_staging: { mode: 'nfs', ssh_destination: 'fc@host', remote_root: '/x' } };
            expect(slurmStaging.getStagingMode()).toBe('none');
        });

        it('is "rsync" when configured for rsync', () => {
            global.configFile = { slurm_staging: { mode: 'rsync', ssh_destination: 'fc@host', remote_root: '/x' } };
            expect(slurmStaging.getStagingMode()).toBe('rsync');
        });

        it('is "shared" when configured for a shared mount', () => {
            global.configFile = { slurm_staging: { mode: 'shared', ssh_destination: 'fc@host', remote_root: '/x' } };
            expect(slurmStaging.getStagingMode()).toBe('shared');
        });
    });

    describe('stageProjectsToRemote / fetchProjectsFromRemote', () => {
        beforeEach(() => {
            global.configFile = {
                slurm_staging: {
                    mode: 'rsync',
                    ssh_destination: 'fc@frrt-space-1',
                    ssh_key: '/home/svc/.ssh/njobvu_slurm',
                    remote_root: '/home/fc/code/njobvu-ai',
                },
            };
        });

        it('pushes local public/projects to the remote root', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, '', ''));

            await slurmStaging.stageProjectsToRemote();

            expect(execFile).toHaveBeenCalledWith(
                'rsync',
                [
                    '-az',
                    '-e',
                    'ssh -i /home/svc/.ssh/njobvu_slurm -o StrictHostKeyChecking=accept-new',
                    path.join(global.currentPath, 'public/projects') + '/',
                    'fc@frrt-space-1:/home/fc/code/njobvu-ai/public/projects/',
                ],
                expect.any(Function),
            );
        });

        it('pulls the remote root back to local public/projects', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, '', ''));

            await slurmStaging.fetchProjectsFromRemote();

            expect(execFile).toHaveBeenCalledWith(
                'rsync',
                [
                    '-az',
                    '-e',
                    'ssh -i /home/svc/.ssh/njobvu_slurm -o StrictHostKeyChecking=accept-new',
                    'fc@frrt-space-1:/home/fc/code/njobvu-ai/public/projects/',
                    path.join(global.currentPath, 'public/projects') + '/',
                ],
                expect.any(Function),
            );
        });

        it('rejects with rsync stderr on failure', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(new Error('boom'), '', 'rsync: connection unexpectedly closed'));

            await expect(slurmStaging.stageProjectsToRemote()).rejects.toThrow('rsync: connection unexpectedly closed');
        });
    });

    describe('verifySharedMount', () => {
        beforeEach(() => {
            global.configFile = {
                slurm_staging: {
                    mode: 'shared',
                    ssh_destination: 'fc@frrt-space-1',
                    ssh_key: '/home/svc/.ssh/njobvu_slurm',
                    remote_root: currentPath,
                },
            };
        });

        it('writes a local sentinel, reads it back over ssh, and cleans up', async () => {
            let sentinelPathSeenByCb;

            execFile.mockImplementation((bin, args, cb) => {
                expect(bin).toBe('ssh');
                expect(args[0]).toBe('-i');
                expect(args[1]).toBe('/home/svc/.ssh/njobvu_slurm');
                const remotePath = args[args.length - 1];
                sentinelPathSeenByCb = remotePath.replace(currentPath, global.currentPath);
                // Since remote_root === currentPath in this test, the
                // "remote" read is really just reading the same local file
                // a true shared mount would also expose at that path.
                cb(null, fs.readFileSync(sentinelPathSeenByCb, 'utf8'), '');
            });

            await slurmStaging.verifySharedMount();

            expect(fs.existsSync(sentinelPathSeenByCb)).toBe(false);
        });

        it('rejects when the remote side does not see the sentinel', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(null, 'not-the-token', ''));

            await expect(slurmStaging.verifySharedMount()).rejects.toThrow(/Shared mount check failed/);
        });

        it('rejects when the ssh call itself fails', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(new Error('ssh: connect to host fc@frrt-space-1 port 22: No route to host'), '', ''));

            await expect(slurmStaging.verifySharedMount()).rejects.toThrow(/Shared mount check failed/);
        });
    });

    describe('beforeSubmit / afterTerminal', () => {
        it('does nothing in "none" mode', async () => {
            global.configFile = {};

            await slurmStaging.beforeSubmit();
            await slurmStaging.afterTerminal();

            expect(execFile).not.toHaveBeenCalled();
        });

        it('pushes in "rsync" mode before submit, and pulls after a terminal status', async () => {
            global.configFile = {
                slurm_staging: { mode: 'rsync', ssh_destination: 'fc@host', ssh_key: '/k', remote_root: '/remote' },
            };
            execFile.mockImplementation((bin, args, cb) => cb(null, '', ''));

            await slurmStaging.beforeSubmit();
            expect(execFile).toHaveBeenCalledTimes(1);
            expect(execFile.mock.calls[0][1]).toContain(path.join(global.currentPath, 'public/projects') + '/');

            await slurmStaging.afterTerminal();
            expect(execFile).toHaveBeenCalledTimes(2);
            expect(execFile.mock.calls[1][1]).toContain('fc@host:/remote/public/projects/');
        });

        it('verifies in "shared" mode before submit, and does nothing after a terminal status', async () => {
            global.configFile = {
                slurm_staging: { mode: 'shared', ssh_destination: 'fc@host', ssh_key: '/k', remote_root: currentPath },
            };
            execFile.mockImplementation((bin, args, cb) => cb(null, fs.readFileSync(args[args.length - 1], 'utf8'), ''));

            await slurmStaging.beforeSubmit();
            expect(execFile).toHaveBeenCalledTimes(1);
            expect(execFile.mock.calls[0][0]).toBe('ssh');

            await slurmStaging.afterTerminal();
            expect(execFile).toHaveBeenCalledTimes(1);
        });
    });
});
