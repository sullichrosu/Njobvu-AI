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
      const cb = args[1] || args[2];
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
        getAsync: jest.fn().mockResolvedValue({ 
          'COUNT(*)': 10,
          Admin: 'testuser',
          PDescription: 'Test project description',
          AutoSave: 1
        }),
        allAsync: jest.fn().mockResolvedValue([
          { CName: 'class1' },
          { CName: 'class2' },
          { IName: 'image1.jpg' },
          { IName: 'image2.jpg' },
          { Username: 'testuser' }
        ]),
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
  managed: {
    sql: jest.fn().mockResolvedValue({ row: { success: true } }),
  },
  project: {
    sql: jest.fn().mockResolvedValue({ row: { success: true } }),
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

describe('getLabelingPage Route Test', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([
        { 
          PName: 'test-project', 
          Admin: 'testuser', 
          Username: 'testuser' 
        }
      ]),
      getAsync: jest.fn().mockResolvedValue({ 
        Admin: 'testuser',
        PDescription: 'Test project description',
        AutoSave: 1
      }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.colorsJSON = [{ value: '#FF0000' }];
  });

  it('should render labeling page successfully', async () => {
    const res = await request(app)
      .get('/labeling')
      .query({ IDX: 0 })
      .set('Cookie', ['Username=testuser']);

    console.log('LABELING STATUS:', res.statusCode);
    if (res.statusCode !== 200) {
      console.log('ERROR TEXT:', res.text);
    }
    expect(res.statusCode).toBe(200);
  });

  it('should render annotate page successfully', async () => {
    const res = await request(app)
      .get('/annotate')
      .query({ IDX: 0, IName: 'image1.jpg', curr_class: 'class1' })
      .set('Cookie', ['Username=testuser']);

    console.log('ANNOTATE STATUS:', res.statusCode);
    if (res.statusCode !== 200) {
      console.log('ERROR TEXT:', res.text);
    }
    expect(res.statusCode).toBe(200);
  });
});
