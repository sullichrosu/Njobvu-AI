jest.mock('probe-image-size', () => ({
  sync: jest.fn(() => ({ width: 800, height: 600 })),
}));

const request = require('supertest');
const app = require('../../app');

global.fs = {
  existsSync: () => true,
  readFileSync: () => Buffer.from('test'),
};

jest.mock('../../queries/queries', () => ({
  managed: {
    getUserProjects: jest.fn().mockResolvedValue({
      rows: [{ PName: 'test-project', Admin: 'testuser', Username: 'testuser', AutoSave: 1 }],
    }),
    sql: jest.fn().mockResolvedValue({ rows: [{ AutoSave: 1 }], row: { AutoSave: 1 } }),
  },
  project: {
    getAllClasses: jest.fn().mockResolvedValue({ rows: [{ CName: 'cat' }] }),
    getAllImages: jest.fn().mockResolvedValue({ rows: [{ IName: 'test.jpg' }] }),
    getImage: jest.fn().mockResolvedValue({ row: { IName: 'test.jpg', reviewImage: 0, validateImage: 0 } }),
    getLabelsForImageName: jest.fn().mockResolvedValue({ rows: [] }),
    getImageClassMapping: jest.fn().mockResolvedValue({ rows: [] }),
    sql: jest.fn().mockImplementation((path, sqlQuery) => {
      if (sqlQuery.includes('ROW_NUMBER()')) {
        return Promise.resolve({ rows: [{ IName: 'test.jpg', display_id: 1 }] });
      }
      return Promise.resolve({ rows: [{ count: 0 }] });
    }),
  },
}));

describe('Strangler Fig Standardized Route Auditing', () => {
  beforeAll(() => {
    global.logger = { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  });

  const authCookie = ['Username=testuser'];

  it('GET /project/training and GET /training should both be supported', async () => {
    const resNew = await request(app).get('/project/training?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/training?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/inference and GET /inference should both be supported', async () => {
    const resNew = await request(app).get('/project/inference?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/inference?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/labeling and GET /labeling should both be supported', async () => {
    const resNew = await request(app).get('/project/labeling?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/labeling?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/stats and GET /stats should both be supported', async () => {
    const resNew = await request(app).get('/project/stats?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/stats?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/download and GET /download should both be supported', async () => {
    const resNew = await request(app).get('/project/download?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/download?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/review and GET /review should both be supported', async () => {
    const resNew = await request(app).get('/project/review?IDX=0&class=cat').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/review?IDX=0&class=cat').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });

  it('POST /updateLabels and POST /project/updateLabels should both be supported', async () => {
    const resNew = await request(app)
      .post('/project/updateLabels')
      .set('Cookie', authCookie)
      .send({ IDX: '0', IName: 'test.jpg', form_action: 'save' });
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app)
      .post('/updateLabels')
      .set('Cookie', authCookie)
      .send({ IDX: '0', IName: 'test.jpg', form_action: 'save' });
    expect(resOld.status).not.toBe(404);
  });

  it('GET /project/annotate and GET /annotate should both be supported (not 404)', async () => {
    const resNew = await request(app).get('/project/annotate?IDX=0').set('Cookie', authCookie);
    expect(resNew.status).not.toBe(404);

    const resOld = await request(app).get('/annotate?IDX=0').set('Cookie', authCookie);
    expect(resOld.status).not.toBe(404);
  });
});
