const fs = require('fs');
const path = require('path');
const queries = require('../../queries/queries');
const s3Client = require('../../utils/s3Client');
const {
    ensureTrainingImagesLocal,
    cleanupJitTrainingImages,
} = require('../../utils/jitTrainingImages');

jest.mock('../../queries/queries', () => ({
    managed: {
        getBucket: jest.fn(),
    },
    project: {
        getAllImages: jest.fn(),
    },
}));

jest.mock('../../utils/s3Client', () => ({
    buildS3Client: jest.fn(() => ({ fakeS3Client: true })),
    downloadObjectToFile: jest.fn(),
}));

describe('utils/jitTrainingImages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn() };
    });

    describe('ensureTrainingImagesLocal', () => {
        it('returns empty array when targetImages is empty or undefined', async () => {
            const downloaded = await ensureTrainingImagesLocal('proj', 'user', '/path/to/proj', []);
            expect(downloaded).toEqual([]);
            expect(s3Client.downloadObjectToFile).not.toHaveBeenCalled();
        });

        it('skips images that already exist locally on disk', async () => {
            const projectPath = '/projects/user-proj';
            const targetImages = [
                { IName: 'local1.jpg', Source: 's3', SourceKey: 'keys/local1.jpg' },
            ];

            jest.spyOn(fs, 'existsSync').mockReturnValue(true);

            const downloaded = await ensureTrainingImagesLocal('proj', 'user', projectPath, targetImages);

            expect(downloaded).toEqual([]);
            expect(s3Client.downloadObjectToFile).not.toHaveBeenCalled();
        });

        it('downloads missing S3-backed images JIT and returns their file paths', async () => {
            const projectPath = '/projects/user-proj';
            const targetImages = [
                { IName: 'stream1.jpg', Source: 's3', SourceKey: 'keys/stream1.jpg' },
                { IName: 'local1.jpg', Source: null, SourceKey: null },
            ];

            jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
                if (p.includes('stream1.jpg')) return false;
                return true;
            });
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: 'my-bucket',
                    Region: 'us-east-1',
                    AccessKeyId: 'AKIA...',
                    SecretAccessKey: 'secret',
                    Endpoint: '',
                },
            });
            s3Client.downloadObjectToFile.mockResolvedValueOnce();

            const downloaded = await ensureTrainingImagesLocal('proj', 'user', projectPath, targetImages);

            const expectedPath = path.join(projectPath, 'images', 'stream1.jpg');
            expect(downloaded).toEqual([expectedPath]);
            expect(s3Client.buildS3Client).toHaveBeenCalledWith({
                region: 'us-east-1',
                accessKeyId: 'AKIA...',
                secretAccessKey: 'secret',
                endpoint: '',
            });
            expect(s3Client.downloadObjectToFile).toHaveBeenCalledWith(
                { fakeS3Client: true },
                'my-bucket',
                'keys/stream1.jpg',
                expectedPath,
            );
        });

        it('throws an error if missing S3 images exist but no S3 bucket is attached', async () => {
            const projectPath = '/projects/user-proj';
            const targetImages = [
                { IName: 'stream1.jpg', Source: 's3', SourceKey: 'keys/stream1.jpg' },
            ];

            jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            queries.managed.getBucket.mockResolvedValueOnce({ row: null });

            await expect(
                ensureTrainingImagesLocal('proj', 'user', projectPath, targetImages),
            ).rejects.toThrow('S3 bucket configuration missing for project proj');
        });
    });

    describe('cleanupJitTrainingImages', () => {
        it('unlinks files present in the downloadedFiles array', async () => {
            const downloadedFiles = ['/path/to/stream1.jpg', '/path/to/stream2.jpg'];

            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

            await cleanupJitTrainingImages(downloadedFiles);

            expect(fs.promises.unlink).toHaveBeenCalledWith('/path/to/stream1.jpg');
            expect(fs.promises.unlink).toHaveBeenCalledWith('/path/to/stream2.jpg');
        });

        it('does nothing when downloadedFiles is empty', async () => {
            jest.spyOn(fs.promises, 'unlink').mockResolvedValue();
            await cleanupJitTrainingImages([]);
            expect(fs.promises.unlink).not.toHaveBeenCalled();
        });
    });
});
