const projectQueries = require('../../queries/projects/projects');

describe('queries.managed.updateProjectName (CEO-31)', () => {
  let runCalls;

  beforeEach(() => {
    runCalls = [];
    global.managedDbClient = {
      run: jest.fn((sql, params) => {
        runCalls.push({ sql, params });
        return Promise.resolve({ success: true, changes: 1 });
      }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('updates both Projects.PName and Access.PName for the renamed project, inside a transaction', async () => {
    await projectQueries.managed.updateProjectName('new-name', 'old-name', 'testuser');

    const statements = runCalls.map((c) => c.sql);
    expect(statements[0]).toMatch(/^BEGIN/i);
    expect(statements[statements.length - 1]).toMatch(/^COMMIT/i);

    const projectsUpdate = runCalls.find((c) => c.sql.includes('UPDATE Projects'));
    expect(projectsUpdate).toBeDefined();
    expect(projectsUpdate.params).toEqual(['new-name', 'old-name', 'testuser']);

    const accessUpdate = runCalls.find((c) => c.sql.includes('UPDATE Access'));
    expect(accessUpdate).toBeDefined();
    expect(accessUpdate.sql).toMatch(/SET PName = \?/);
    expect(accessUpdate.params).toEqual(['new-name', 'old-name', 'testuser']);
  });

  it('rolls back and propagates the error when the Access update fails, leaving no stale writes committed', async () => {
    global.managedDbClient.run = jest.fn((sql, params) => {
      runCalls.push({ sql, params });
      if (sql.includes('UPDATE Access')) {
        return Promise.reject(new Error('disk full'));
      }
      return Promise.resolve({ success: true, changes: 1 });
    });

    await expect(
      projectQueries.managed.updateProjectName('new-name', 'old-name', 'testuser'),
    ).rejects.toThrow('disk full');

    const statements = runCalls.map((c) => c.sql);
    expect(statements.some((sql) => /^ROLLBACK/i.test(sql))).toBe(true);
    expect(statements.some((sql) => /^COMMIT/i.test(sql))).toBe(false);
  });
});
