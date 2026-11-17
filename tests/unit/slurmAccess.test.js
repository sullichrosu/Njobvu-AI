jest.mock('../../queries/queries', () => ({
    managed: {
        listPartitionsForUser: jest.fn(),
    },
}));

const queries = require('../../queries/queries');
const {
    hasSlurmAccess,
    isSlurmConfigured,
    getSlurmPartitions,
    isValidSlurmPartition,
    getPartitionsForUser,
} = require('../../utils/slurmAccess');

describe('utils/slurmAccess', () => {
    afterEach(() => {
        global.configFile = undefined;
        jest.clearAllMocks();
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

    describe('getPartitionsForUser', () => {
        it('returns an empty array without hitting the DB when no partitions are configured', async () => {
            global.configFile = { slurm_partitions: [] };

            expect(await getPartitionsForUser('alice')).toEqual([]);
            expect(queries.managed.listPartitionsForUser).not.toHaveBeenCalled();
        });

        it('returns an empty array for a missing username', async () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };

            expect(await getPartitionsForUser(undefined)).toEqual([]);
            expect(queries.managed.listPartitionsForUser).not.toHaveBeenCalled();
        });

        it('narrows the configured list down to this user\'s PartitionAccess grants', async () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu', 'debug'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({
                rows: [{ Partition: 'cpu' }, { Partition: 'debug' }],
            });

            expect(await getPartitionsForUser('alice')).toEqual(['cpu', 'debug']);
            expect(queries.managed.listPartitionsForUser).toHaveBeenCalledWith('alice');
        });

        it('drops a grant for a partition that has since been removed from the configured list', async () => {
            global.configFile = { slurm_partitions: ['gpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({
                rows: [{ Partition: 'gpu' }, { Partition: 'retired-partition' }],
            });

            expect(await getPartitionsForUser('alice')).toEqual(['gpu']);
        });

        it('returns an empty array when the user has no grants at all', async () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockResolvedValue({ rows: [] });

            expect(await getPartitionsForUser('alice')).toEqual([]);
        });

        it('fails safe to an empty array when the DB lookup errors', async () => {
            global.configFile = { slurm_partitions: ['gpu', 'cpu'] };
            queries.managed.listPartitionsForUser.mockRejectedValue(new Error('db unavailable'));

            expect(await getPartitionsForUser('alice')).toEqual([]);
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
