// Regression test for the "unlabeled" bucket's redirect target: clicking the bucket on the
// labeling page sends the user to /review?class=<sentinel>, which must select Images with no
// matching Labels row at all (the normal INNER JOIN ... WHERE Labels.CName = ? path returns
// nothing for those images, since they have no Labels row to join against).

const UNLABELED_CLASS = require('../../utils/unlabeledClass');

describe('GET /review - unlabeled bucket', () => {
  let getReviewPage;

  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.currentPath = '/test/path/';

    global.db = {
      allAsync: jest.fn().mockResolvedValue([
        { PName: 'test-project', Admin: 'testuser', Username: 'testuser' },
      ]),
    };

    global.sqlite3 = {
      Database: jest.fn((dbPath, cb) => {
        if (typeof cb === 'function') cb(null);
        return {
          all: jest.fn((sql, params, cb2) => {
            if (sql.includes('COUNT(*) as count') && sql.includes('NOT IN (SELECT IName FROM Labels)')) {
              return cb2(null, [{ count: 2 }]);
            }
            if (sql.includes('Images.IName') && sql.includes('NOT IN (SELECT IName FROM Labels)')) {
              return cb2(null, [{ IName: 'unlabeled1.jpg' }, { IName: 'unlabeled2.jpg' }]);
            }
            if (sql.includes('SELECT * FROM Labels WHERE IName')) {
              return cb2(null, []);
            }
            if (sql.includes('Classes')) {
              return cb2(null, [{ CName: 'cat' }]);
            }
            // The old INNER JOIN ... WHERE Labels.CName = ? path falls through to here and
            // returns no images - which is exactly the bug this test guards against.
            return cb2(null, []);
          }),
          close: jest.fn((cb2) => cb2 && cb2()),
        };
      }),
    };

    getReviewPage = require('../../routes/pages/getReviewPage');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('selects images with no Labels row and renders the review page in unlabeled mode', async () => {
    const req = {
      query: { class: UNLABELED_CLASS, IDX: '0' },
      cookies: { Username: 'testuser' },
    };
    const res = { render: jest.fn(), redirect: jest.fn() };

    await getReviewPage(req, res);

    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.render).toHaveBeenCalledWith('review', expect.objectContaining({
      isUnlabeledMode: true,
      displayClassName: 'Unlabeled',
      unlabeledClass: UNLABELED_CLASS,
      images: [{ IName: 'unlabeled1.jpg' }, { IName: 'unlabeled2.jpg' }],
      totalPageCount: 1,
    }));
  });
});
