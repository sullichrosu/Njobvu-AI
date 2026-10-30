const request = require('supertest');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const app = require('../../app');
const { parseAnnotationCsv, TEMPLATES } = require('../../utils/parseAnnotationCsv');

const MAP_URL = '/api/v2/projects/map-annotations-csv';
const TEMPLATE_URL = `${MAP_URL}/template`;
const LEGACY_URL = '/api/projects/map-kwcoco-csv';

const PROJECT_NAME = 'csvv2testproj';
const projectDir = path.join(__dirname, '..', '..', 'public', 'projects', `admin-${PROJECT_NAME}`);
const imagesDir = path.join(projectDir, 'images');

/** Builds a minimal valid PNG (grey pixels) of the given size. */
function makePng(width, height) {
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(body));
        return Buffer.concat([length, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 0; // greyscale
    const raw = Buffer.alloc((width + 1) * height, 0x80);
    for (let row = 0; row < height; row++) raw[row * (width + 1)] = 0;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/** In-memory stand-in for the per-project sqlite client, backing the real queries module. */
function createFakeProjectDb({ classes = [], images = [], labels = [] } = {}) {
    const state = {
        classes: [...classes],
        images: [...images],
        labels: [...labels],
    };
    const asArray = (params) => (Array.isArray(params) ? params : [params]);

    return {
        state,
        open: jest.fn(),
        all: jest.fn(async (sql, params) => {
            if (/^PRAGMA/i.test(sql)) {
                return { success: true, rows: ['IName', 'reviewImage', 'validateImage', 'Source', 'SourceKey'].map(name => ({ name })) };
            }
            if (/FROM Classes/i.test(sql)) return { success: true, rows: state.classes.map(CName => ({ CName })) };
            if (/FROM Images/i.test(sql)) return { success: true, rows: state.images.map(IName => ({ IName })) };
            if (/MAX\(LID\)/i.test(sql)) {
                const last = [...state.labels].sort((a, b) => b.LID - a.LID)[0];
                return { success: true, rows: last ? [last] : [] };
            }
            if (/FROM Labels WHERE IName = \? AND CName = \?/i.test(sql)) {
                return { success: true, rows: state.labels.filter(l => l.IName === params[0] && l.CName === params[1]) };
            }
            return { success: true, rows: [] };
        }),
        get: jest.fn().mockResolvedValue({ success: true, row: null }),
        run: jest.fn(async (sql, params) => {
            const values = asArray(params);
            if (/INSERT INTO Classes/i.test(sql)) {
                state.classes.push(values[0]);
            } else if (/INSERT OR IGNORE INTO Images/i.test(sql)) {
                if (!state.images.includes(values[0])) state.images.push(values[0]);
            } else if (/INSERT INTO Labels/i.test(sql)) {
                const [LID, CName, X, Y, W, H, IName] = values;
                state.labels.push({ LID, CName, X, Y, W, H, IName });
            }
            return { success: true, changes: 1, lastID: 1 };
        }),
    };
}

function withProjectFields(req, { admin = 'admin', cookie = 'admin', projectName = PROJECT_NAME } = {}) {
    return req.set('Cookie', [`Username=${cookie}`]).field('PName', projectName).field('Admin', admin);
}

function uploadCsv(content, { filename = 'annotations.csv', ...options } = {}) {
    const req = withProjectFields(request(app).post(MAP_URL), options);
    return req.attach('annotation_csv', Buffer.isBuffer(content) ? content : Buffer.from(content), filename);
}

function expectJsonError(res, status, code) {
    expect(res.statusCode).toBe(status);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe(code);
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
}

describe('v2 annotations CSV mapping', () => {
    let db;

    beforeEach(() => {
        fs.mkdirSync(imagesDir, { recursive: true });
        db = createFakeProjectDb();
        global.projectDbClients = { [projectDir]: db };
    });

    afterEach(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    describe(`POST ${MAP_URL}`, () => {
        describe('detection files', () => {
            test('maps x,y,w,h rows and returns the response contract', async () => {
                const res = await uploadCsv([
                    'file_name,class_name,x,y,w,h',
                    'img1.jpg,dolphin,10,20,90,130',
                    'img1.jpg,shark,30,40,50,60',
                    'img2.jpg,dolphin,5,6,7,8',
                ].join('\n'));

                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toMatch(/application\/json/);
                expect(res.body).toEqual({
                    success: true,
                    message: expect.stringMatching(/Successfully mapped 3 detection annotations/),
                    mode: 'detection',
                    labelsInserted: 3,
                    classesAdded: 2,
                    imagesRegistered: 2,
                    rowsProcessed: 3,
                    rowsSkipped: 0,
                    duplicatesSkipped: 0,
                    errors: [],
                });

                expect(db.state.classes).toEqual(['dolphin', 'shark']);
                expect(db.state.images).toEqual(['img1.jpg', 'img2.jpg']);
                expect(db.state.labels).toEqual([
                    { LID: 1, CName: 'dolphin', X: 10, Y: 20, W: 90, H: 130, IName: 'img1.jpg' },
                    { LID: 2, CName: 'shark', X: 30, Y: 40, W: 50, H: 60, IName: 'img1.jpg' },
                    { LID: 3, CName: 'dolphin', X: 5, Y: 6, W: 7, H: 8, IName: 'img2.jpg' },
                ]);
            });

            test('maps corner-style columns and continues label ids after existing labels', async () => {
                db = createFakeProjectDb({
                    classes: ['dolphin'],
                    images: ['img1.jpg'],
                    labels: [{ LID: 41, CName: 'dolphin', X: 1, Y: 1, W: 1, H: 1, IName: 'img1.jpg' }],
                });
                global.projectDbClients = { [projectDir]: db };

                const res = await uploadCsv('filename,class,xmin,ymin,xmax,ymax\nimg1.jpg,dolphin,10,20,100,150');

                expect(res.statusCode).toBe(200);
                expect(res.body).toMatchObject({ labelsInserted: 1, classesAdded: 0, imagesRegistered: 0 });
                expect(db.state.labels[1]).toEqual({ LID: 42, CName: 'dolphin', X: 10, Y: 20, W: 90, H: 130, IName: 'img1.jpg' });
            });

            test('accepts the legacy field name used by the existing mapping form', async () => {
                const res = await withProjectFields(request(app).post(MAP_URL))
                    .attach('kwcoco_csv', Buffer.from('file_name,class_name,x,y,w,h\nimg1.jpg,dolphin,1,2,3,4'), 'annotations.csv');

                expect(res.statusCode).toBe(200);
                expect(res.body.labelsInserted).toBe(1);
            });

            test('still accepts header-less positional CSVs the legacy route supported', async () => {
                const res = await uploadCsv('img1.jpg,dolphin,10,20,100,150\nimg2.jpg,shark,30,40,80,120');

                expect(res.statusCode).toBe(200);
                expect(res.body).toMatchObject({ success: true, mode: 'detection', labelsInserted: 2 });
                expect(db.state.labels[0]).toMatchObject({ X: 10, Y: 20, W: 90, H: 130 });
            });

            test('imports valid rows and reports the skipped ones with line numbers', async () => {
                const res = await uploadCsv([
                    'file_name,class_name,x,y,w,h',
                    'good.jpg,dolphin,1,2,3,4',
                    'bad.jpg,dolphin,one,2,3,4',
                    'short.jpg,dolphin,1',
                ].join('\n'));

                expect(res.statusCode).toBe(200);
                expect(res.body).toMatchObject({ labelsInserted: 1, rowsProcessed: 3, rowsSkipped: 2 });
                expect(res.body.message).toMatch(/2 row\(s\) were skipped/);
                expect(res.body.errors).toEqual([
                    { line: 3, message: expect.stringMatching(/must all be numbers/) },
                    { line: 4, message: expect.stringMatching(/Expected 6 columns but found 3/) },
                ]);
            });

            test('produces the same stored labels as the legacy route for the same file', async () => {
                const csv = 'filename,class,xmin,ymin,xmax,ymax\nimg1.jpg,dolphin,10,20,100,150\nimg2.jpg,blue whale,30,40,80,120';

                const v2Res = await uploadCsv(csv);
                const v2State = JSON.parse(JSON.stringify(db.state));

                db = createFakeProjectDb();
                global.projectDbClients = { [projectDir]: db };
                const legacyRes = await withProjectFields(request(app).post(LEGACY_URL))
                    .attach('kwcoco_csv', Buffer.from(csv), 'annotations.csv');

                expect(legacyRes.statusCode).toBe(200);
                expect(v2State).toEqual(db.state);
                for (const key of ['success', 'labelsInserted', 'classesAdded', 'imagesRegistered']) {
                    expect(v2Res.body[key]).toEqual(legacyRes.body[key]);
                }
            });
        });

        describe('classification files (file_name + class_name only)', () => {
            beforeEach(() => {
                fs.writeFileSync(path.join(imagesDir, 'cat1.png'), makePng(64, 48));
                fs.writeFileSync(path.join(imagesDir, 'dog1.png'), makePng(20, 30));
            });

            test('labels each image as a whole using its real dimensions', async () => {
                const res = await uploadCsv('file_name,class_name\ncat1.png,cat\ndog1.png,dog\n');

                expect(res.statusCode).toBe(200);
                expect(res.headers['content-type']).toMatch(/application\/json/);
                expect(res.body).toEqual({
                    success: true,
                    message: expect.stringMatching(/Successfully mapped 2 classification annotations/),
                    mode: 'classification',
                    labelsInserted: 2,
                    classesAdded: 2,
                    imagesRegistered: 2,
                    rowsProcessed: 2,
                    rowsSkipped: 0,
                    duplicatesSkipped: 0,
                    errors: [],
                });
                expect(db.state.labels).toEqual([
                    { LID: 1, CName: 'cat', X: 0, Y: 0, W: 63, H: 47, IName: 'cat1.png' },
                    { LID: 2, CName: 'dog', X: 0, Y: 0, W: 19, H: 29, IName: 'dog1.png' },
                ]);
            });

            test('does not register images that are not in the project and reports them', async () => {
                const res = await uploadCsv('file_name,class_name\ncat1.png,cat\nmissing.png,cat\n');

                expect(res.statusCode).toBe(200);
                expect(res.body).toMatchObject({ labelsInserted: 1, imagesRegistered: 1, rowsSkipped: 1 });
                expect(res.body.errors).toEqual([
                    { line: 3, message: expect.stringMatching(/"missing\.png" was not found in the project/) },
                ]);
                expect(db.state.images).toEqual(['cat1.png']);
            });

            test('fails when none of the listed images exist', async () => {
                const res = await uploadCsv('file_name,class_name\nnope.png,cat\n');

                expectJsonError(res, 400, 'NO_VALID_ROWS');
                expect(res.body).toMatchObject({ mode: 'classification', rowsProcessed: 1, rowsSkipped: 1 });
                expect(db.state.labels).toEqual([]);
            });

            test('treats a non-image file with an image name as unreadable', async () => {
                fs.writeFileSync(path.join(imagesDir, 'fake.png'), 'not really an image');

                const res = await uploadCsv('file_name,class_name\nfake.png,cat\n');

                expectJsonError(res, 400, 'NO_VALID_ROWS');
                expect(db.state.labels).toEqual([]);
            });

            test('skips repeated rows and labels that already exist so re-uploads are safe', async () => {
                const csv = 'file_name,class_name\ncat1.png,cat\ncat1.png,cat\ndog1.png,dog\n';

                const first = await uploadCsv(csv);
                expect(first.body).toMatchObject({ labelsInserted: 2, duplicatesSkipped: 1 });

                const second = await uploadCsv(csv);
                expect(second.statusCode).toBe(200);
                expect(second.body).toMatchObject({ labelsInserted: 0, classesAdded: 0, imagesRegistered: 0, duplicatesSkipped: 3 });
                expect(db.state.labels).toHaveLength(2);
            });

            test('allows one image to carry several classes', async () => {
                const res = await uploadCsv('file_name,class_name\ncat1.png,cat\ncat1.png,animal\n');

                expect(res.body).toMatchObject({ labelsInserted: 2, imagesRegistered: 1, classesAdded: 2 });
            });

            test('never reads outside the project images folder', async () => {
                fs.writeFileSync(path.join(projectDir, 'outside.png'), makePng(10, 10));

                const res = await uploadCsv('file_name,class_name\n../outside.png,cat\n');

                expectJsonError(res, 400, 'NO_VALID_ROWS');
                expect(db.state.labels).toEqual([]);
            });
        });

        describe('malformed CSV', () => {
            test('rejects an unterminated quote and writes nothing', async () => {
                const res = await uploadCsv('file_name,class_name\n"img1.jpg,dolphin\n');

                expectJsonError(res, 400, 'MALFORMED_CSV');
                expect(res.body.line).toBe(2);
                expect(db.run).not.toHaveBeenCalled();
            });

            test('rejects a whitespace-only file', async () => {
                const res = await uploadCsv('   \n\n');

                expectJsonError(res, 400, 'EMPTY_CSV');
            });

            test('rejects a header-only file', async () => {
                const res = await uploadCsv('file_name,class_name\n');

                expectJsonError(res, 400, 'NO_VALID_ROWS');
                expect(res.body).toMatchObject({ rowsProcessed: 0, rowsSkipped: 0, errors: [] });
            });

            test('rejects a file where every row is invalid, listing the reasons', async () => {
                const res = await uploadCsv('file_name,class_name,x,y,w,h\na.jpg,cat,x,2,3,4\nb.jpg,cat,1,2,-3,4\n');

                expectJsonError(res, 400, 'NO_VALID_ROWS');
                expect(res.body.errors).toHaveLength(2);
                expect(res.body.rowsSkipped).toBe(2);
            });

            test('rejects binary payloads before parsing', async () => {
                const res = await uploadCsv(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));

                expectJsonError(res, 400, 'INVALID_FILE');
                expect(db.run).not.toHaveBeenCalled();
            });

            test('rejects unsupported file extensions', async () => {
                const res = await uploadCsv('{"images": []}', { filename: 'annotations.json' });

                expectJsonError(res, 400, 'UNSUPPORTED_FILE_TYPE');
            });
        });

        describe('missing columns', () => {
            test('names the missing class_name column and echoes the columns it found', async () => {
                const res = await uploadCsv('file_name,x,y,w,h\nimg1.jpg,1,2,3,4');

                expectJsonError(res, 400, 'MISSING_COLUMNS');
                expect(res.body.missingColumns).toEqual(['class_name']);
                expect(res.body.foundColumns).toEqual(['file_name', 'x', 'y', 'w', 'h']);
                expect(res.body.message).toMatch(/class_name/);
                expect(res.body.message).toMatch(/example CSV/i);
            });

            test('names the missing file_name column', async () => {
                const res = await uploadCsv('class_name\ncat\n');

                expectJsonError(res, 400, 'MISSING_COLUMNS');
                expect(res.body.missingColumns).toEqual(['file_name']);
            });

            test('names every missing bounding box column', async () => {
                const res = await uploadCsv('file_name,class_name,x\nimg1.jpg,cat,1');

                expectJsonError(res, 400, 'MISSING_COLUMNS');
                expect(res.body.missingColumns).toEqual(['y (or ymin)', 'w (or xmax)', 'h (or ymax)']);
            });

            test('tells the user a header row is required when the file has none', async () => {
                const res = await uploadCsv('img1.jpg,dolphin\nimg2.jpg,shark\n');

                expectJsonError(res, 400, 'MISSING_COLUMNS');
                expect(res.body.headerless).toBe(true);
                expect(res.body.message).toMatch(/header row/);
                expect(db.run).not.toHaveBeenCalled();
            });
        });

        describe('request validation', () => {
            test('returns 400 when the project name is missing', async () => {
                const res = await request(app).post(MAP_URL).set('Cookie', ['Username=admin'])
                    .attach('annotation_csv', Buffer.from('file_name,class_name\na.jpg,cat'), 'a.csv');

                expectJsonError(res, 400, 'MISSING_PROJECT_NAME');
            });

            test('returns 400 when no file is uploaded', async () => {
                const res = await withProjectFields(request(app).post(MAP_URL));

                expectJsonError(res, 400, 'NO_FILE');
            });

            test.each([['../escape'], ['a/b'], ['..']])('rejects project name %p that could escape the projects folder', async (projectName) => {
                const res = await uploadCsv('file_name,class_name\na.jpg,cat', { projectName });

                expectJsonError(res, 400, 'INVALID_PROJECT');
            });

            test('returns 403 when the caller is not the project admin', async () => {
                const res = await uploadCsv('file_name,class_name\na.jpg,cat', { cookie: 'someone-else' });

                expectJsonError(res, 403, 'FORBIDDEN');
                expect(db.run).not.toHaveBeenCalled();
            });

            test('returns 404 when the project does not exist', async () => {
                const res = await uploadCsv('file_name,class_name,x,y,w,h\na.jpg,cat,1,2,3,4', { projectName: 'no_such_project' });

                expectJsonError(res, 404, 'PROJECT_NOT_FOUND');
            });

            test('returns a JSON 500 when the database fails', async () => {
                db.run.mockRejectedValueOnce({ error: new Error('disk I/O error') });

                const res = await uploadCsv('file_name,class_name,x,y,w,h\na.jpg,cat,1,2,3,4');

                expectJsonError(res, 500, 'INTERNAL_ERROR');
                expect(res.body.message).toMatch(/disk I\/O error/);
            });
        });
    });

    describe(`GET ${TEMPLATE_URL}`, () => {
        test.each(Object.keys(TEMPLATES))('serves the %s example as a downloadable CSV that passes validation', async (type) => {
            const res = await request(app).get(TEMPLATE_URL).query({ type });

            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toMatch(/text\/csv/);
            expect(res.headers['content-disposition']).toBe(`attachment; filename="${TEMPLATES[type].filename}"`);
            expect(res.text).toBe(TEMPLATES[type].content);

            const parsed = parseAnnotationCsv(res.text);
            expect(parsed.errors).toEqual([]);
            expect(parsed.rows.length).toBeGreaterThan(0);
        });

        test('defaults to the detection example', async () => {
            const res = await request(app).get(TEMPLATE_URL);

            expect(res.statusCode).toBe(200);
            expect(res.text.split('\n')[0]).toBe('file_name,class_name,x,y,w,h');
        });

        test('rejects unknown template types with a JSON error', async () => {
            const res = await request(app).get(TEMPLATE_URL).query({ type: 'nope' });

            expectJsonError(res, 400, 'INVALID_TEMPLATE_TYPE');
            expect(res.body.message).toMatch(/detection, detection-corners, classification/);
        });

        test('does not treat prototype property names as template types', async () => {
            const res = await request(app).get(TEMPLATE_URL).query({ type: 'constructor' });

            expectJsonError(res, 400, 'INVALID_TEMPLATE_TYPE');
        });
    });
});
