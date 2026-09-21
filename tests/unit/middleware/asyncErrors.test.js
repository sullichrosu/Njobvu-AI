const express = require('express');
const request = require('supertest');
const { installAsyncErrorForwarding, wrapHandler } = require('../../../middleware/asyncErrors');

installAsyncErrorForwarding(express);

function buildApp(register) {
  const app = express();
  register(app);
  app.use((err, req, res, next) => {
    res.status(500).json({ caught: err.message });
  });
  return app;
}

describe('installAsyncErrorForwarding', () => {
  it('forwards a rejected async handler to the error handler', async () => {
    const app = buildApp((a) => a.get('/boom', async () => { throw new Error('async failure'); }));

    const res = await request(app).get('/boom');

    expect(res.statusCode).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ caught: 'async failure' });
  });

  it('forwards a synchronous throw', async () => {
    const app = buildApp((a) => a.post('/boom', () => { throw new Error('sync failure'); }));

    const res = await request(app).post('/boom');

    expect(res.body).toEqual({ caught: 'sync failure' });
  });

  it('wraps handlers on routers as well as on the app', async () => {
    const router = express.Router();
    router.delete('/boom', async () => { throw new Error('router failure'); });
    const app = buildApp((a) => a.use('/r', router));

    const res = await request(app).delete('/r/boom');

    expect(res.body).toEqual({ caught: 'router failure' });
  });

  it('wraps every handler in an array and in app.all', async () => {
    const app = buildApp((a) => {
      a.all('/chain', [(req, res, next) => next(), async () => { throw new Error('chained failure'); }]);
    });

    const res = await request(app).put('/chain');

    expect(res.body).toEqual({ caught: 'chained failure' });
  });

  it('leaves successful async handlers and their return values alone', async () => {
    const app = buildApp((a) => a.get('/ok', async (req, res) => { res.json({ ok: true }); }));

    const res = await request(app).get('/ok');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('does not turn a route-level error handler into a normal handler', async () => {
    const app = express();
    app.get('/x', (req, res, next) => next(new Error('original')), (err, req, res, next) => {
      res.status(418).json({ handled: err.message });
    });

    const res = await request(app).get('/x');

    expect(res.statusCode).toBe(418);
    expect(res.body).toEqual({ handled: 'original' });
  });

  it('keeps app.get(name) settings lookups working', () => {
    const app = express();
    app.set('view engine', 'ejs');

    expect(app.get('view engine')).toBe('ejs');
  });

  it('is idempotent: installing twice does not double-wrap', () => {
    installAsyncErrorForwarding(express);
    const fn = async () => {};
    const once = wrapHandler(fn);

    expect(wrapHandler(once)).toBe(once);
  });
});
