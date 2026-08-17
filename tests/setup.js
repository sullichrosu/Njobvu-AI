// Global setup for tests to mock sqlite3 and avoid native binding compilation errors
jest.mock('sqlite3', () => {
  const mockDbInstance = {
    run: jest.fn((sql, params, cb) => {
      const callback = typeof params === 'function' ? params : cb;
      if (typeof callback === 'function') callback.call({ lastID: 1, changes: 1 }, null);
    }),
    get: jest.fn((sql, params, cb) => {
      const callback = typeof params === 'function' ? params : cb;
      if (typeof callback === 'function') callback(null, {});
    }),
    all: jest.fn((sql, params, cb) => {
      const callback = typeof params === 'function' ? params : cb;
      if (typeof callback === 'function') callback(null, []);
    }),
    close: jest.fn((cb) => {
      if (typeof cb === 'function') cb(null);
    }),
  };

  const mockDatabase = jest.fn((filename, mode, cb) => {
    const callback = typeof mode === 'function' ? mode : cb;
    if (typeof callback === 'function') callback(null);
    return mockDbInstance;
  });

  const sqlite3Mock = {
    OPEN_READWRITE: 1,
    OPEN_CREATE: 2,
    OPEN_FULLMUTEX: 4,
    Database: mockDatabase,
    verbose: () => sqlite3Mock,
  };

  return sqlite3Mock;
});
