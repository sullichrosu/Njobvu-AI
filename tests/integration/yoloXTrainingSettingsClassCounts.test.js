// Integration tests for GET /yolo/yolovXTrainingSettings's per-class image count wiring
// (routes/pages/getYoloXTrainingSettingsPage.js). Invokes the route handler directly, bypassing
// the Express/static stack, matching the convention already used for this route family in
// tests/integration/trainingPage.test.js -- this codebase drives page routes entirely through
// globals set by server.js rather than importable modules.

jest.mock('../../queries/queries', () => ({
  project: {
    getClassImageCounts: jest.fn(),
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

describe('GET /yolo/yolovXTrainingSettings - per-class image counts', () => {
  let getYoloXTrainingSettingsPage;

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
              { CName: 'unlabeled_class' },
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

    getYoloXTrainingSettingsPage = require('../../routes/pages/getYoloXTrainingSettingsPage');
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

  it('attaches imageCount to each class from queries.project.getClassImageCounts, keyed by CName, and appends an Unlabeled pseudo-class', async () => {
    queries.project.getClassImageCounts.mockResolvedValue({
      success: true,
      rows: [
        { CName: 'person', imageCount: 42 },
        { CName: 'car', imageCount: 7 },
        // no row for 'unlabeled_class' -- must default to 0, not be dropped or crash
      ],
    });
    queries.project.getUnlabeledImages.mockResolvedValue({
      rows: [{ IName: 'a.jpg' }, { IName: 'b.jpg' }, { IName: 'c.jpg' }],
    });

    const { req, res } = makeReqRes();
    await expect(getYoloXTrainingSettingsPage(req, res)).resolves.not.toThrow();

    expect(queries.project.getClassImageCounts).toHaveBeenCalledWith(
      expect.stringContaining('testuser-test-project'),
    );
    expect(queries.project.getUnlabeledImages).toHaveBeenCalledWith(
      expect.stringContaining('testuser-test-project'),
    );
    expect(res.render).toHaveBeenCalledWith(
      'training/yolovXTrainingSettings',
      expect.objectContaining({
        classes: [
          expect.objectContaining({ CName: 'person', imageCount: 42 }),
          expect.objectContaining({ CName: 'car', imageCount: 7 }),
          expect.objectContaining({ CName: 'unlabeled_class', imageCount: 0 }),
          expect.objectContaining({ CName: '__UNLABELED__', imageCount: 3 }),
        ],
        unlabeledClass: '__UNLABELED__',
      }),
    );
  });

  it('defaults every class and the Unlabeled pseudo-class to imageCount 0 and still renders when the count queries fail', async () => {
    queries.project.getClassImageCounts.mockRejectedValue(new Error('db unavailable'));
    queries.project.getUnlabeledImages.mockRejectedValue(new Error('db unavailable'));

    const { req, res } = makeReqRes();
    await expect(getYoloXTrainingSettingsPage(req, res)).resolves.not.toThrow();

    expect(res.render).toHaveBeenCalledWith(
      'training/yolovXTrainingSettings',
      expect.objectContaining({
        classes: [
          expect.objectContaining({ CName: 'person', imageCount: 0 }),
          expect.objectContaining({ CName: 'car', imageCount: 0 }),
          expect.objectContaining({ CName: 'unlabeled_class', imageCount: 0 }),
          expect.objectContaining({ CName: '__UNLABELED__', imageCount: 0 }),
        ],
      }),
    );
    expect(global.logger.error).toHaveBeenCalled();
  });
});
