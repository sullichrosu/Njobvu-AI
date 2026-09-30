const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../app');

const ADMIN = 'admin';
const PROJECT_NAME = 'labelauthorstestproj';
const IMAGE_NAME = 'img1.jpg';
const projectDir = path.join(__dirname, '..', '..', 'public', 'projects', `${ADMIN}-${PROJECT_NAME}`);

const LABELS_URL = `/api/v2/projects/${ADMIN}/${PROJECT_NAME}/images/${IMAGE_NAME}/labels`;
const IMAGE_HISTORY_URL = `${LABELS_URL}/history`;
const labelHistoryUrl = (lid) => `/api/v2/projects/${ADMIN}/${PROJECT_NAME}/labels/${lid}/history`;

/** In-memory stand-in for the per-project sqlite client, backing the real queries module. */
function createFakeProjectDb() {
    const state = {
        labels: [],
        labelHistory: [],
        nextHistoryId: 1,
    };

    return {
        state,
        open: jest.fn(),
        all: jest.fn(async (sql, params = []) => {
            if (/PRAGMA table_info\(Images\)/i.test(sql)) {
                return { success: true, rows: ['IName', 'reviewImage', 'validateImage', 'Source', 'SourceKey'].map((name) => ({ name })) };
            }
            if (/PRAGMA table_info\(Labels\)/i.test(sql)) {
                return { success: true, rows: ['LID', 'CName', 'X', 'Y', 'W', 'H', 'IName'].map((name) => ({ name })) };
            }
            if (/SELECT \* FROM Labels WHERE LID = \(SELECT MAX\(LID\)/i.test(sql)) {
                const last = [...state.labels].sort((a, b) => b.LID - a.LID)[0];
                return { success: true, rows: last ? [last] : [] };
            }
            if (/FROM Labels WHERE IName = \?$/i.test(sql.trim())) {
                return { success: true, rows: state.labels.filter((l) => l.IName === params[0]) };
            }
            if (/SELECT \* FROM LabelHistory WHERE LID = \?/i.test(sql)) {
                return {
                    success: true,
                    rows: state.labelHistory
                        .filter((h) => h.LID === params[0])
                        .sort((a, b) => a.HistoryId - b.HistoryId),
                };
            }
            if (/FROM LabelHistory INNER JOIN Labels/i.test(sql)) {
                const imageName = params[0];
                const labelsByLid = new Map(state.labels.map((l) => [l.LID, l]));
                const rows = state.labelHistory
                    .filter((h) => labelsByLid.has(h.LID) && labelsByLid.get(h.LID).IName === imageName)
                    .map((h) => ({ ...h, CName: labelsByLid.get(h.LID).CName, IName: labelsByLid.get(h.LID).IName }))
                    .sort((a, b) => (a.LID - b.LID) || (a.HistoryId - b.HistoryId));
                return { success: true, rows };
            }
            return { success: true, rows: [] };
        }),
        get: jest.fn().mockResolvedValue({ success: true, row: null }),
        run: jest.fn(async (sql, params = []) => {
            if (/^ALTER TABLE/i.test(sql)) {
                return { success: true, changes: 0, lastID: 0 };
            }
            if (/INSERT INTO Labels/i.test(sql)) {
                const [LID, CName, X, Y, W, H, IName, AuthorId, AuthorType] = params;
                state.labels.push({ LID, CName, X, Y, W, H, IName, AuthorId, AuthorType });
                return { success: true, changes: 1, lastID: LID };
            }
            if (/UPDATE Labels SET CName/i.test(sql)) {
                const [CName, X, Y, W, H, AuthorId, AuthorType, LID] = params;
                const label = state.labels.find((l) => l.LID === LID);
                if (label) Object.assign(label, { CName, X, Y, W, H, AuthorId, AuthorType });
                return { success: true, changes: label ? 1 : 0, lastID: 0 };
            }
            if (/DELETE FROM Labels WHERE LID = \?/i.test(sql)) {
                const before = state.labels.length;
                state.labels = state.labels.filter((l) => l.LID !== params[0]);
                return { success: true, changes: before - state.labels.length, lastID: 0 };
            }
            if (/INSERT INTO LabelHistory/i.test(sql)) {
                const [LID, AuthorId, AuthorType, Action, ChangedAt] = params;
                state.labelHistory.push({ HistoryId: state.nextHistoryId++, LID, AuthorId, AuthorType, Action, ChangedAt });
                return { success: true, changes: 1, lastID: 0 };
            }
            return { success: true, changes: 0, lastID: 0 };
        }),
    };
}

function asUser(req, username) {
    return req.set('Cookie', [`Username=${username}`]);
}

function expectJsonError(res, status, code) {
    expect(res.statusCode).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(code);
}

describe('v2 label author history', () => {
    let db;

    beforeEach(() => {
        fs.mkdirSync(projectDir, { recursive: true });
        db = createFakeProjectDb();
        global.projectDbClients = { [projectDir]: db };
        global.managedDbClient = {
            all: jest.fn(async (sql, params = []) => {
                if (/FROM Access WHERE Username = \? AND PName = \? AND Admin = \?/i.test(sql)) {
                    const [username, pname, adminParam] = params;
                    if (username === 'labeler' && pname === PROJECT_NAME && adminParam === ADMIN) {
                        return { success: true, rows: [{ Username: username, PName: pname, Admin: adminParam }] };
                    }
                    return { success: true, rows: [] };
                }
                return { success: true, rows: [] };
            }),
        };
    });

    afterEach(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    describe(`POST ${LABELS_URL}`, () => {
        test('creates new labels and records a "created" breadcrumb entry authored by the caller', async () => {
            const res = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                labels: [
                    { className: 'dolphin', x: 1, y: 2, w: 3, h: 4 },
                    { className: 'shark', x: 5, y: 6, w: 7, h: 8 },
                ],
            });

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({ success: true, created: 2, updated: 0, unchanged: 0, deleted: 0 });
            expect(db.state.labels).toHaveLength(2);
            expect(db.state.labels.every((l) => l.AuthorId === ADMIN && l.AuthorType === 'user')).toBe(true);
            expect(db.state.labelHistory).toEqual([
                expect.objectContaining({ LID: 1, AuthorId: ADMIN, Action: 'created' }),
                expect.objectContaining({ LID: 2, AuthorId: ADMIN, Action: 'created' }),
            ]);
        });

        test('supports a model author for bootstrapped annotations', async () => {
            const res = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                authorId: 'megadetector-v5',
                authorType: 'model',
                labels: [{ className: 'animal', x: 0, y: 0, w: 10, h: 10 }],
            });

            expect(res.statusCode).toBe(200);
            expect(db.state.labels[0]).toMatchObject({ AuthorId: 'megadetector-v5', AuthorType: 'model' });
            expect(db.state.labelHistory[0]).toMatchObject({ AuthorId: 'megadetector-v5', AuthorType: 'model', Action: 'created' });
        });

        test('re-saving an annotation unchanged keeps its original author and adds no breadcrumb entry', async () => {
            const create = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                authorId: 'megadetector-v5',
                authorType: 'model',
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });
            const lid = create.body.labels[0].lid;

            const resave = await asUser(request(app).post(LABELS_URL), 'labeler').send({
                labels: [{ lid, className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });

            expect(resave.statusCode).toBe(200);
            expect(resave.body).toMatchObject({ created: 0, updated: 0, unchanged: 1, deleted: 0 });
            expect(db.state.labels[0]).toMatchObject({ AuthorId: 'megadetector-v5', AuthorType: 'model' });
            expect(db.state.labelHistory).toHaveLength(1);
        });

        test('editing an annotation bumps its author and records a "modified" breadcrumb entry', async () => {
            const create = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                authorId: 'megadetector-v5',
                authorType: 'model',
                labels: [
                    { className: 'dolphin', x: 1, y: 2, w: 3, h: 4 },
                    { className: 'shark', x: 5, y: 6, w: 7, h: 8 },
                ],
            });
            const [dolphinLid, sharkLid] = create.body.labels.map((l) => l.lid);

            const edit = await asUser(request(app).post(LABELS_URL), 'labeler').send({
                labels: [
                    { lid: dolphinLid, className: 'dolphin', x: 99, y: 2, w: 3, h: 4 },
                    { lid: sharkLid, className: 'shark', x: 5, y: 6, w: 7, h: 8 },
                ],
            });

            expect(edit.statusCode).toBe(200);
            expect(edit.body).toMatchObject({ created: 0, updated: 1, unchanged: 1, deleted: 0 });

            const dolphin = db.state.labels.find((l) => l.LID === dolphinLid);
            const shark = db.state.labels.find((l) => l.LID === sharkLid);
            expect(dolphin).toMatchObject({ X: 99, AuthorId: 'labeler', AuthorType: 'user' });
            expect(shark).toMatchObject({ AuthorId: 'megadetector-v5', AuthorType: 'model' });

            expect(db.state.labelHistory).toEqual([
                expect.objectContaining({ LID: dolphinLid, Action: 'created', AuthorId: 'megadetector-v5' }),
                expect.objectContaining({ LID: sharkLid, Action: 'created', AuthorId: 'megadetector-v5' }),
                expect.objectContaining({ LID: dolphinLid, Action: 'modified', AuthorId: 'labeler' }),
            ]);
        });

        test('omitting a previously-saved lid deletes that label', async () => {
            const create = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });
            const lid = create.body.labels[0].lid;

            const res = await asUser(request(app).post(LABELS_URL), ADMIN).send({ labels: [] });

            expect(res.statusCode).toBe(200);
            expect(res.body).toMatchObject({ created: 0, updated: 0, unchanged: 0, deleted: 1 });
            expect(db.state.labels.find((l) => l.LID === lid)).toBeUndefined();
        });

        test('rejects a label missing className', async () => {
            const res = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                labels: [{ x: 1, y: 2, w: 3, h: 4 }],
            });

            expectJsonError(res, 400, 'INVALID_LABEL');
        });

        test('rejects non-numeric geometry', async () => {
            const res = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                labels: [{ className: 'dolphin', x: 'oops', y: 2, w: 3, h: 4 }],
            });

            expectJsonError(res, 400, 'INVALID_LABEL');
        });

        test('returns 403 for a user without project access', async () => {
            const res = await asUser(request(app).post(LABELS_URL), 'stranger').send({
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });

            expectJsonError(res, 403, 'FORBIDDEN');
            expect(db.run).not.toHaveBeenCalled();
        });

        test('allows a non-admin user with project access', async () => {
            const res = await asUser(request(app).post(LABELS_URL), 'labeler').send({
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });

            expect(res.statusCode).toBe(200);
            expect(db.state.labels[0]).toMatchObject({ AuthorId: 'labeler' });
        });

        test('returns 404 when the project does not exist', async () => {
            const res = await request(app)
                .post(`/api/v2/projects/${ADMIN}/no-such-project/images/${IMAGE_NAME}/labels`)
                .set('Cookie', [`Username=${ADMIN}`])
                .send({ labels: [] });

            expectJsonError(res, 404, 'PROJECT_NOT_FOUND');
        });
    });

    describe('breadcrumb history reads', () => {
        test(`GET ${IMAGE_HISTORY_URL} returns each annotation's breadcrumb trail in order`, async () => {
            const create = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                authorId: 'megadetector-v5',
                authorType: 'model',
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });
            const lid = create.body.labels[0].lid;

            await asUser(request(app).post(LABELS_URL), 'labeler').send({
                labels: [{ lid, className: 'dolphin', x: 99, y: 2, w: 3, h: 4 }],
            });

            const res = await asUser(request(app).get(IMAGE_HISTORY_URL), ADMIN);

            expect(res.statusCode).toBe(200);
            expect(res.body).toEqual({
                success: true,
                imageName: IMAGE_NAME,
                labels: [
                    {
                        lid,
                        className: 'dolphin',
                        history: [
                            { authorId: 'megadetector-v5', authorType: 'model', action: 'created', changedAt: expect.any(String) },
                            { authorId: 'labeler', authorType: 'user', action: 'modified', changedAt: expect.any(String) },
                        ],
                    },
                ],
            });
        });

        test(`GET ${labelHistoryUrl(':lid')} returns the breadcrumb for a single annotation`, async () => {
            const create = await asUser(request(app).post(LABELS_URL), ADMIN).send({
                labels: [{ className: 'dolphin', x: 1, y: 2, w: 3, h: 4 }],
            });
            const lid = create.body.labels[0].lid;

            const res = await asUser(request(app).get(labelHistoryUrl(lid)), ADMIN);

            expect(res.statusCode).toBe(200);
            expect(res.body.lid).toBe(lid);
            expect(res.body.history).toEqual([
                { authorId: ADMIN, authorType: 'user', action: 'created', changedAt: expect.any(String) },
            ]);
        });

        test('returns 403 for a history read from a user without access', async () => {
            const res = await asUser(request(app).get(IMAGE_HISTORY_URL), 'stranger');

            expectJsonError(res, 403, 'FORBIDDEN');
        });
    });
});
