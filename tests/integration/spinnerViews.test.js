jest.mock('sqlite3', () => {
  const mockDb = {
    run: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null);
      return { lastID: 1, changes: 1 };
    }),
    get: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null, { user: 'testuser' });
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
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null);
      return mockDb;
    }),
    verbose: jest.fn().mockImplementation(() => mockModule),
  };
  return mockModule;
});

const request = require('supertest');
const app = require('../../app');

describe('LoadingSpinner Integration in EJS Views', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      getAsync: jest.fn().mockResolvedValue({ user: 'testuser' }),
      allAsync: jest.fn().mockResolvedValue([]),
    };
  });

  it('serves public/js/spinner.js static file', async () => {
    const res = await request(app).get('/js/spinner.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('LoadingSpinner');
  });

  it('includes /js/spinner.js in pages using header.ejs', async () => {
    const res = await request(app)
      .get('/create')
      .set('Cookie', ['user=testuser']);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('<script src="/js/spinner.js"></script>');
  });

  it('contains LoadingSpinner integrations in /create view', async () => {
    const res = await request(app)
      .get('/create')
      .set('Cookie', ['user=testuser']);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('LoadingSpinner.show(submitBtn');
    expect(res.text).toContain('s3SubmitBtn');
  });

  it('contains LoadingSpinner integrations in /createClassification view', async () => {
    const res = await request(app)
      .get('/createClassification')
      .set('Cookie', ['user=testuser']);
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('LoadingSpinner.show(submitBtn');
  });
});
