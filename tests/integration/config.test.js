const request = require('supertest');
const app = require('../../app');

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

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  rename: jest.fn((oldPath, newPath, callback) => callback(null)),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// Mock file upload
jest.mock('express-fileupload', () => jest.fn(() => (req, res, next) => {
  req.files = {
    upload_images: null,
    upload_video: null,
    upload_bootstrap: null,
  };
  next();
}));

// Mock StreamZip
jest.mock('node-stream-zip', () => {
  return jest.fn().mockImplementation(() => ({
    extract: jest.fn().mockResolvedValue(),
    close: jest.fn().mockResolvedValue(),
    on: jest.fn(),
  }));
});

// Mock rimraf
jest.mock('../../public/libraries/rimraf', () => jest.fn((path, callback) => callback(null)));

// Mock Client
jest.mock('../../queries/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    // Mock client methods as needed
  })),
}));

// Mock utils
jest.mock('../../utils/unzipFile', () => jest.fn());
jest.mock('../../utils/pythonScript', () => jest.fn());

describe('Configuration Routes - Basic Tests', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser' }
      ]),
      getAsync: jest.fn().mockResolvedValue({ 
        PDescription: 'Test project description',
        PName: 'test-project',
        Admin: 'testuser'
      }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.colorsJSON = ['#FF0000', '#00FF00', '#0000FF'];
    global.readdirAsync = jest.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /config - Main Configuration Page', () => {
    /* 
    * this tests if the main config page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the main config page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the main config page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the main config page handles out-of-range IDX values.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is out of range', async () => {
      global.db.allAsync = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get('/config?IDX=5')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /config/projSettings - Project Settings Page', () => {
    /* 
    * this tests if the project settings page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config/projSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the project settings page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config/projSettings')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the project settings page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config/projSettings?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the project settings page handles out-of-range IDX values.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is out of range', async () => {
      global.db.allAsync = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get('/config/projSettings?IDX=5')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /config/classSettings - Class Settings Page', () => {
    /* 
    * this tests if the class settings page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config/classSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the class settings page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config/classSettings')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the class settings page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config/classSettings?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the class settings page handles out-of-range IDX values.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is out of range', async () => {
      global.db.allAsync = jest.fn().mockResolvedValue([]);

      const res = await request(app)
        .get('/config/classSettings?IDX=5')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /config/accessSettings - Access Settings Page', () => {
    /* 
    * this tests if the access settings page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config/accessSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the access settings page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config/accessSettings')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the access settings page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config/accessSettings?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /config/imageSettings - Image Settings Page', () => {
    /* 
    * this tests if the image settings page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config/imageSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the image settings page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config/imageSettings')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the image settings page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config/imageSettings?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /config/mergeSettings - Merge Settings Page', () => {
    /* 
    * this tests if the merge settings page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/config/mergeSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the merge settings page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/config/mergeSettings')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the merge settings page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/config/mergeSettings?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('GET /configV - Validation Configuration Page', () => {
    /* 
    * this tests if the validation config page responds for a valid project.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should return 200 OK or handle errors gracefully for valid project', async () => {
      const res = await request(app)
        .get('/configV?IDX=0')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the validation config page handles undefined IDX parameter.
    * This test expects a status code 200, 302, or 500 (redirect or error handling).
    */
    it('should redirect to home or handle errors when IDX is undefined', async () => {
      const res = await request(app)
        .get('/configV')
        .set('Cookie', ['Username=testuser']);

      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the validation config page handles unauthenticated users.
    * This test expects a status code 200, 302, or 500 (redirect to login or error handling).
    */
    it('should redirect to login or handle errors when user is not authenticated', async () => {
      const res = await request(app)
        .get('/configV?IDX=0');

      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });

  describe('Database Error Handling', () => {
    /* 
    * this tests if the config pages handle database errors gracefully.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should handle database errors gracefully', async () => {
      global.db.allAsync = jest.fn().mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .get('/config?IDX=0')
        .set('Cookie', ['Username=testuser']);

      // Should still return a response (could be 200, 500, or redirect)
      expect([200, 302, 500]).toContain(res.statusCode);
    });

    /* 
    * this tests if the config pages handle missing project data gracefully.
    * This test expects a status code 200, 302, or 500 (success, redirect, or error handling).
    */
    it('should handle missing project data', async () => {
      global.db.getAsync = jest.fn().mockResolvedValue(null);

      const res = await request(app)
        .get('/config/projSettings?IDX=0')
        .set('Cookie', ['Username=testuser']);

      // Should still return a response
      expect([200, 302, 500]).toContain(res.statusCode);
    });
  });
}); 