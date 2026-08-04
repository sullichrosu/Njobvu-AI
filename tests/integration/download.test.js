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
  const mock = {
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
  mock.verbose = jest.fn(() => mock);
  return mock;
});
jest.mock('socket.io-client', () => ({
  protocol: 'http',
}));

global.sqlite3 = require('sqlite3');
global.probe = require('probe-image-size');
global.archiver = require('archiver');

const express = require('express');
jest.spyOn(express.response, 'download').mockImplementation(function (path, filename, fn) {
  let callback = fn;
  if (typeof filename === 'function') {
    callback = filename;
  }
  if (typeof callback === 'function') {
    callback(null);
  } else {
    this.send('downloaded: ' + path);
  }
});

const request = require('supertest');
const app = require('../../app');

jest.mock('../../queries/queries', () => ({
  project: {
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'class1' }, { CName: 'class2' }] }),
    getAllImages: jest.fn().mockResolvedValue({ rows: [{ IName: 'image1.jpg' }, { IName: 'image2.jpg' }] }),
    getAllLabels: jest.fn().mockResolvedValue({
      rows: [
        { LID: 1, CName: 'class1', X: '10', Y: '20', W: 30, H: 40, IName: 'image1.jpg' },
        { LID: 2, CName: 'class2', X: '15', Y: '25', W: 35, H: 45, IName: 'image2.jpg' }
      ]
    }),
  },
}));

jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    createWriteStream: jest.fn().mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'close') {
          process.nextTick(callback);
        }
      }),
      pipe: jest.fn(),
    }),
    readFileSync: jest.fn().mockReturnValue('dummy_data'),
  };
});

jest.mock('probe-image-size', () => ({
  sync: jest.fn(() => ({ width: 800, height: 600 })),
}));

jest.mock('archiver', () => {
  const mArchiver = jest.fn(() => ({
    pipe: jest.fn(),
    file: jest.fn(),
    directory: jest.fn(),
    finalize: jest.fn(),
    on: jest.fn(),
  }));
  return mArchiver;
});

describe('Download Dataset Route', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([]),
      getAsync: jest.fn().mockResolvedValue({ row: { THING: 0 } }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully download standard COCO dataset (format 2)', async () => {
    const res = await request(app)
      .post('/downloadDataset')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        IDX: 1,
        download_format: 2,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('downloaded:');
  });

  it('should successfully download KitWare COCO dataset (format 7)', async () => {
    const res = await request(app)
      .post('/downloadDataset')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        IDX: 1,
        download_format: 7,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('downloaded:');
  });
});
