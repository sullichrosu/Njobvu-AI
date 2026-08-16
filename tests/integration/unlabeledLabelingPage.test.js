// Regression test for the "unlabeled" bucket on the labeling page: images with zero rows in
// Labels must be counted and reported separately from the Classes-driven rows, without being
// folded into any class's count.

const UNLABELED_CLASS = require('../../utils/unlabeledClass');

describe('GET /labeling - unlabeled bucket', () => {
  let getLabelingPage;

  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.currentPath = '/test/path/';

    global.db = {
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
      ]),
      getAsync: jest.fn().mockResolvedValue({}),
    };

    global.sqlite3 = {
      Database: jest.fn((dbPath, cb) => {
        if (typeof cb === 'function') cb(null);
        return {
          all: jest.fn((sql, cb2) => {
            if (sql.includes('Classes')) {
              return cb2(null, [{ CName: 'cat' }]);
            }
            return cb2(null, []);
          }),
          get: jest.fn((sql, cb2) => {
            if (sql.includes('NOT IN (SELECT IName FROM Labels)')) {
              return cb2(null, { count: 4 });
            }
            if (sql.includes('COUNT(*) FROM Labels WHERE CName')) {
              return cb2(null, { 'COUNT(*)': 7 });
            }
            if (sql.includes('COUNT(*) FROM Images')) {
              return cb2(null, { 'COUNT(*)': 11 });
            }
            return cb2(null, {});
          }),
          close: jest.fn((cb2) => cb2 && cb2()),
        };
      }),
    };

    getLabelingPage = require('../../routes/pages/getLabelingPage');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports the count of images with zero Labels rows as a separate unlabeled bucket', async () => {
    const req = { query: { IDX: '0' }, cookies: { Username: 'testuser' } };
    const res = { render: jest.fn(), redirect: jest.fn() };

    await getLabelingPage(req, res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('labeling', expect.objectContaining({
      classes: [{ CName: 'cat' }],
      unlabeledCount: 4,
      unlabeledClass: UNLABELED_CLASS,
    }));
  });
});
