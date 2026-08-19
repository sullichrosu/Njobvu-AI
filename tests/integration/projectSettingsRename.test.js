// Regression coverage for CEO-31: renaming a project crashed getProjectSettingsPage
// because Access.PName went stale and IDX was trusted without validation.

jest.mock('decompress-zip', () => jest.fn());
jest.mock('decompress-zip/lib/extractors', () => ({
  folder: jest.fn(),
}));
jest.mock('ffmpeg', () => jest.fn());
jest.mock('sharp', () => jest.fn());
jest.mock('unzipper', () => jest.fn());
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));
jest.mock('socket.io-client', () => ({
  protocol: 'http',
}));

jest.mock('express-fileupload', () => jest.fn(() => (req, res, next) => {
  req.files = {
    upload_images: null,
    upload_video: null,
    upload_bootstrap: null,
  };
  next();
}));

jest.mock('node-stream-zip', () => jest.fn().mockImplementation(() => ({
  extract: jest.fn().mockResolvedValue(),
  close: jest.fn().mockResolvedValue(),
  on: jest.fn(),
})));

jest.mock('../../public/libraries/rimraf', () => jest.fn((path, callback) => callback(null)));
jest.mock('../../queries/client', () => ({
  Client: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../utils/unzipFile', () => jest.fn());
jest.mock('../../utils/pythonScript', () => jest.fn());

const request = require('supertest');
const app = require('../../app');
const queries = require('../../queries/queries');

// Mimics the real managedDbClient wrapper: .all() always resolves { success, rows },
// .get() resolves { success, row } where row is undefined on no match (queries.managed.sql
// tries .get() first for a SELECT, falling back to .all() when no row comes back).
function mockManagedDbClient({ accessRows = [], projectRow = undefined } = {}) {
  return {
    run: jest.fn().mockResolvedValue({ success: true, changes: 1 }),
    all: jest.fn((sql) => {
      if (sql.includes('Access')) {
        return Promise.resolve({ success: true, rows: accessRows });
      }
      return Promise.resolve({ success: true, rows: projectRow ? [projectRow] : [] });
    }),
    get: jest.fn((sql) => {
      if (sql.includes('Projects')) {
        return Promise.resolve({ success: true, row: projectRow });
      }
      return Promise.resolve({ success: true, row: undefined });
    }),
  };
}

describe('GET /config/projSettings after a project rename (CEO-31)', () => {
  beforeEach(() => {
    global.currentPath = '/test/path/';
    global.projectDbClients = {};
    global.colorsJSON = ['#FF0000', '#00FF00', '#0000FF'];
    global.readdirAsync = jest.fn().mockResolvedValue([]);
    global.managedDbClient = mockManagedDbClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows the new name after updateProjectName keeps Access.PName in sync with Projects.PName', async () => {
    // Exercise the real query implementation so the fix in
    // queries/projects/projects.js is what produces this state, not the test.
    await queries.managed.updateProjectName('renamed-project', 'old-project', 'testuser');

    expect(global.managedDbClient.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE Access'),
      ['renamed-project', 'old-project', 'testuser'],
    );

    // Access now reports the renamed project for this user's IDX=0 entry.
    global.managedDbClient = mockManagedDbClient({
      accessRows: [{ PName: 'renamed-project', Admin: 'testuser' }],
      projectRow: {
        PName: 'renamed-project',
        Admin: 'testuser',
        PDescription: 'a test project',
      },
    });

    const res = await request(app)
      .get('/config/projSettings?IDX=0')
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('renamed-project');
  });

  it('redirects home with an error instead of crashing when IDX is out of range', async () => {
    global.managedDbClient = mockManagedDbClient({ accessRows: [] });

    const res = await request(app)
      .get('/config/projSettings?IDX=1')
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/home?error=project_not_found');
  });

  it('redirects home with an error instead of crashing when IDX is not a number', async () => {
    global.managedDbClient = mockManagedDbClient({
      accessRows: [{ PName: 'some-project', Admin: 'testuser' }],
      projectRow: { PName: 'some-project', Admin: 'testuser', PDescription: 'desc' },
    });

    const res = await request(app)
      .get('/config/projSettings?IDX=not-a-number')
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/home?error=project_not_found');
  });

  it('redirects home with an error instead of crashing when the joined Projects row is missing', async () => {
    // Access still has a row (stale PName), but no Projects row joins on it.
    global.managedDbClient = mockManagedDbClient({
      accessRows: [{ PName: 'stale-name', Admin: 'testuser' }],
      projectRow: undefined,
    });

    const res = await request(app)
      .get('/config/projSettings?IDX=0')
      .set('Cookie', ['Username=testuser']);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/home?error=project_not_found');
  });
});
