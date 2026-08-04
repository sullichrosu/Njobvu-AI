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

global.sqlite3 = require('sqlite3');

const request = require('supertest');
const app = require('../../app');

// Mock queries
jest.mock('../../queries/queries', () => ({
  managed: {
    sql: jest.fn().mockResolvedValue({ row: { success: true } }),
  },
  project: {
    updateReviewImage: jest.fn().mockResolvedValue({ success: true }),
    getAllValidationsForImage: jest.fn().mockResolvedValue({ rows: [] }),
    deleteAllLabelsForImage: jest.fn().mockResolvedValue({ success: true }),
    deleteAllValidationsForImage: jest.fn().mockResolvedValue({ success: true }),
    getAllLabels: jest.fn().mockResolvedValue({ rows: [] }),
    getMaxLabelId: jest.fn().mockResolvedValue({ rows: [{ LID: 1 }] }),
    createLabel: jest.fn().mockResolvedValue({ success: true }),
    createValidation: jest.fn().mockResolvedValue({ success: true }),
  },
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  rename: jest.fn((oldPath, newPath, callback) => callback(null)),
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

describe('updateLabels Route Test', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([]),
      getAsync: jest.fn().mockResolvedValue({}),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
  });

  it('should save labels and redirect successfully', async () => {
    const res = await request(app)
      .post('/updateLabels')
      .send({
        IDX: '0',
        PName: 'test-project',
        Admin: 'testuser',
        labels_counter: '1',
        LabelingID: '1',
        W: '10',
        H: '10',
        X: '5',
        Y: '5',
        CName: 'class1',
        form_action: 'save',
        IName: 'image1.jpg'
      })
      .set('Cookie', ['Username=testuser']);

    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', res.headers);
    expect(res.statusCode).toBe(302);
  });
});
