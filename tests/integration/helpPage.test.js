jest.mock('sqlite3', () => {
  const mockDb = {
    run: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null);
      return { lastID: 1, changes: 1 };
    }),
    get: jest.fn((...cbArgs) => {
      const cb = cbArgs[cbArgs.length - 1];
      if (typeof cb === 'function') cb(null, {});
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

describe('Help Page & Wiki Documentation Integration Tests', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      getAsync: jest.fn().mockResolvedValue({}),
      allAsync: jest.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /help', () => {
    it('should return 200 OK and render Wiki documentation page when logged in', async () => {
      const res = await request(app)
        .get('/help')
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('Documentation & Wiki');
      expect(res.text).toContain('wikiSearchInput');
      expect(res.text).toContain('Getting Started & Overview');
      expect(res.text).toContain('Project Setup & Archives');
      expect(res.text).toContain('Annotation & Labeling Workbench');
      expect(res.text).toContain('Model Training & Custom Scripts');
      expect(res.text).toContain('Inference & Active Learning');
    });

    it('should render help tooltip quick reference table', async () => {
      const res = await request(app)
        .get('/help')
        .set('Cookie', ['Username=testuser']);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('Key UI Tooltips Quick Reference');
      expect(res.text).toContain('Create Project');
      expect(res.text).toContain('Switch to Validation');
      expect(res.text).toContain('Min Confidence');
      expect(res.text).toContain('Add to Training Set');
    });

    it('should redirect unauthenticated users to login', async () => {
      const res = await request(app).get('/help');
      // header.ejs contains JS redirect if cookie Username is empty
      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('window.location.replace("/")');
    });
  });

  describe('GET /api/v2/help', () => {
    it('should return 200 OK with application/json data structure', async () => {
      const res = await request(app).get('/api/v2/help');

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data.topics)).toBe(true);
      expect(res.body.data.topics.length).toBeGreaterThan(0);
      expect(res.body.data.topics[0]).toHaveProperty('id');
      expect(res.body.data.topics[0]).toHaveProperty('title');
      expect(res.body.data.topics[0]).toHaveProperty('content');
    });

    it('should filter help topics by search query parameter', async () => {
      const res = await request(app).get('/api/v2/help?q=inference');

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.query).toBe('inference');
      expect(res.body.data.topics.length).toBeGreaterThan(0);

      const topicIds = res.body.data.topics.map(t => t.id);
      expect(topicIds).toContain('inference-runs');
    });
  });
});
