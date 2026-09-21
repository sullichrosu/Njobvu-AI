const fs = require('fs');
const os = require('os');
const path = require('path');
const loadProjectDbClients = require('../../utils/loadProjectDbClients');

function makeLogger() {
  return { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

describe('loadProjectDbClients', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'njobvu-projects-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeProject(name, files = [`${name}.db`]) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    for (const f of files) fs.writeFileSync(path.join(dir, f), '');
    return dir;
  }

  it('opens and migrates every project database', () => {
    const a = makeProject('a');
    const b = makeProject('b');
    const clients = {};
    const migrate = jest.fn().mockResolvedValue();

    const loaded = loadProjectDbClients(root, {
      createClient: (file) => ({ file }),
      migrateProjectDb: migrate,
      clients,
      logger: makeLogger(),
    });

    expect(loaded).toBe(2);
    expect(clients[a]).toEqual({ file: path.join(a, 'a.db') });
    expect(clients[b]).toEqual({ file: path.join(b, 'b.db') });
    expect(migrate).toHaveBeenCalledWith(a);
    expect(migrate).toHaveBeenCalledWith(b);
  });

  it('skips a stray file next to the project folders instead of throwing ENOTDIR', () => {
    makeProject('good');
    fs.writeFileSync(path.join(root, '.DS_Store'), '');
    const clients = {};

    expect(() => loadProjectDbClients(root, {
      createClient: (file) => ({ file }),
      migrateProjectDb: jest.fn().mockResolvedValue(),
      clients,
      logger: makeLogger(),
    })).not.toThrow();

    expect(Object.keys(clients)).toEqual([path.join(root, 'good')]);
  });

  it('carries on past a database that fails to open', () => {
    const bad = makeProject('bad');
    const good = makeProject('good');
    const logger = makeLogger();
    const clients = {};

    const loaded = loadProjectDbClients(root, {
      createClient: (file) => {
        if (file.startsWith(bad)) throw new Error('SQLITE_CANTOPEN');
        return { file };
      },
      migrateProjectDb: jest.fn().mockResolvedValue(),
      clients,
      logger,
    });

    expect(loaded).toBe(1);
    expect(clients[good]).toBeDefined();
    expect(clients[bad]).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SQLITE_CANTOPEN'));
  });

  it('downgrades a read-only migration failure to a warning and logs others as errors', async () => {
    makeProject('ro');
    makeProject('broken');
    const logger = makeLogger();
    const migrate = jest.fn((projectPath) => Promise.reject(
      projectPath.endsWith('ro') ? { error: { code: 'SQLITE_READONLY' } } : new Error('disk I/O error'),
    ));

    loadProjectDbClients(root, { createClient: (f) => ({ f }), migrateProjectDb: migrate, clients: {}, logger });
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('read-only'));
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('disk I/O error'));
  });

  it('survives a migration function that throws synchronously', () => {
    makeProject('a');
    const logger = makeLogger();

    expect(() => loadProjectDbClients(root, {
      createClient: (f) => ({ f }),
      migrateProjectDb: () => { throw new Error('sync migrate failure'); },
      clients: {},
      logger,
    })).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('sync migrate failure'));
  });

  it('returns 0 when the projects directory is unreadable', () => {
    const logger = makeLogger();

    const loaded = loadProjectDbClients(path.join(root, 'missing'), {
      createClient: jest.fn(), migrateProjectDb: jest.fn(), clients: {}, logger,
    });

    expect(loaded).toBe(0);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
