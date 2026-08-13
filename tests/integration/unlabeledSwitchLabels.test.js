// Regression test for assigning a previously-unlabeled image to a class. Unlabeled images have
// no Labels row (no LID), so the normal switchLabels UPDATE ... WHERE LID IN (...) path can never
// match them - assigning a class must INSERT a new Labels row instead, keyed by image name.
//
// Invokes the route handler directly (bypassing the Express app) since requiring app.js pulls in
// node-fetch@3 (ESM-only), which Jest in this repo isn't configured to transform.

const UNLABELED_CLASS = require('../../utils/unlabeledClass');

jest.mock('../../queries/queries', () => ({
  project: {
    sql: jest.fn(),
  },
}));

const queries = require('../../queries/queries');
const switchLabels = require('../../routes/labelling/switchLabels');

describe('switchLabels - assign a previously-unlabeled image to a class', () => {
  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  }

  it('inserts a new Labels row instead of running the LID-keyed UPDATE', async () => {
    queries.project.sql.mockResolvedValue({ success: true, changes: 1 });

    const req = {
      body: {
        selectedLabels: ['newimage.jpg'],
        selectedClass: 'cat',
        currentClass: UNLABELED_CLASS,
        admin: 'testuser',
        PName: 'test-project',
      },
    };
    const res = mockRes();

    await switchLabels(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Images assigned to class successfully',
      labelsAffected: 1,
    }));

    expect(queries.project.sql).toHaveBeenCalledTimes(1);
    const [, sql, params] = queries.project.sql.mock.calls[0];
    expect(sql).toMatch(/^INSERT INTO Labels/);
    expect(sql).not.toMatch(/UPDATE Labels/);
    expect(params).toEqual(['cat', 'newimage.jpg']);
  });

  it('still uses the LID-keyed UPDATE for a normal (non-unlabeled) class switch', async () => {
    queries.project.sql.mockResolvedValue({ success: true, changes: 1 });

    const req = {
      body: {
        selectedLabels: ['42'],
        selectedClass: 'dog',
        currentClass: 'cat',
        admin: 'testuser',
        PName: 'test-project',
      },
    };
    const res = mockRes();

    await switchLabels(req, res);

    expect(queries.project.sql).toHaveBeenCalledTimes(1);
    const [, sql] = queries.project.sql.mock.calls[0];
    expect(sql).toMatch(/^UPDATE Labels/);
  });
});
