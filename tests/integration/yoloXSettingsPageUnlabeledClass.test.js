// Regression test for routes/pages/getYoloXSettingsPage.js: views/training/yolovXTrainingSettings.ejs
// is shared with getYoloXTrainingSettingsPage.js and unconditionally references the bare
// `unlabeledClass` local (for the Unlabeled slider). getYoloXSettingsPage.js used to render that
// template without ever setting `classes`' Unlabeled pseudo-entry or passing `unlabeledClass`,
// causing "ReferenceError: unlabeledClass is not defined" on GET /yolo/yolovXSettings.

jest.mock('../../queries/queries', () => ({
  project: {
    getClassLabelCounts: jest.fn(),
    getUnlabeledImages: jest.fn(),
  },
}));

const queries = require('../../queries/queries');

const PROJECT_PATH = '/test/path/public/projects/testuser-test-project';
const LOG_PATH = `${PROJECT_PATH}/training/logs/`;
const WEIGHTS_PATH = `${PROJECT_PATH}/training/weights`;
const PYTHON_PATH = `${PROJECT_PATH}/training/python`;
const INFERENCE_PATH = `${PROJECT_PATH}/inference`;
const INFERENCE_UPLOAD_PATH = `${PROJECT_PATH}/inference/uploads`;

describe('GET /yolo/yolovXSettings - Unlabeled pseudo-class wiring', () => {
  let getYoloXSettingsPage;

  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.util = require('util');
    global.currentPath = '/test/path/';
    global.configFile = { default_yolo_path: '' };

    global.db = {
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
      ]),
      getAsync: jest.fn().mockResolvedValue({
        PDescription: 'Test project description',
        PName: 'test-project',
        Admin: 'testuser',
        AutoSave: 1,
      }),
    };

    global.sqlite3 = {
      Database: jest.fn((dbPath, cb) => {
        if (typeof cb === 'function') cb(null);
        return {
          get: jest.fn((sql, cb2) => cb2 && cb2(null, {})),
          all: jest.fn((sql, cb2) =>
            cb2 && cb2(null, [
              { CName: 'person' },
              { CName: 'car' },
            ]),
          ),
          close: jest.fn((cb2) => cb2 && cb2()),
        };
      }),
    };

    global.fs = {
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      writeFile: jest.fn((p, data, cb) => cb && cb(null)),
      readFileSync: jest.fn().mockReturnValue(''),
      readdir: jest.fn((p, cb) => cb(null, [])),
      readFile: jest.fn((p, enc, cb) => (cb || enc)(null, '')),
      statSync: jest.fn(() => ({ isDirectory: () => false, isFile: () => true })),
    };

    global.readdirAsync = jest.fn((dirPath) => {
      if ([LOG_PATH, WEIGHTS_PATH, PYTHON_PATH, INFERENCE_PATH, INFERENCE_UPLOAD_PATH].includes(dirPath)) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    getYoloXSettingsPage = require('../../routes/pages/getYoloXSettingsPage');
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.db.allAsync.mockResolvedValue([
      { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
    ]);
    global.db.getAsync.mockResolvedValue({
      PDescription: 'Test project description',
      PName: 'test-project',
      Admin: 'testuser',
      AutoSave: 1,
    });
  });

  function makeReqRes() {
    const req = { query: { IDX: '0' }, cookies: { Username: 'testuser' } };
    const res = { render: jest.fn(), redirect: jest.fn() };
    return { req, res };
  }

  it('passes unlabeledClass and appends an Unlabeled pseudo-class so the shared template does not throw', async () => {
    queries.project.getClassLabelCounts.mockResolvedValue({
      success: true,
      rows: [
        { CName: 'person', labelCount: 12 },
        { CName: 'car', labelCount: 4 },
      ],
    });
    queries.project.getUnlabeledImages.mockResolvedValue({
      rows: [{ IName: 'a.jpg' }, { IName: 'b.jpg' }],
    });

    const { req, res } = makeReqRes();
    await expect(getYoloXSettingsPage(req, res)).resolves.not.toThrow();

    expect(queries.project.getUnlabeledImages).toHaveBeenCalledWith(
      expect.stringContaining('testuser-test-project'),
    );
    expect(res.render).toHaveBeenCalledWith(
      'training/yolovXTrainingSettings',
      expect.objectContaining({
        classes: [
          expect.objectContaining({ CName: 'person', labelCount: 12 }),
          expect.objectContaining({ CName: 'car', labelCount: 4 }),
          expect.objectContaining({ CName: '__UNLABELED__', imageCount: 2 }),
        ],
        unlabeledClass: '__UNLABELED__',
      }),
    );
  });

  it('defaults the Unlabeled pseudo-class to imageCount 0 and still renders when getUnlabeledImages fails', async () => {
    queries.project.getClassLabelCounts.mockResolvedValue({ success: true, rows: [] });
    queries.project.getUnlabeledImages.mockRejectedValue(new Error('db unavailable'));

    const { req, res } = makeReqRes();
    await expect(getYoloXSettingsPage(req, res)).resolves.not.toThrow();

    expect(res.render).toHaveBeenCalledWith(
      'training/yolovXTrainingSettings',
      expect.objectContaining({
        classes: expect.arrayContaining([
          expect.objectContaining({ CName: '__UNLABELED__', imageCount: 0 }),
        ]),
        unlabeledClass: '__UNLABELED__',
      }),
    );
    expect(global.logger.error).toHaveBeenCalled();
  });
});
