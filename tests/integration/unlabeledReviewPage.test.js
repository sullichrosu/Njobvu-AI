// Regression test for the "unlabeled" bucket's redirect target: clicking the bucket on the
// labeling page sends the user to /review?class=<sentinel>, which must select Images with no
// matching Labels row at all (the normal INNER JOIN ... WHERE Labels.CName = ? path returns
// nothing for those images, since they have no Labels row to join against).

const UNLABELED_CLASS = require('../../utils/unlabeledClass');

jest.mock('../../queries/queries', () => ({
  managed: {
    getUserProjects: jest.fn().mockResolvedValue({
      rows: [{ PName: 'test-project', Admin: 'testuser', Username: 'testuser' }],
    }),
  },
  project: {
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'cat' }] }),
    getLabelsForImageName: jest.fn().mockResolvedValue({ rows: [] }),
    sql: jest.fn((projectPath, sql) => {
      if (sql.includes('COUNT(*) as count') && sql.includes('NOT IN (SELECT IName FROM Labels)')) {
        return Promise.resolve({ rows: [{ count: 2 }] });
      }
      if (sql.includes('Images.IName') && sql.includes('NOT IN (SELECT IName FROM Labels)')) {
        return Promise.resolve({ rows: [{ IName: 'unlabeled1.jpg' }, { IName: 'unlabeled2.jpg' }] });
      }
      // The old INNER JOIN ... WHERE Labels.CName = ? path falls through to here and
      // returns no images - which is exactly the bug this test guards against.
      return Promise.resolve({ rows: [] });
    }),
  },
}));

describe('GET /review - unlabeled bucket', () => {
  let getReviewPage;

  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.currentPath = '/test/path/';

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
