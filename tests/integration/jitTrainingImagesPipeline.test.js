jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('probe-image-size', () => ({
  sync: jest.fn().mockReturnValue({ width: 640, height: 480 }),
}));

jest.mock('child_process', () => ({
  exec: jest.fn((cmd, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (typeof callback === 'function') {
      process.nextTick(() => callback(null, 'OK', ''));
    }
  }),
}));

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const queries = require('../../queries/queries');
const s3Client = require('../../utils/s3Client');

jest.mock('../../queries/queries', () => ({
  managed: {
    getBucket: jest.fn(),
  },
  project: {
    getAllImages: jest.fn(),
    getAllClasses: jest.fn(),
    getLabelsForImageName: jest.fn(),
    getAllLabels: jest.fn(),
  },
}));

jest.mock('../../utils/s3Client', () => ({
  buildS3Client: jest.fn(() => ({ fakeS3Client: true })),
  downloadObjectToFile: jest.fn(),
}));

const app = require('../../app');

describe('JIT Training Images Pipeline Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'chdir').mockImplementation(() => {});

    queries.project.getAllImages.mockResolvedValue({
      rows: [
        { IName: 'local_img.jpg', Source: null, SourceKey: null },
        { IName: 'stream_img.jpg', Source: 's3', SourceKey: 's3/stream_img.jpg' },
      ],
    });

    queries.project.getAllClasses.mockResolvedValue({
      rows: [{ CName: 'car' }],
    });

    queries.project.getLabelsForImageName.mockResolvedValue({
      rows: [{ LID: 1, CName: 'car', X: 10, Y: 20, W: 30, H: 40 }],
    });

    queries.project.getAllLabels.mockResolvedValue({
      rows: [{ IName: 'stream_img.jpg', CName: 'car', X: 10, Y: 20, W: 30, H: 40 }],
    });

    queries.managed.getBucket.mockResolvedValue({
      row: {
        BucketName: 'test-bucket',
        Region: 'us-east-1',
        AccessKeyId: 'key',
        SecretAccessKey: 'secret',
      },
    });

    s3Client.downloadObjectToFile.mockResolvedValue();
  });

  test('POST /yolo-run triggers JIT download for missing streamed S3 images and unlinks them post-run', async () => {
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('stream_img.jpg')) {
        return false;
      }
      return true;
    });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'copyFile').mockImplementation((src, dest, cb) => { if (cb) cb(null); });
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image data'));
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'appendFile').mockImplementation((p, data, cb) => { if (cb) cb(null); });
    jest.spyOn(fs, 'writeFile').mockImplementation((p, data, cb) => { if (cb) cb(null); });
    jest.spyOn(fs.promises, 'symlink').mockResolvedValue();

    const response = await request(app)
      .post('/yolo-run')
      .set('Cookie', ['Username=testuser'])
      .send({
        PName: 'testproj',
        Admin: 'testuser',
        yolo_task: 'detect',
        selected_classes: JSON.stringify(['car']),
        TrainingPercent: 70,
        weights: 'best.pt',
        yolovx_path: '/usr/local/bin/yolo',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Success: 'YOLO Training Started' });

    // Verify JIT fetch downloaded the missing streamed image
    expect(s3Client.downloadObjectToFile).toHaveBeenCalledWith(
      { fakeS3Client: true },
      'test-bucket',
      's3/stream_img.jpg',
      expect.stringContaining('stream_img.jpg'),
    );

    // Wait for async background cleanup in exec callback
    await new Promise((r) => setTimeout(r, 50));

    // Verify cleanup unlinked the JIT-downloaded image when training completed
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('stream_img.jpg'));
    // Ensure local_img.jpg was not unlinked
    expect(unlinkSpy).not.toHaveBeenCalledWith(expect.stringContaining('local_img.jpg'));
  });

  test('POST /run triggers JIT download for missing streamed S3 images and unlinks them post-run', async () => {
    const unlinkSpy = jest.spyOn(fs.promises, 'unlink').mockResolvedValue();

    jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('stream_img.jpg')) {
        return false;
      }
      return true;
    });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFile').mockImplementation((p, data, cb) => { if (cb) cb(null); });

    const response = await request(app)
      .post('/run')
      .set('Cookie', ['Username=testuser'])
      .send({
        PName: 'testproj',
        Admin: 'testuser',
        script: 'train.py',
        python_path: '/usr/bin/python3',
        TrainingPercent: 70,
        weights: 'weights.h5',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Success: 'Training Started' });

    // Verify JIT fetch downloaded missing streamed S3 image
    expect(s3Client.downloadObjectToFile).toHaveBeenCalledWith(
      { fakeS3Client: true },
      'test-bucket',
      's3/stream_img.jpg',
      expect.stringContaining('stream_img.jpg'),
    );

    // Wait for async background cleanup in exec callback
    await new Promise((r) => setTimeout(r, 50));

    // Verify cleanup unlinked JIT downloaded image
    expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('stream_img.jpg'));
  });
});
