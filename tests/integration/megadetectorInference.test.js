// Set up global sqlite3 mock before requiring app
jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('node-fetch', () => jest.fn());

// Regression test for a real-world failure: an admin-configured relative,
// forward-slash venv path (as commonly written in config.json on Windows)
// must not be handed to child_process.exec() unresolved, since cmd.exe
// can't parse a leading "./" and fails with "'.' is not recognized...".
jest.mock('../../config.json', () => ({
  default_python_path: './.venv/Scripts/python',
}));

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
  });

  describe('POST /megadetector-inf', () => {
    it('resolves a relative, forward-slash default_python_path to an absolute path before exec (Windows cmd.exe regression)', async () => {
      const path = require('path');
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
          inference_file: '/test/path/uploads/img.jpg',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);

      // The raw, unresolved config value must never reach exec() directly.
      expect(capturedCmd).not.toContain('./.venv');

      const quotedPythonPath = capturedCmd.match(/^"([^"]+)"/)[1];
      expect(path.isAbsolute(quotedPythonPath)).toBe(true);
      expect(quotedPythonPath.replace(/\\/g, '/')).toContain('.venv/Scripts/python');
    });

    it('runs the default built-in model with default threshold/fps when none are given', async () => {
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
          inference_file: '/test/path/uploads/img.jpg',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(res.body.Success).toBe('MegaDetector Inference Started');
      expect(capturedCmd).toContain('megadetector.py');
      expect(capturedCmd).toContain('-i /test/path/uploads/img.jpg');
      expect(capturedCmd).toContain('-m MDV5A');
      expect(capturedCmd).toContain('-t 0.2');
      expect(capturedCmd).toContain('-f 1.0');
      // No YOLO CLI path / custom weights concepts should leak into the command.
      expect(capturedCmd).not.toContain('yolovx');
      expect(capturedCmd).not.toContain('weights');

      const fs = require('fs');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('type.txt'),
        'megadetector',
      );
    });

    it('passes through a user-selected built-in model, threshold, and fps', async () => {
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
          inference_file: '/test/path/uploads/trail_cam.mp4',
          model: 'MDv1000-redwood',
          threshold: '0.5',
          fps: '2.0',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(capturedCmd).toContain('-m MDv1000-redwood');
      expect(capturedCmd).toContain('-t 0.5');
      expect(capturedCmd).toContain('-f 2.0');
    });

    it('falls back to the project inference-uploads path when the given file is not an absolute existing path', async () => {
      const fs = require('fs');
      const originalExistsSync = fs.existsSync;
      fs.existsSync.mockImplementation((p) => {
        const normalized = typeof p === 'string' ? p.replace(/\\/g, '/') : p;
        if (typeof normalized === 'string' && normalized.endsWith('animal.jpg') && !normalized.includes('/inference/uploads/')) {
          return false;
        }
        return true;
      });

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
          inference_file: 'animal.jpg',
        })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(capturedCmd.replace(/\\/g, '/')).toContain('/inference/uploads/animal.jpg');

      fs.existsSync = originalExistsSync;
    });
  });

  describe('GET /megadetector/settings', () => {
    it('renders the MegaDetector settings page for an authenticated user', async () => {
      const res = await request(app)
        .get('/megadetector/settings')
        .query({ IDX: 0 })
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
    });
  });
});
