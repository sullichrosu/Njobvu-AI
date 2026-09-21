const { EventEmitter } = require('events');
const { installProcessGuards, handleServerListenError, installGracefulShutdown } = require('../../utils/processGuards');

function makeLogger() {
  return { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

describe('installProcessGuards', () => {
  it('logs an unhandled rejection and keeps the process alive', () => {
    const proc = new EventEmitter();
    const logger = makeLogger();
    const exit = jest.fn();
    installProcessGuards({ logger, proc, exit });

    proc.emit('unhandledRejection', new Error('lost promise'));
    proc.emit('unhandledRejection', 'a string reason');

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error.mock.calls[1][0].message).toMatch(/a string reason/);
    expect(exit).not.toHaveBeenCalled();
  });

  it('survives occasional uncaught exceptions', () => {
    const proc = new EventEmitter();
    const exit = jest.fn();
    installProcessGuards({ logger: makeLogger(), proc, exit, maxUncaught: 3 });

    for (let i = 0; i < 3; i++) proc.emit('uncaughtException', new Error(`oops ${i}`));

    expect(exit).not.toHaveBeenCalled();
  });

  it('exits once uncaught exceptions repeat inside the window', () => {
    const proc = new EventEmitter();
    const exit = jest.fn();
    installProcessGuards({ logger: makeLogger(), proc, exit, maxUncaught: 3, now: () => 1000 });

    for (let i = 0; i < 4; i++) proc.emit('uncaughtException', new Error(`oops ${i}`));

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not count exceptions that fall outside the window', () => {
    const proc = new EventEmitter();
    const exit = jest.fn();
    let clock = 0;
    installProcessGuards({ logger: makeLogger(), proc, exit, maxUncaught: 2, windowMs: 1000, now: () => clock });

    for (let i = 0; i < 6; i++) {
      clock += 2000;
      proc.emit('uncaughtException', new Error(`spread out ${i}`));
    }

    expect(exit).not.toHaveBeenCalled();
  });

  it('removes its listeners when uninstalled', () => {
    const proc = new EventEmitter();
    const uninstall = installProcessGuards({ logger: makeLogger(), proc, exit: jest.fn() });

    uninstall();

    expect(proc.listenerCount('unhandledRejection')).toBe(0);
    expect(proc.listenerCount('uncaughtException')).toBe(0);
  });
});

describe('handleServerListenError', () => {
  it('explains EADDRINUSE in one line and exits non-zero', () => {
    const server = new EventEmitter();
    const logger = makeLogger();
    const exit = jest.fn();
    handleServerListenError(server, { port: 3000, logger, exit });

    server.emit('error', Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }));

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Port 3000 is already in use'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs any other listen error and exits non-zero', () => {
    const server = new EventEmitter();
    const logger = makeLogger();
    const exit = jest.fn();
    handleServerListenError(server, { port: 3000, logger, exit });

    server.emit('error', new Error('something else'));

    expect(logger.error).toHaveBeenCalledWith(expect.any(Error), { source: 'server' });
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe('installGracefulShutdown', () => {
  it('closes the server on SIGTERM and exits 0, once even if signalled twice', () => {
    const proc = new EventEmitter();
    const server = { close: jest.fn((cb) => cb()) };
    const exit = jest.fn();
    installGracefulShutdown(server, { logger: makeLogger(), proc, exit });

    proc.emit('SIGTERM');
    proc.emit('SIGINT');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('exits non-zero if connections do not drain in time', () => {
    jest.useFakeTimers();
    try {
      const proc = new EventEmitter();
      const server = { close: jest.fn() };
      const exit = jest.fn();
      installGracefulShutdown(server, { logger: makeLogger(), proc, exit, timeoutMs: 5000 });

      proc.emit('SIGTERM');
      expect(exit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(5000);

      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('exits non-zero when close reports an error', () => {
    const proc = new EventEmitter();
    const server = { close: jest.fn((cb) => cb(new Error('not running'))) };
    const exit = jest.fn();
    installGracefulShutdown(server, { logger: makeLogger(), proc, exit });

    proc.emit('SIGINT');

    expect(exit).toHaveBeenCalledWith(1);
  });
});
