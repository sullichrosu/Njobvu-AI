// Set up global sqlite3 mock before requiring app
jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('node-fetch', () => jest.fn());

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('sqlite3', () => {
  const mockDb = {
    run: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null);
      return { lastID: 1, changes: 1 };
    }),
    get: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null, {});
    }),
    all: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null, []);
    }),
    close: jest.fn((cb) => cb && cb()),
  };

  const mockModule = {
    OPEN_CREATE: 1,
    OPEN_READWRITE: 2,
    OPEN_READONLY: 1,
    Database: jest.fn((...args) => {
      const cb = args[1];
      if (typeof cb === 'function') cb(null);
      return mockDb;
    }),
    verbose: jest.fn().mockImplementation(() => mockModule),
  };

  return mockModule;
});

jest.mock('socket.io-client', () => ({
  protocol: 'http',
}));

global.sqlite3 = require('sqlite3');

const request = require('supertest');
const app = require('../../app');

jest.mock('../../queries/queries', () => ({
  managed: {},
  project: {},
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  rename: jest.fn((oldPath, newPath, callback) => callback(null)),
  readFileSync: jest.fn().mockReturnValue(''),
  copyFileSync: jest.fn(),
  stat: jest.fn((path, callback) => callback(null, { isDirectory: () => false, size: 0, ino: 0, mtime: new Date(), ctime: new Date() })),
  statSync: jest.fn().mockReturnValue({ isDirectory: () => false, size: 0, ino: 0, mtime: new Date(), ctime: new Date() }),
  createReadStream: jest.fn().mockImplementation(() => {
    const { Readable } = require('stream');
    return new Readable({
      read() {
        this.push(null);
      }
    });
  }),
  ReadStream: class {},
}));

jest.mock('express-fileupload', () => jest.fn(() => (req, res, next) => {
  req.files = {};
  next();
}));

jest.mock('node-stream-zip', () => {
  const mockAsync = jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    on: jest.fn(),
  }));
  const mockZip = jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    on: jest.fn(),
  }));
  mockZip.async = mockAsync;
  return mockZip;
});

jest.mock('../../public/libraries/rimraf', () => jest.fn((path, callback) => callback(null)));

jest.mock('../../queries/client', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../utils/unzipFile', () => jest.fn());
jest.mock('../../utils/pythonScript', () => jest.fn());

describe('MegaDetector inference routes', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
      ]),
      getAsync: jest.fn().mockResolvedValue({
        Admin: 'testuser',
        PDescription: 'Test project description',
        AutoSave: 1,
      }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.readdirAsync = jest.fn().mockResolvedValue([]);
    global.fs = require('fs');
    global.path = require('path');
    global.util = require('util');
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.configFile = {};
  });

  describe('POST /megadetector-inf', () => {
    it('runs a prebuilt model when it is configured in config.json', async () => {
      global.configFile = {
        megadetector_models: { MDv5a: '/opt/models/md_v5a.0.0.pt' },
      };

      const childProcess = require('child_process');
      let capturedCmd = '';
      childProcess.exec.mockImplementation((cmd, callback) => {
        capturedCmd = cmd;
        if (typeof callback === 'function') callback(null, '', '');
        return { on: jest.fn() };
      });

      const res = await request(app)
        .post('/megadetector-inf')
        .send({
          PName: 'test-project',
          Admin: 'testuser',
          yolovx_path: '/usr/local/bin/yolo',
          model_source: 'prebuilt',
          prebuilt_model: 'MDv5a',
          inference_file: '/test/path/uploads/img.jpg',
          mode: 'predict',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(res.body.Success).toBe('MegaDetector Inference Started');
      expect(capturedCmd).toContain('/opt/models/md_v5a.0.0.pt');
      expect(capturedCmd).toContain('megadetector.py');

      const fs = require('fs');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('type.txt'),
        'megadetector',
      );
    });

    it('rejects a prebuilt model that has not been configured', async () => {
      global.configFile = { megadetector_models: {} };

      const res = await request(app)
        .post('/megadetector-inf')
        .send({
          PName: 'test-project',
          Admin: 'testuser',
          yolovx_path: '/usr/local/bin/yolo',
          model_source: 'prebuilt',
          prebuilt_model: 'MDv6-unknown',
          inference_file: '/test/path/uploads/img.jpg',
          mode: 'predict',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(400);
      expect(res.text).toContain('MDv6-unknown');
    });

    it('runs a custom fine-tuned model from the project weights folder', async () => {
      global.configFile = {};

      const childProcess = require('child_process');
      let capturedCmd = '';
      childProcess.exec.mockImplementation((cmd, callback) => {
        capturedCmd = cmd;
        if (typeof callback === 'function') callback(null, '', '');
        return { on: jest.fn() };
      });

      const res = await request(app)
        .post('/megadetector-inf')
        .send({
          PName: 'test-project',
          Admin: 'testuser',
          yolovx_path: '/usr/local/bin/yolo',
          model_source: 'custom',
          weights: 'my_finetuned_md.pt',
          inference_file: '/test/path/uploads/img.jpg',
          mode: 'track',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(capturedCmd).toContain('training/weights/my_finetuned_md.pt');
      expect(capturedCmd).toContain('-m track');
    });
  });

  describe('GET /megadetector/settings', () => {
    it('renders the MegaDetector settings page for an authenticated user', async () => {
      global.configFile = {
        default_yolo_path: '/usr/local/bin/yolo',
        megadetector_models: { MDv5a: '/opt/models/md_v5a.0.0.pt' },
      };

      const res = await request(app)
        .get('/megadetector/settings')
        .query({ IDX: 0 })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
    });
  });
});
