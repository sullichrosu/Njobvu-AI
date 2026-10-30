// Regression test for the "unlabeled" bucket on the labeling page: images with zero rows in
// Labels must be counted and reported separately from the Classes-driven rows, without being
// folded into any class's count.

const UNLABELED_CLASS = require('../../utils/unlabeledClass');

jest.mock('../../queries/queries', () => ({
  managed: {
    getUserProjects: jest.fn().mockResolvedValue({
      rows: [{ PName: 'test-project', Admin: 'testuser', Username: 'testuser' }],
    }),
  },
  project: {
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'cat' }] }),
    sql: jest.fn((projectPath, sql) => {
      if (sql.includes('NOT IN (SELECT IName FROM Labels)')) {
        return Promise.resolve({ rows: [{ count: 4 }] });
      }
      if (sql.includes('COUNT(*) as count FROM Labels WHERE CName')) {
        return Promise.resolve({ rows: [{ count: 7 }] });
      }
      return Promise.resolve({ rows: [{ count: 0 }] });
    }),
  },
}));

describe('GET /labeling - unlabeled bucket', () => {
  let getLabelingPage;

  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    global.currentPath = '/test/path/';

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
