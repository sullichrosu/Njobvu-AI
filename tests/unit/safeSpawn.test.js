const safeSpawn = require('../../utils/safeSpawn');

describe('safeSpawn', () => {
  beforeEach(() => {
    global.logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  });

  it('does not throw an uncaught exception when the binary does not exist', async () => {
    const uncaught = jest.fn();
    process.on('uncaughtException', uncaught);

    try {
      const child = safeSpawn('/nonexistent/binary', ['--version']);
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      const code = await new Promise((resolve) => child.on('close', resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(code).not.toBe(0);
      expect(stderr).toMatch(/Failed to run '\/nonexistent\/binary'.*ENOENT/);
      expect(global.logger.error).toHaveBeenCalledTimes(1);
      expect(uncaught).not.toHaveBeenCalled();
    } finally {
      process.removeListener('uncaughtException', uncaught);
    }
  });

  it('behaves like spawn for a command that works', async () => {
    const child = safeSpawn(process.execPath, ['-e', 'process.stdout.write("hi")']);
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });

    const code = await new Promise((resolve) => child.on('close', resolve));

    expect(code).toBe(0);
    expect(stdout).toBe('hi');
    expect(global.logger.error).not.toHaveBeenCalled();
  });
});
