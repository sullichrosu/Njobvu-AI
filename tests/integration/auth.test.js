// auth.test.js
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
const queries = require('../../queries/queries');
global.currentPath = process.cwd() + '/';
const bcrypt = require('bcryptjs');  

// Mock modules 
jest.mock('../../queries/queries', () => ({
  managed: {
    getUser: jest.fn().mockResolvedValue({
      row: { Username: 'testuser', Password: '$2a$10$someHashedValue' },
    }),
    checkUserExists: jest.fn().mockResolvedValue({
      row: { ExistingUsers: 0 },
    }),
    createUser: jest.fn().mockResolvedValue({
      row: { Username: 'newuser' },
    }),
  },
}));

jest.mock('bcryptjs', () => ({
  compareSync: jest.fn(() => true),   // default: password matches
  hash: jest.fn((password, rounds, callback) => {
    // Simulate successful hashing
    callback(null, '$2a$10$mockHashedPassword');
  }),
}));

// 👉 pull the mocked module into scope


// Tests

describe('GET /signup', () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([]),
    };
  });

  afterEach(() => jest.clearAllMocks());

  /* 
  * this just tests if the signup route responds.
  * This test expects a status code 200.
  */
  it('should return 200 OK', async () => {
    const res = await request(app).get('/signup');
    expect(res.statusCode).toBe(200);
  });

  /* 
  * this tests if the signup form elements are rendered.
  * This test expects a status code 200 and form fields to be present.
  */
  it('should render the signup page', async () => {
    const res = await request(app).get('/signup');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('name="Fname"');
    expect(res.text).toContain('name="Lname"');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toMatch(/First Name/i);
    expect(res.text).toMatch(/Last Name/i);
    expect(res.text).toMatch(/email/i);
    expect(res.text).toMatch(/username/i);
    expect(res.text).toMatch(/password/i);
    expect(res.text).toContain('type="text"');
    expect(res.text).toContain('type="password"');
    expect(res.text).toContain('type="submit"');
  });
});

describe('POST /login', () => {
  afterEach(() => jest.clearAllMocks());

  /* 
  * this tests if the login route responds with success for valid credentials.
  * This test expects a status code 200 and Success: 'Yes' in response body.
  */
  it('should respond with success for valid credentials', async () => {
    const res = await request(app).post('/login').send({
      username: 'testuser',
      password: 'validpassword',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.Success).toBe('Yes');
  });
});

describe('POST /login - invalid credentials', () => {
  beforeAll(() => {
    // tell the same mocked compareSync to fail this time
    bcrypt.compareSync.mockReturnValue(false);

    // override the user query to return a "real" hash
    jest.mock('../../queries/queries', () => ({
      managed: {
        getUser: jest.fn().mockResolvedValue({
          row: { Username: 'testuser', Password: '$2a$10$fakeHash' },
        }),
      },
    }));
  });

  afterEach(() => jest.clearAllMocks());

  /* 
  * this tests if the login route handles invalid credentials properly.
  * This test expects a status code 200 or 401 and Success: 'No' in response body.
  */
  it('should respond with 200 (or 401) and error message on invalid credentials', async () => {
    const res = await request(app).post('/login').send({
      username: 'testuser',
      password: 'wrongpassword',
    });
    expect([200, 401]).toContain(res.statusCode); 
    expect(res.body.Success).toBe('No');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('POST /signup – valid new user', () => {
  beforeAll(() => {
    // Reset mocks for this test
    queries.managed.getUser.mockResolvedValue({ row: undefined });
    queries.managed.checkUserExists.mockResolvedValue({ row: { ExistingUsers: 0 } });
    queries.managed.createUser.mockResolvedValue({ row: { Username: 'newuser' } });

    // db might be touched by the handler—stub it
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => jest.clearAllMocks());

  /* 
  * this tests if the signup route creates a new user successfully.
  * This test expects a status code 302 (redirect) to the home page.
  */
  it('returns 302 redirect on successful signup', async () => {
    const res = await request(app).post('/signup').send({
      Fname:    'Alice',
      Lname:    'Smith',
      email:    'alice@example.com',
      username: 'newuser',
      password: 'StrongPass123!',
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});


describe('POST /signup – existing user', () => {
  beforeAll(() => {
    // username already taken - checkUserExists returns count > 0
    queries.managed.checkUserExists.mockResolvedValue({ row: { ExistingUsers: 1 } });
    queries.managed.getUser.mockResolvedValue({ row: { Username: 'takenuser' } });

    // createUser should never run, but guard just in case
    queries.managed.createUser = jest.fn();

    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => jest.clearAllMocks());

  /* 
  * this tests if the signup route handles existing usernames properly.
  * This test expects a status code 409 and validation message about user already existing.
  */
  it('returns 409 and validation message "user exists"', async () => {
    const res = await request(app).post('/signup').send({
      Fname:    'Bob',
      Lname:    'Jones',
      email:    'bob@example.com',
      username: 'takenuser',
      password: 'SomePass456!',
    });

    console.log("response", res.statusCode);

    expect(res.statusCode).toBe(409);         
    expect(res.text).toMatch(/User with that username already exists/i);
  });
});
