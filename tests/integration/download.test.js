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
// node-fetch@3 is ESM-only, which Jest in this repo isn't configured to transform;
// requiring app.js pulls it in via routes/chat/ollamaChat.js.
jest.mock('node-fetch', () => jest.fn());
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
  managed: {
    getBucket: jest.fn().mockResolvedValue({ row: null }),
  },
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

jest.mock('../../utils/s3Client', () => ({
  buildS3Client: jest.fn().mockReturnValue({}),
  getObjectStream: jest.fn().mockResolvedValue({
    body: require('stream').Readable.from([Buffer.from('s3_image_bytes')]),
    contentType: 'image/jpeg',
  }),
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
    append: jest.fn(),
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
    global.logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
    require('fs').existsSync.mockReturnValue(true);
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

  it('should download a mixed local + S3-streamed dataset by fetching the S3 image live (format 2)', async () => {
    const queries = require('../../queries/queries');
    const fs = require('fs');
    const s3Client = require('../../utils/s3Client');

    queries.project.getAllImages.mockResolvedValueOnce({
      rows: [
        { IName: 'local.jpg', Source: null, SourceKey: null },
        { IName: 'streamed.jpg', Source: 's3', SourceKey: 'prefix/streamed.jpg' },
      ],
    });
    queries.managed.getBucket.mockResolvedValueOnce({
      row: { BucketName: 'my-bucket', Region: 'us-east-1' },
    });
    fs.existsSync.mockImplementation((p) => !String(p).includes('streamed.jpg'));

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
    expect(s3Client.getObjectStream).toHaveBeenCalledWith(
      expect.anything(),
      'my-bucket',
      'prefix/streamed.jpg',
    );
    expect(global.logger.error).not.toHaveBeenCalled();
  });

  it('should skip an S3-streamed image with no bucket attached instead of crashing the download (format 7)', async () => {
    const queries = require('../../queries/queries');
    const fs = require('fs');

    queries.project.getAllImages.mockResolvedValueOnce({
      rows: [
        { IName: 'local.jpg', Source: null, SourceKey: null },
        { IName: 'orphaned.jpg', Source: 's3', SourceKey: 'prefix/orphaned.jpg' },
      ],
    });
    queries.managed.getBucket.mockResolvedValueOnce({ row: null });
    fs.existsSync.mockImplementation((p) => !String(p).includes('orphaned.jpg'));

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
    expect(global.logger.error).toHaveBeenCalled();
  });
});

describe('Download Classes Route', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([]),
      getAsync: jest.fn().mockResolvedValue({ row: { THING: 0 } }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.logger = { error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully download the project class list as a text file', async () => {
    const res = await request(app)
      .post('/downloadClasses')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        IDX: 1,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('downloaded:');
    expect(res.text).toContain('test-project_ClassList.txt');

    const queries = require('../../queries/queries');
    expect(queries.project.getAllClasses).toHaveBeenCalledWith(
      '/test/path/public/projects/testuser-test-project',
    );

    const fs = require('fs');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      '/test/path/public/projects/testuser_Downloads/test-project_ClassList.txt',
      'class1\nclass2\n',
    );
  });

  it('should return a JSON error when the project has no classes', async () => {
    const queries = require('../../queries/queries');
    queries.project.getAllClasses.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/downloadClasses')
      .send({
        PName: 'empty-project',
        Admin: 'testuser',
        IDX: 1,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({
      success: false,
      message: 'No classes found for this project',
    });
  });

  it('should return a 500 JSON error when fetching classes fails', async () => {
    const queries = require('../../queries/queries');
    queries.project.getAllClasses.mockRejectedValueOnce(new Error('db error'));

    const res = await request(app)
      .post('/downloadClasses')
      .send({
        PName: 'broken-project',
        Admin: 'testuser',
        IDX: 1,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(500);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({
      success: false,
      message: 'Error fetching classes',
    });
  });
});
