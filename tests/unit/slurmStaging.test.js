const path = require('path');
const { execFile } = require('child_process');

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

const slurmStaging = require('../../utils/slurmStaging');

describe('utils/slurmStaging', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.currentPath = '/home/fc/code/njobvu-ai/';
    });

    afterEach(() => {
        global.configFile = undefined;
        global.currentPath = undefined;
    });

    describe('isStagingEnabled', () => {
        it('is false when slurm_staging is missing', () => {
            global.configFile = {};
            expect(slurmStaging.isStagingEnabled()).toBe(false);
        });

        it('is false when enabled is false', () => {
            global.configFile = { slurm_staging: { enabled: false, ssh_destination: 'fc@host', remote_root: '/home/fc/code/njobvu-ai' } };
            expect(slurmStaging.isStagingEnabled()).toBe(false);
        });

        it('is false when ssh_destination or remote_root is missing', () => {
            global.configFile = { slurm_staging: { enabled: true, ssh_destination: '', remote_root: '/home/fc/code/njobvu-ai' } };
            expect(slurmStaging.isStagingEnabled()).toBe(false);
        });

        it('is true when enabled with a destination and remote root', () => {
            global.configFile = { slurm_staging: { enabled: true, ssh_destination: 'fc@host', remote_root: '/home/fc/code/njobvu-ai' } };
            expect(slurmStaging.isStagingEnabled()).toBe(true);
        });
    });

    describe('stageProjectsToRemote / fetchProjectsFromRemote', () => {
        beforeEach(() => {
            global.configFile = {
                slurm_staging: {
                    enabled: true,
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
                    path.join('/home/fc/code/njobvu-ai/', 'public/projects') + '/',
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
                    path.join('/home/fc/code/njobvu-ai/', 'public/projects') + '/',
                ],
                expect.any(Function),
            );
        });

        it('rejects with rsync stderr on failure', async () => {
            execFile.mockImplementation((bin, args, cb) => cb(new Error('boom'), '', 'rsync: connection unexpectedly closed'));

            await expect(slurmStaging.stageProjectsToRemote()).rejects.toThrow('rsync: connection unexpectedly closed');
        });
    });
});
