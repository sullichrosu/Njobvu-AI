const {
    hasSlurmAccess,
    isSlurmConfigured,
    getSlurmPartitions,
    isValidSlurmPartition,
} = require('../../utils/slurmAccess');

describe('utils/slurmAccess', () => {
    afterEach(() => {
        global.configFile = undefined;
    });

    describe('getSlurmPartitions', () => {
        it('returns an empty array when unset', () => {
            global.configFile = {};

            expect(getSlurmPartitions()).toEqual([]);
        });

        it('returns the configured list', () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };

            expect(getSlurmPartitions()).toEqual(['gpu', 'cpu']);
        });

        it('ignores a non-array value rather than throwing', () => {
            global.configFile = { slurm_partitions: 'gpu' };

            expect(getSlurmPartitions()).toEqual([]);
        });
    });

    describe('isValidSlurmPartition', () => {
        it('accepts a partition on the configured list', () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };

            expect(isValidSlurmPartition('gpu')).toBe(true);
        });

        it('rejects a partition not on the configured list', () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };

            expect(isValidSlurmPartition('quantum')).toBe(false);
        });

        it('rejects any partition when none are configured', () => {
            global.configFile = { slurm_partitions: [] };

            expect(isValidSlurmPartition('gpu')).toBe(false);
        });
    });

    describe('hasSlurmAccess / isSlurmConfigured (existing behavior, unchanged)', () => {
        it('is unconfigured with no slurm_bin_path', () => {
            global.configFile = { slurm_bin_path: '' };

            expect(isSlurmConfigured()).toBe(false);
        });

        it('is configured with a non-empty slurm_bin_path', () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin' };

            expect(isSlurmConfigured()).toBe(true);
        });

        it('allows any user when configured and the allowlist is empty', () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: [] };

            expect(hasSlurmAccess('anyone')).toBe(true);
        });

        it('restricts to the allowlist when non-empty', () => {
            global.configFile = { slurm_bin_path: '/opt/slurm/bin', slurm_allowed_users: ['alice'] };

            expect(hasSlurmAccess('alice')).toBe(true);
            expect(hasSlurmAccess('bob')).toBe(false);
        });
    });
});
