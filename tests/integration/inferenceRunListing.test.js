// Wrap the real implementation in a jest.fn() so we can assert the live route actually calls
// it (a spy attached after require would miss the reference getInferencePage.js already
// destructured at module load time).
jest.mock('../../utils/isRunArtifactFile', () => {
  const actual = jest.requireActual('../../utils/isRunArtifactFile');
  return {
    isCocoClassesFile: actual.isCocoClassesFile,
    isReservedInferenceFile: jest.fn(actual.isReservedInferenceFile),
  };
});

// getInferencePage.js does `const fs = require("fs")`, so the module-level mock (not a
// global.fs assignment) is what actually reaches it.
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFile: jest.fn((p, data, cb) => cb(null)),
  readFileSync: jest.fn().mockReturnValue(''),
  readdir: jest.fn((p, cb) => cb(null, [])),
  readFile: jest.fn((p, cb) => cb(null, '')),
}));

const { isReservedInferenceFile } = require('../../utils/isRunArtifactFile');
const getInferencePage = require('../../routes/pages/getInferencePage');

describe('GET /inference page handler - coco-classes filtering', () => {
  beforeEach(() => {
    global.currentPath = '/test/path/';
    global.util = require('util');
    global.logger = { info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.configFile = {};

    global.db = {
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
      ]),
      getAsync: jest.fn().mockResolvedValue({
        PDescription: 'Test project description',
        AutoSave: 1,
      }),
    };

    global.sqlite3 = {
      Database: jest.fn((dbPath, cb) => {
        if (typeof cb === 'function') cb(null);
        return {
          get: jest.fn((sql, cb2) => cb2(null, {})),
          all: jest.fn((sql, cb2) => cb2(null, [])),
          close: jest.fn((cb2) => cb2 && cb2(null)),
        };
      }),
    };

    // One inference run whose artifact directory contains both a coco_classes.yaml
    // (must be filtered out of the weights listing) and a real weight file (must stay).
    const inferenceRunFiles = ['1700000000.log', 'done.log', 'coco_classes.yaml', 'best.pt'];

    global.readdirAsync = jest.fn((dirPath) => {
      if (typeof dirPath === 'string' && dirPath.endsWith('/inference/logs/')) {
        return Promise.resolve(['1700000000']);
      }
      if (typeof dirPath === 'string' && dirPath.includes('/inference/logs/')) {
        return Promise.resolve(inferenceRunFiles);
      }
      // weights dir, uploads dir, training logs dir, python scripts dir, etc.
      return Promise.resolve([]);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('excludes coco_classes.yaml from the rendered inference weights list, keeps real weights', async () => {
    const req = { query: { IDX: '0' }, cookies: { Username: 'testuser' } };
    const res = {
      render: jest.fn(),
      redirect: jest.fn(),
    };

    await getInferencePage(req, res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledTimes(1);

    const [view, locals] = res.render.mock.calls[0];
    expect(view).toBe('inference');

    // The shared filter must have been asked about coco_classes.yaml and said "exclude".
    const filenamesChecked = isReservedInferenceFile.mock.calls.map(([name]) => name);
    expect(filenamesChecked).toContain('coco_classes.yaml');
    expect(isReservedInferenceFile('coco_classes.yaml')).toBe(true);

    // And the actual rendered weights list reflects that: coco_classes.yaml is gone,
    // the real weight file survives.
    expect(locals.weights_names_inf.flat()).not.toContain('coco_classes.yaml');
    expect(locals.weights_names_inf.flat()).toContain('best.pt');
  });
});
