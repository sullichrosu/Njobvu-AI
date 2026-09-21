// Failure paths through the real Express app: errors must come back as
// well-formed error responses and must never take the server down.

jest.mock('../../queries/queries', () => ({
  managed: {
    getUser: jest.fn(),
  },
  project: {},
}));
jest.mock('../../utils/unzipFile', () => jest.fn().mockResolvedValue(undefined));
jest.mock('../../utils/config', () => ({
  ...jest.requireActual('../../utils/config'),
  default_python_path: '/nonexistent/python-for-error-handling-test',
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../app');
const queries = require('../../queries/queries');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'public', 'projects');
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'tmp', 'uploads');

function expectErrorContract(res, status) {
  expect(res.statusCode).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({ success: false, message: expect.any(String) });
}

describe('error handling', () => {
  let loggerSpy;

  beforeEach(() => {
    // the error path logs at error level by design; keep test output readable
    loggerSpy = jest.spyOn(global.logger, 'error').mockImplementation(() => {});
    jest.spyOn(global.logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    queries.managed.getUser.mockReset();
    fs.rmSync(path.join(PROJECTS_DIR, 'testuser-error-handling-project'), { recursive: true, force: true });
    if (fs.existsSync(UPLOADS_DIR)) {
      for (const entry of fs.readdirSync(UPLOADS_DIR)) {
        if (entry.endsWith('-error-handling.zip')) {
          fs.rmSync(path.join(UPLOADS_DIR, entry), { recursive: true, force: true });
        }
      }
    }
  });

  describe('malformed requests', () => {
    it('answers a malformed JSON body with a 400 JSON error and no stack trace', async () => {
      const res = await request(app)
        .post('/login')
        .set('Content-Type', 'application/json')
        .send('{"username": "bob", ');

      expectErrorContract(res, 400);
      expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|node_modules|at .*\.js/);
      expect(loggerSpy).not.toHaveBeenCalled();
    });

    it('answers an unknown POST route with a JSON 404', async () => {
      const res = await request(app).post('/this-route-does-not-exist').send({});

      expectErrorContract(res, 404);
    });

    it('still renders the HTML 404 page for an unknown GET page', async () => {
      const res = await request(app).get('/this-page-does-not-exist').set('Accept', 'text/html');

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('404');
    });
  });

  describe('async handler failures', () => {
    // login() calls bcrypt.compareSync outside its try/catch, which throws for a
    // missing password; that rejection used to escape as an unhandled rejection.
    it('turns a rejected async handler into a 500 JSON error and keeps serving', async () => {
      queries.managed.getUser.mockResolvedValue({ row: { Password: 'stored-hash' } });

      const failed = await request(app).post('/login').send({ username: 'bob' });

      expectErrorContract(failed, 500);
      expect(failed.body.message).not.toMatch(/Illegal arguments|bcrypt/i);
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ method: 'POST', url: '/login', status: 500 }));

      const stillUp = await request(app).post('/this-route-does-not-exist').send({});
      expectErrorContract(stillUp, 404);
    });

    it('turns a rejected page handler into an HTML error page', async () => {
      global.managedDbClient = { all: jest.fn().mockRejectedValue(new Error('database is locked: SELECT * FROM Access')) };

      const res = await request(app).get('/home').set('Accept', 'text/html').set('Cookie', ['Username=bob']);

      expect(res.statusCode).toBe(500);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('An unexpected error occurred');
      expect(res.text).not.toContain('SELECT * FROM Access');

      delete global.managedDbClient;
    });

    it('reports transient database contention as 503 so clients can retry', async () => {
      const busy = Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' });
      queries.managed.getUser.mockResolvedValue({ row: { Password: 'stored-hash' } });
      jest.spyOn(require('bcryptjs'), 'compareSync').mockImplementation(() => {
        throw busy;
      });

      const res = await request(app).post('/login').send({ username: 'bob', password: 'pw' });

      expectErrorContract(res, 503);
      expect(res.body.message).not.toMatch(/SQLITE/);
    });
  });

  describe('child process failures', () => {
    it('reports an unlaunchable Python binary as a 500 JSON error instead of crashing the server', async () => {
      const res = await request(app)
        .post('/api/projects/import-yolo')
        .field('project_name', 'error-handling-project')
        .attach('yolo_archive', Buffer.from('not really a zip'), 'error-handling.zip')
        .set('Cookie', ['Username=testuser']);

      expectErrorContract(res, 500);
      expect(res.body.message).toMatch(/Failed to run '\/nonexistent\/python-for-error-handling-test'/);

      const stillUp = await request(app).post('/this-route-does-not-exist').send({});
      expectErrorContract(stillUp, 404);
    });
  });
});
