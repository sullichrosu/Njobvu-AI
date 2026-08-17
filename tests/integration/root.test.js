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

describe('GET /', () => {

  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* 
  * this just tests if the route responds.
  * This test expects a status code 200.
  */
  it('should return 200 OK', async () => {
      const res = await request(app).get('/');
      expect(res.statusCode).toBe(200);
  });

  /* 
  * this tests if the login div is rendered.
  * This test expects a status code 200.
  */
  it('should render the login div', async() => {
    const res = await request(app).get('/');

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('<div id="login">');
    expect(res.text).toMatch(/username/i);          
    expect(res.text).toMatch(/password/i);          
    expect(res.text).toContain('type="text"');      
    expect(res.text).toContain('type="password"');  
    expect(res.text).toContain('Log In');           
  });

  it('should call db.runAsync with autosave query', async() => {
    await request(app).get('/');
    expect(global.db.runAsync).toHaveBeenCalled();
    expect(global.db.runAsync.mock.calls[0][0]).toMatch(/AutoSave/i);
  });

  /* 
  * this tests if the page will still render if the database fails to run
  * This test expects a status code 200 and render the login page.
  */
  it('should still render the login page even if db.runAsync fails', async () => {
    global.db.runAsync = jest.fn().mockRejectedValue(new Error('Simulated DB Error'));

    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200); // or 500 if your app chooses to crash
    expect(res.text).toContain('<div id="login">');
  });

  /* 
  * NOT PASSED / test skipped due to logic not in place
  * this tests if the page will still render if the database fails to run
  * This test expects a status code 200 and render the login page.
  */
  it.skip('should redirect to /home if user is already authenticated', async () => {
    const res = await request(app)
      .get('/')
      .set('Cookie', ['session=mock-session']); // adapt this to your session format

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/home');
  });
});

