// Set up global sqlite3 mock before requiring app
jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));
jest.mock('sqlite3', () => {
  const mockSqlite3 = {
    OPEN_CREATE: 1,
    OPEN_READWRITE: 2,
    OPEN_READONLY: 1,
    Database: jest.fn((...args) => {
      const cb = args[1];
      if (typeof cb === 'function') cb(null);
      return {
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
    }),
  };
  mockSqlite3.verbose = jest.fn(() => mockSqlite3);
  return mockSqlite3;
});
jest.mock('socket.io-client', () => ({
  protocol: 'http',
}));

// Mock probe module
jest.mock('probe-image-size', () => ({
  sync: jest.fn(() => ({ width: 800, height: 600 })),
}));

global.sqlite3 = require('sqlite3');

const request = require('supertest');
const app = require('../../app');

// Mock queries
jest.mock('../../queries/queries', () => ({
  project: {
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'class1' }] }),
    getAllImages: jest.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock fs module - capture writeFileSync calls for assertions
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  symlinkSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// Mock file upload
jest.mock('express-fileupload', () => jest.fn(() => (req, res, next) => {
  next();
}));

// Mock Client
jest.mock('../../queries/client', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));

describe('POST /yolo-inf - run options log header', () => {
  beforeAll(() => {
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.fs = require('fs');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('prepends the user-chosen run options to the run log before the command', async () => {
    const fs = require('fs');

    const res = await request(app)
      .post('/yolo-inf')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        yolovx_path: '/opt/ultralytics',
        inference_file: '/test/path/public/projects/testuser-test-project/inference/uploads/img.jpg',
        device: 'cpu',
        options: '--conf 0.25',
        yolo_task: 'detect',
        weights: 'best.pt',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ Success: 'YOLO Inference Started' });

    // The route writes an empty placeholder to the run log first, then overwrites it with the
    // header + command once the run is ready to start - take the last write to that log path.
    const logWriteCalls = fs.writeFileSync.mock.calls.filter(
      ([filePath]) => typeof filePath === 'string' && /\d+\.log$/.test(filePath),
    );
    const logWriteCall = logWriteCalls[logWriteCalls.length - 1];

    expect(logWriteCall).toBeDefined();
    const [, contents] = logWriteCall;

    // Header must appear before the reproducing command, and must capture what the user chose
    expect(contents.indexOf('# ===== Run options')).toBe(0);
    expect(contents).toContain('# task: detect');
    expect(contents).toContain('# device: cpu');
    expect(contents).toContain('# options: --conf 0.25');
    expect(contents).toContain('# weights: best.pt');
    expect(contents).toContain('python3');
    expect(contents.indexOf('# task: detect')).toBeLessThan(contents.indexOf('python3'));
  });
});
