jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('child_process', () => ({
  exec: jest.fn((cmd, opts, cb) => {
    if (typeof opts === 'function') cb = opts;
    if (typeof cb === 'function') cb(null, 'OK', '');
  }),
}));
jest.mock('probe-image-size', () => ({
  sync: jest.fn().mockReturnValue({ width: 640, height: 480 }),
}));

const request = require('supertest');
const fs = require('fs');
const path = require('path');

const queries = require('../../queries/queries');
jest.mock('../../queries/queries', () => ({
  project: {
    getAllImages: jest.fn(),
    getAllClasses: jest.fn(),
    getLabelsForImageName: jest.fn(),
  },
}));

const app = require('../../app');

describe('YOLO Run API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    queries.project.getAllImages.mockResolvedValue({
      rows: [
        { IName: 'img1.jpg' },
        { IName: 'img2.jpg' },
        { IName: 'img3.jpg' },
        { IName: 'img4.jpg' },
        { IName: 'img5.jpg' },
        { IName: 'img6.jpg' },
        { IName: 'img7.jpg' },
        { IName: 'img8.jpg' },
        { IName: 'img9.jpg' },
        { IName: 'img10.jpg' },
      ],
    });

    queries.project.getAllClasses.mockResolvedValue({
      rows: [
        { CName: 'person' },
        { CName: 'car' },
        { CName: 'dog' },
      ],
    });

    queries.project.getLabelsForImageName.mockResolvedValue({
      rows: [
        { LID: 1, CName: 'person', X: 10, Y: 20, W: 30, H: 40 },
        { LID: 2, CName: 'car', X: 50, Y: 60, W: 70, H: 80 },
      ],
    });
  });

  test('POST /yolo-run accepts class subset selection, max image clamping, and train:val:test split ratios', async () => {
    jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image content'));
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'appendFile').mockImplementation((p, data, cb) => { if (cb) cb(null); });
    jest.spyOn(fs, 'writeFile').mockImplementation((p, data, cb) => { if (cb) cb(null); });
    jest.spyOn(fs, 'copyFile').mockImplementation((src, dest, cb) => { if (cb) cb(null); });
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'symlink').mockResolvedValue();

    const response = await request(app)
      .post('/yolo-run')
      .set('Cookie', ['Username=testuser'])
      .send({
        PName: 'testproj',
        Admin: 'testuser',
        yolo_task: 'detect',
        selected_classes: JSON.stringify(['car']),
        max_images: 4,
        TrainingPercent: 50,
        ValPercent: 25,
        TestPercent: 25,
        weights: 'best.pt',
        yolovx_path: '/usr/local/bin/yolo',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ Success: 'YOLO Training Started' });
  });
});
