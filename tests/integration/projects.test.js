// Set up global sqlite3 mock before requiring app
jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());

jest.mock('child_process', () => {
  const mProcess = {
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    }),
  };
  return {
    exec: jest.fn(),
    spawn: jest.fn().mockReturnValue(mProcess),
  };
});

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

// Mock queries
jest.mock('../../queries/queries', () => ({
  managed: {
    createProject: jest.fn().mockResolvedValue({ row: { ProjectName: 'test-project' } }),
    deleteProject: jest.fn().mockResolvedValue({ row: { success: true } }),
    deleteAccessFromProject: jest.fn().mockResolvedValue({ row: { success: true } }),
    grantUserAccess: jest.fn().mockResolvedValue({ row: { success: true } }),
    removeAccess: jest.fn().mockResolvedValue({ row: { success: true } }),
    transferAdmin: jest.fn().mockResolvedValue({ row: { success: true } }),
    updateProjectName: jest.fn().mockResolvedValue({ row: { success: true } }),
  },
  project: {
    migrateProjectDb: jest.fn().mockResolvedValue({ row: { success: true } }),
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'class1' }, { CName: 'class2' }] }),
    createClass: jest.fn().mockResolvedValue({ row: { success: true } }),
    addImages: jest.fn().mockResolvedValue({ row: { success: true } }),
    deleteImage: jest.fn().mockResolvedValue({ row: { success: true } }),
    sql: jest.fn().mockResolvedValue({ row: { success: true } }),
  },
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  writeFile: jest.fn((path, data, callback) => callback(null)),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  unlinkSync: jest.fn(),
  rename: jest.fn((oldPath, newPath, callback) => callback(null)),
  readFileSync: jest.fn().mockReturnValue(''),
}));

// Mock file upload
jest.mock('express-fileupload', () => jest.fn(() => (req, res, next) => {
  req.files = global.mockFiles || {
    upload_images: null,
    upload_video: null,
    upload_bootstrap: null,
    yolo_archive: { name: 'yolo_archive.zip', mv: jest.fn().mockResolvedValue() },
    yolo_weights: { name: 'weights.pt', mv: jest.fn().mockResolvedValue() },
    coco_archive: { name: 'coco_archive.zip', mv: jest.fn().mockResolvedValue() },
    viame_model: { name: 'viame.pt', mv: jest.fn().mockResolvedValue() },
    dataset: { name: 'dataset.zip', mv: jest.fn().mockResolvedValue() },
    weights: { name: 'weights.pt', mv: jest.fn().mockResolvedValue() },
    ifcb_archive: { name: 'ifcb_archive.zip', mv: jest.fn().mockResolvedValue() }
  };
  next();
}));

// Mock StreamZip
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

describe('Project Routes - Basic Tests', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([]),
      getAsync: jest.fn().mockResolvedValue({ row: { THING: 0 } }),
    };
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.readdirAsync = jest.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete global.mockFiles;
  });

  /* 
  * this tests if the createP route responds to project creation requests.
  * This test expects a status code 200.
  */
  it('should respond to createP route', async () => {
    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project',
        input_classes: 'class1,class2',
        frame_rate: '1',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
  });

  /* 
  * this tests if the deleteProject route responds to project deletion requests.
  * This test expects a status code 302 (redirect).
  */
  it('should respond to deleteProject route', async () => {
    const res = await request(app)
      .post('/deleteProject')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        IDX: 1,
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
  });

  /* 
  * this tests if the removeAccess route responds to access removal requests.
  * This test expects a status code 302 (redirect).
  */
  it('should respond to removeAccess route', async () => {
    const res = await request(app)
      .post('/removeAccess')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        Username: 'user-to-remove',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
  });

  /* 
  * this tests if the transferAdmin route responds to admin transfer requests.
  * This test expects a status code 302 (redirect).
  */
  it('should respond to transferAdmin route', async () => {
    const res = await request(app)
      .post('/transferAdmin')
      .send({
        PName: 'test-project',
        Admin: 'testuser',
        NewAdmin: 'new-admin',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
  });

/*
  * this tests if the createProject route handles multiple bootstrap zip uploads correctly.
  */
  it('should accept and save multiple bootstrap zip files during project creation', async () => {
    const mockMv = jest.fn().mockResolvedValue(true);
    global.mockFiles = {
      upload_images: {
        name: 'images.zip',
        mv: jest.fn().mockResolvedValue(true),
      },
      upload_video: null,
      upload_bootstrap: [
        { name: 'model1.zip', mv: mockMv },
        { name: 'model2.zip', mv: mockMv },
      ],
    };

    // Mock child_process exec to return mock process that triggers exit
    const childProcess = require('child_process');
    childProcess.exec.mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'exit') {
          process.nextTick(() => callback(0));
        }
        return this;
      }),
    });

    // Mock process.chdir to avoid actual directory change error
    const originalChdir = process.chdir;
    process.chdir = jest.fn();

    // Mock queries.project.getAllImages
    const queries = require('../../queries/queries');
    queries.project.getAllImages = jest.fn().mockResolvedValue({ rows: [] });

    // Mock fs.readFileSync to return JSON array for bootstrap output
    const fs = require('fs');
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync.mockImplementation((path, options) => {
      if (path && typeof path === 'string' && path.endsWith('out.json')) {
        return '[]';
      }
      return originalReadFileSync(path, options);
    });

    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project-multi',
        input_classes: 'class1,class2',
        frame_rate: '1',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Project creation successful');
    expect(mockMv).toHaveBeenCalledTimes(2);

    // Restore original readFileSync and process.chdir
    fs.readFileSync = originalReadFileSync;
    process.chdir = originalChdir;
  });

  /*
  * CEO-46: uploading multiple videos used to make every video's frames
  * start over at frame001.jpg, so the second video's frames silently
  * overwrote the first video's on disk. Each video should now get its own
  * ffmpeg extraction call with a distinct frame file_name prefix.
  */
  it('extracts frames from each uploaded video with a distinct name prefix', async () => {
    global.mockFiles = {
      upload_images: null,
      upload_video: [
        { name: 'video.mp4', mv: jest.fn().mockResolvedValue(true) },
        { name: 'video.mp4', mv: jest.fn().mockResolvedValue(true) },
      ],
      upload_bootstrap: null,
    };

    const extractFrameCalls = [];
    const ffmpeg = require('ffmpeg');
    ffmpeg.mockImplementation(() => Promise.resolve({
      fnExtractFrameToJPG: jest.fn((destination, options) => {
        extractFrameCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project-multi-video',
        input_classes: 'class1,class2',
        frame_rate: '1',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(extractFrameCalls).toHaveLength(2);

    const prefixes = extractFrameCalls.map((options) => options.file_name);
    expect(new Set(prefixes).size).toBe(2);
    expect(prefixes[0]).toBe('video');
    expect(prefixes[1]).toBe('video_1');

    // a single frame_rate covering both videos (legacy/backward-compat
    // shape) applies to every video
    expect(extractFrameCalls.map((options) => options.every_n_frames)).toEqual([30, 30]);

    // jest.clearAllMocks() (afterEach) keeps a mock's implementation, only
    // its call history is wiped -- reset it fully so this test's fake ffmpeg
    // doesn't leak into later tests in this file.
    ffmpeg.mockReset();
  });

  /*
  * CEO-46 follow-up: the user should be prompted for -- and get -- a
  * separate fps for each video uploaded in one project, not one shared
  * rate applied to every video.
  */
  it('splits each uploaded video at its own requested framerate', async () => {
    global.mockFiles = {
      upload_images: null,
      upload_video: [
        { name: 'slow-cam.mp4', mv: jest.fn().mockResolvedValue(true) },
        { name: 'fast-cam.mp4', mv: jest.fn().mockResolvedValue(true) },
      ],
      upload_bootstrap: null,
    };

    const extractFrameCalls = [];
    const ffmpeg = require('ffmpeg');
    ffmpeg.mockImplementation(() => Promise.resolve({
      fnExtractFrameToJPG: jest.fn((destination, options) => {
        extractFrameCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project-per-video-fps',
        input_classes: 'class1,class2',
        frame_rate: ['2', '5'],
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(extractFrameCalls).toHaveLength(2);
    expect(extractFrameCalls.map((options) => options.every_n_frames)).toEqual([60, 150]);

    ffmpeg.mockReset();
  });

  /*
  * this tests if the createProject route handles PyTorch (.pt) bootstrap zip uploads correctly.
  */
  it('should accept and save PyTorch (.pt) bootstrap models during project creation', async () => {
    const mockMv = jest.fn().mockResolvedValue(true);
    global.mockFiles = {
      upload_images: {
        name: 'images.zip',
        mv: jest.fn().mockResolvedValue(true),
      },
      upload_video: null,
      upload_bootstrap: [
        { name: 'model1.zip', mv: mockMv },
      ],
    };

    // Mock child_process exec to verify the command
    const childProcess = require('child_process');
    let capturedCmd = '';
    childProcess.exec.mockImplementation((cmd, callback) => {
      capturedCmd = cmd;
      const mChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') {
            process.nextTick(() => callback(0));
          }
          return mChild;
        }),
      };
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, '', ''));
      }
      return mChild;
    });

    // Mock process.chdir to avoid actual directory change error
    const originalChdir = process.chdir;
    process.chdir = jest.fn();

    // Mock queries.project.getAllImages
    const queries = require('../../queries/queries');
    queries.project.getAllImages = jest.fn().mockResolvedValue({ rows: [] });

    // Mock fs
    const fs = require('fs');
    const originalReadFileSync = fs.readFileSync;
    const originalReaddirSync = fs.readdirSync;
    const originalExistsSync = fs.existsSync;
    
    fs.readdirSync = jest.fn().mockReturnValue(['best.pt']);
    fs.existsSync = jest.fn().mockImplementation((path) => {
      if (path && typeof path === 'string') {
        if (path.endsWith('best.pt')) return true;
        if (path.endsWith('out.json')) return true;
      }
      return originalExistsSync(path);
    });
    fs.readFileSync.mockImplementation((path, options) => {
      if (path && typeof path === 'string' && path.endsWith('out.json')) {
        return '[]';
      }
      return originalReadFileSync(path, options);
    });

    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project-pt',
        input_classes: 'class1,class2',
        frame_rate: '1',
        model_format: 'ultralytics',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Project creation successful');
    expect(capturedCmd).toContain('best.pt');
    expect(capturedCmd).not.toContain('-d'); // PyTorch command shouldn't have -d or -c
    expect(capturedCmd).not.toContain('-c');

    // Restore original
    fs.readFileSync = originalReadFileSync;
    fs.readdirSync = originalReaddirSync;
    fs.existsSync = originalExistsSync;
    process.chdir = originalChdir;
  });

  /*
  * this tests if the createProject route handles multiple bootstrap zip uploads with ultralytics format correctly.
  */
  it('should accept and save multiple bootstrap zip files with ultralytics format during project creation', async () => {
    const mockMv = jest.fn().mockResolvedValue(true);
    global.mockFiles = {
      upload_images: {
        name: 'images.zip',
        mv: jest.fn().mockResolvedValue(true),
      },
      upload_video: null,
      upload_bootstrap: [
        { name: 'model1.zip', mv: mockMv },
        { name: 'model2.zip', mv: mockMv },
      ],
    };

    // Mock child_process exec to return mock process that triggers exit
    const childProcess = require('child_process');
    childProcess.exec.mockImplementation((cmd, callback) => {
      const mChild = {
        on: jest.fn((event, callback) => {
          if (event === 'exit') {
            process.nextTick(() => callback(0));
          }
          return mChild;
        }),
      };
      if (typeof callback === 'function') {
        process.nextTick(() => callback(null, '', ''));
      }
      return mChild;
    });

    // Mock process.chdir to make sure it is not called for ultralytics format
    const originalChdir = process.chdir;
    process.chdir = jest.fn();

    // Mock queries.project.getAllImages
    const queries = require('../../queries/queries');
    queries.project.getAllImages = jest.fn().mockResolvedValue({ rows: [] });

    // Mock fs
    const fs = require('fs');
    const originalReadFileSync = fs.readFileSync;
    const originalReaddirSync = fs.readdirSync;
    const originalExistsSync = fs.existsSync;
    
    fs.readdirSync = jest.fn().mockReturnValue(['best.pt']);
    fs.existsSync = jest.fn().mockImplementation((path) => {
      if (path && typeof path === 'string') {
        if (path.endsWith('best.pt')) return true;
        if (path.endsWith('out.json')) return true;
      }
      return originalExistsSync(path);
    });
    fs.readFileSync.mockImplementation((path, options) => {
      if (path && typeof path === 'string' && path.endsWith('out.json')) {
        return '[]';
      }
      return originalReadFileSync(path, options);
    });

    const res = await request(app)
      .post('/createP')
      .send({
        project_name: 'test-project-multi-ultralytics',
        input_classes: 'class1,class2',
        frame_rate: '1',
        model_format: 'ultralytics',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('Project creation successful');
    expect(mockMv).toHaveBeenCalledTimes(2);
    expect(process.chdir).not.toHaveBeenCalled();

    // Restore original readFileSync and process.chdir
    fs.readFileSync = originalReadFileSync;
    fs.readdirSync = originalReaddirSync;
    fs.existsSync = originalExistsSync;
    process.chdir = originalChdir;
  });

  /* * this tests if the import-yolo route responds to yolo archive imports.
  * This test expects a status code 200.
  */
  it('should respond to import-yolo route', async () => {
    const res = await request(app)
      .post('/api/projects/import-yolo')
      .send({
        project_name: 'test-yolo-project',
        task_type: 'detect',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
  });

  /* * this tests if the import-kwcoco route responds to kwcoco archive imports.
  * This test expects a status code 200.
  */
  it('should respond to import-kwcoco route', async () => {
    const res = await request(app)
      .post('/api/projects/import-kwcoco')
      .send({
        project_name: 'test-coco-project',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
  });

  /* * this tests if the import-dataset route responds to YOLO archive import requests.
  * This test expects a status code 200.
  */
  it('should successfully import YOLO dataset archive', async () => {
    const res = await request(app)
      .post('/api/projects/import-dataset')
      .send({
        projectName: 'test-yolo-project',
        'import-type': 'yolo'
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* * this tests if the import-dataset route responds to KW Coco archive import requests.
  * This test expects a status code 200.
  */
  it('should successfully import KW Coco dataset archive', async () => {
    const res = await request(app)
      .post('/api/projects/import-dataset')
      .send({
        projectName: 'test-coco-project',
        'import-type': 'kwcoco'
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* * this tests if the import-dataset route responds to classification dataset archive import requests.
  * This test expects a status code 200.
  */
  it('should successfully import classification dataset archive', async () => {
    const res = await request(app)
      .post('/api/projects/import-dataset')
      .send({
        projectName: 'test-classification-project',
        dbName: 'test-classification-project',
        'import-type': 'classification'
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  /* * this tests if the import-ifcb route responds to IFCB archive imports.
  * This test expects a status code 400 when no .roi files are found.
  */
  it('should respond to import-ifcb route with 400 if no roi files found', async () => {
    const res = await request(app)
      .post('/api/projects/import-ifcb')
      .send({
        project_name: 'test-ifcb-project',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('No .roi files found');
  });

  /* * this tests if the import-ifcb route successfully imports IFCB archives.
  * This test expects a status code 200.
  */
  it('should successfully import IFCB archive when roi files exist', async () => {
    const fs = require('fs');
    const originalReaddirSync = fs.readdirSync;
    const originalExistsSync = fs.existsSync;
    const originalStatSync = fs.statSync;

    fs.readdirSync = jest.fn().mockImplementation((path) => {
      if (path && (path.includes('uploads') || path.includes('tmp'))) {
        return ['test.roi', 'test.adc'];
      }
      return [];
    });
    fs.existsSync = jest.fn().mockImplementation((path) => {
      if (path && path.includes('test-ifcb-project-2')) {
        return false;
      }
      return true;
    });
    fs.statSync = jest.fn().mockReturnValue({ isDirectory: () => false });

    const res = await request(app)
      .post('/api/projects/import-ifcb')
      .send({
        project_name: 'test-ifcb-project-2',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Restore
    fs.readdirSync = originalReaddirSync;
    fs.existsSync = originalExistsSync;
    fs.statSync = originalStatSync;
  });

  /* * this tests if the import-ifcb route successfully imports IFCB archives with annotations from a CSV.
  * This test expects a status code 200.
  */
  it('should successfully import IFCB archive with annotations when CSV file exists', async () => {
    const fs = require('fs');
    const originalReaddirSync = fs.readdirSync;
    const originalExistsSync = fs.existsSync;
    const originalStatSync = fs.statSync;
    const originalReadFileSync = fs.readFileSync;
    const originalOpenSync = fs.openSync;
    const originalReadSync = fs.readSync;
    const originalCloseSync = fs.closeSync;

    fs.readdirSync = jest.fn().mockImplementation((path) => {
      if (path && (path.includes('uploads') || path.includes('tmp'))) {
        return ['test.roi', 'test.adc', 'labels.csv'];
      }
      if (path && path.includes('images')) {
        return ['D2_221129T115128_IFCB122_00015.png'];
      }
      return [];
    });
    fs.existsSync = jest.fn().mockImplementation((path) => {
      if (path && path.includes('test-ifcb-project-csv')) {
        return false;
      }
      return true;
    });
    fs.statSync = jest.fn().mockReturnValue({ isDirectory: () => false });

    // Mock CSV contents with different prefix to test year prefix normalization (D2_22 vs D2022)
    fs.readFileSync = jest.fn().mockImplementation((path) => {
      if (path && path.includes('labels.csv')) {
        return 'roi,class,classID\nD20221129T115128_IFCB122_00015,Alexandrium catenella,109470\n';
      }
      return '';
    });

    // Mock file descriptor operations for image size probing
    fs.openSync = jest.fn().mockReturnValue(123);
    fs.readSync = jest.fn();
    fs.closeSync = jest.fn();

    // Mock global probe
    const originalProbe = global.probe;
    global.probe = {
      sync: jest.fn().mockReturnValue({ width: 100, height: 120 })
    };

    const res = await request(app)
      .post('/api/projects/import-ifcb')
      .send({
        project_name: 'test-ifcb-project-csv',
      })
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // Restore
    fs.readdirSync = originalReaddirSync;
    fs.existsSync = originalExistsSync;
    fs.statSync = originalStatSync;
    fs.readFileSync = originalReadFileSync;
    fs.openSync = originalOpenSync;
    fs.readSync = originalReadSync;
    fs.closeSync = originalCloseSync;
    global.probe = originalProbe;
  });
});