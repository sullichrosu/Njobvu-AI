// Regression test for the ENOTDIR crash on GET /training when a stray file (e.g. summary.json /
// run_summary.md written directly into training/logs by the chat run-summary feature) sits
// alongside real run subfolders. getTrainingPage.js used to assume every entry under logs/ was a
// run directory and called readdir on it unconditionally, crashing the whole server process with
// an uncaught rejection. Invokes the route handler directly (bypassing the Express/static stack,
// which this codebase drives entirely through globals set by server.js) so the test exercises the
// exact vulnerable file-system logic in isolation.

const LOG_PATH = '/test/path/public/projects/testuser-test-project/training/logs/';
const INF_LOG_PATH = '/test/path/public/projects/testuser-test-project/inference/logs/';
const RUN1_LOG_PATH = `${LOG_PATH}run1/`;
const STRAY_FILE_RUN_PATH = `${LOG_PATH}summary.json/`;

// A real fs.readdir on a path whose final segment is a file (not a directory) fails with ENOTDIR —
// reproduce that exactly so this test fails against the pre-fix code and passes against the fix.
function enotdirError(target) {
  const err = new Error(`ENOTDIR: not a directory, scandir '${target}'`);
  err.code = 'ENOTDIR';
  return err;
}

describe('GET /training - stray file in logs directory', () => {
  let getTrainingPage;

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
          all: jest.fn((sql, cb2) => cb2 && cb2(null, [])),
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
      statSync: jest.fn((p) => {
        const isDir = p !== `${LOG_PATH}summary.json`;
        return { isDirectory: () => isDir, isFile: () => !isDir };
      }),
    };

    global.readdirAsync = jest.fn((dirPath) => {
      if (dirPath === LOG_PATH) {
        // Real run folder alongside the stray summary.json written directly into logs/.
        return Promise.resolve(['run1', 'summary.json']);
      }
      if (dirPath === RUN1_LOG_PATH) {
        return Promise.resolve(['done.log', 'run1.log']);
      }
      if (dirPath === STRAY_FILE_RUN_PATH) {
        // What Node's real fs.promises.readdir does when given a file path.
        return Promise.reject(enotdirError(STRAY_FILE_RUN_PATH.replace(/\/$/, '')));
      }
      if (dirPath === INF_LOG_PATH) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    getTrainingPage = require('../../routes/pages/getTrainingPage');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not crash and renders the training page when logs/ contains a stray non-directory entry', async () => {
    const req = {
      query: { IDX: '0' },
      cookies: { Username: 'testuser' },
    };
    const res = {
      render: jest.fn(),
      redirect: jest.fn(),
    };

    await expect(getTrainingPage(req, res)).resolves.not.toThrow();

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('processing', expect.objectContaining({
      log_folder: ['run1'],
    }));

    // The stray file must never be handed to readdir as if it were a run folder.
    expect(global.readdirAsync).not.toHaveBeenCalledWith(STRAY_FILE_RUN_PATH);
    // The real run folder must still be picked up.
    expect(global.readdirAsync).toHaveBeenCalledWith(RUN1_LOG_PATH);
  });
});
