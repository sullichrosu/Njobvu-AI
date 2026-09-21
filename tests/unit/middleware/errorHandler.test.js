const { errorHandler, notFoundHandler, resolveStatus } = require('../../../middleware/errorHandler');

function mockRes(overrides = {}) {
  const res = {
    headersSent: false,
    writableEnded: false,
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    type: jest.fn(() => res),
    render: jest.fn(),
    ...overrides,
  };
  return res;
}

function mockReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/x',
    path: '/x',
    xhr: false,
    cookies: {},
    socket: { destroy: jest.fn() },
    is: jest.fn(() => false),
    accepts: jest.fn(() => 'html'),
    ...overrides,
  };
}

describe('errorHandler', () => {
  beforeEach(() => {
    global.logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
  });

  describe('resolveStatus', () => {
    it.each([
      [{ status: 400 }, 400],
      [{ statusCode: 413 }, 413],
      [{ status: 200 }, 500],
      [{ status: 'nope' }, 500],
      [{ code: 'SQLITE_BUSY' }, 503],
      [{ error: { code: 'SQLITE_LOCKED' } }, 503],
      [{ code: 'ENOENT' }, 500],
      [new Error('plain'), 500],
      [undefined, 500],
    ])('maps %j to %i', (err, expected) => {
      expect(resolveStatus(err)).toBe(expected);
    });
  });

  it('sends a JSON body without internals for a 500 on a non-GET request', () => {
    const res = mockRes();

    errorHandler(new Error('SELECT * FROM secrets failed at /srv/app/db.js:12'), mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/secrets|\/srv\/app/);
    expect(global.logger.error).toHaveBeenCalledTimes(1);
  });

  it('exposes the message of deliberate 4xx errors and logs them as warnings only', () => {
    const res = mockRes();
    const err = Object.assign(new Error('Unexpected token } in JSON'), { status: 400, expose: true });

    errorHandler(err, mockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Unexpected token } in JSON' });
    expect(global.logger.error).not.toHaveBeenCalled();
    expect(global.logger.warn).toHaveBeenCalledTimes(1);
  });

  it('renders the error view for a browser page request', () => {
    const res = mockRes();
    const req = mockReq({ method: 'GET', path: '/home', cookies: { Username: 'bob' } });

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.render).toHaveBeenCalledWith('error', expect.objectContaining({ title: '500', user: 'bob' }), expect.any(Function));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('falls back to plain text when the error view itself fails to render', () => {
    const res = mockRes();
    const req = mockReq({ method: 'GET', path: '/home' });
    res.render.mockImplementation((view, locals, cb) => cb(new Error('view missing')));

    errorHandler(new Error('boom'), req, res, jest.fn());

    expect(res.type).toHaveBeenCalledWith('text/plain');
    expect(res.send).toHaveBeenCalledWith(expect.any(String));
  });

  it('never writes a second response once headers are sent, and drops an unfinished one', () => {
    const res = mockRes({ headersSent: true, writableEnded: false });
    const req = mockReq();

    errorHandler(new Error('mid-stream'), req, res, jest.fn());

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(req.socket.destroy).toHaveBeenCalled();
  });

  it('leaves the connection alone when the response had already completed', () => {
    const res = mockRes({ headersSent: true, writableEnded: true });
    const req = mockReq();

    errorHandler(new Error('late failure'), req, res, jest.fn());

    expect(req.socket.destroy).not.toHaveBeenCalled();
    expect(global.logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('notFoundHandler', () => {
  it('answers with a JSON 404 for API-style requests', () => {
    const res = mockRes();

    notFoundHandler(mockReq({ path: '/api/nope' }), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.any(String) });
  });

  it('passes browser page requests on', () => {
    const next = jest.fn();
    const res = mockRes();

    notFoundHandler(mockReq({ method: 'GET', path: '/nope' }), res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.json).not.toHaveBeenCalled();
  });
});
