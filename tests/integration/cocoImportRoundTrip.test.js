// This suite runs the REAL controllers/imports/import_options.py (no
// child_process/fs mocking), because the KW Coco archive-import bug only
// shows up when the actual Python file-matching logic executes. The other
// coco import tests in projects.test.js mock the python spawn entirely, so
// they can't catch a regression here.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');

const IMPORT_SCRIPT = path.join(__dirname, '..', '..', 'controllers', 'imports', 'import_options.py');

function findPython() {
  for (const candidate of ['python3', 'python']) {
    const result = spawnSync(candidate, ['--version']);
    if (result.status === 0) return candidate;
  }
  throw new Error('No python interpreter found on PATH');
}

const QUERY_DB_SCRIPT = `
import json, sqlite3, sys
conn = sqlite3.connect(sys.argv[1])
cur = conn.cursor()
cur.execute(sys.argv[2])
cols = [d[0] for d in cur.description]
print(json.dumps([dict(zip(cols, row)) for row in cur.fetchall()]))
`;

// tests/setup.js mocks the `sqlite3` node module globally, so it can't be
// used from Jest to verify a DB file the real python importer just wrote.
// Query it via python's own stdlib sqlite3 module instead.
function queryDb(python, dbPath, sql) {
  const result = spawnSync(python, ['-c', QUERY_DB_SCRIPT, dbPath, sql], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`DB query failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

// Builds a fixture that mirrors exactly what routes/downloads/downloadDataset.js
// writes for downloadFormat == 2 (KW Coco): each image is archived under its
// literal IName, and image["file_name"] in the JSON is that same literal name.
function writeKwCocoFixture(dir, imageName) {
  fs.mkdirSync(dir, { recursive: true });

  // Minimal valid JPEG bytes are not required — the importer only reads
  // dimensions via PIL when parsing YOLO label files, not for COCO import.
  fs.writeFileSync(path.join(dir, imageName), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const cocoJson = {
    images: [{ id: 1, file_name: imageName, width: 10, height: 10 }],
    annotations: [{ id: 1, image_id: 1, category_id: 1, bbox: [1, 1, 5, 5] }],
    categories: [{ id: 1, name: 'cat' }],
  };
  fs.writeFileSync(path.join(dir, 'project_coco.json'), JSON.stringify(cocoJson));
}

describe('KW Coco archive round trip (real python import)', () => {
  let python;
  let tmpRoot;

  beforeAll(() => {
    python = findPython();
  });

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kwcoco-roundtrip-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('imports a KW Coco archive whose image name has no trailing digit suffix', async () => {
    const inputDir = path.join(tmpRoot, 'input');
    const outputDir = path.join(tmpRoot, 'output');
    writeKwCocoFixture(inputDir, 'cat.jpg');

    const result = spawnSync(python, [
      IMPORT_SCRIPT,
      '-i', inputDir,
      '-o', outputDir,
      '-d', 'testdb',
      '-r', 'coco',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'images', 'cat.jpg'))).toBe(true);

    const db = new sqlite3.Database(path.join(outputDir, 'testdb.db'), sqlite3.OPEN_READONLY);
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT IName FROM Images WHERE IName = ?', ['cat.jpg'], (err, r) => {
        db.close();
        if (err) reject(err); else resolve(r);
      });
    });
    expect(row).toBeTruthy();
  });

  it('still imports a KW Coco archive whose image name ends in digits', () => {
    const inputDir = path.join(tmpRoot, 'input');
    const outputDir = path.join(tmpRoot, 'output');
    writeKwCocoFixture(inputDir, 'frame_001.jpg');

    const result = spawnSync(python, [
      IMPORT_SCRIPT,
      '-i', inputDir,
      '-o', outputDir,
      '-d', 'testdb',
      '-r', 'coco',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'images', 'frame_001.jpg'))).toBe(true);
  });

  // CEO-46: an archive covering two videos whose own exporter numbered every
  // video's frames from 1 (e.g. VIAME-style "frame_000001.jpg" per video) has
  // two images that both expect that same file_name. Njobvu's own frame
  // extraction disambiguates these on disk as "<video>_1.jpg", so the
  // pre-processing step has to resolve each JSON image entry to its own
  // video's true frame file via KW Coco's video_id/frame_index, not the
  // (colliding) file_name string.
  it('maps a multi-video KW Coco archive to each video\'s true Njobvu frame name, without collision', () => {
    const inputDir = path.join(tmpRoot, 'input');
    const outputDir = path.join(tmpRoot, 'output');
    fs.mkdirSync(inputDir, { recursive: true });

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    // Physical files use the naming createProject.js's frame extraction
    // produces: "<sanitized video name>_<1-indexed frame number>.jpg".
    fs.writeFileSync(path.join(inputDir, 'camA_1.jpg'), jpegBytes);
    fs.writeFileSync(path.join(inputDir, 'camB_1.jpg'), jpegBytes);

    const cocoJson = {
      videos: [
        { id: 1, name: 'camA.mp4' },
        { id: 2, name: 'camB.mp4' },
      ],
      images: [
        { id: 1, video_id: 1, frame_index: 0, file_name: 'frame_000001.jpg', width: 10, height: 10 },
        { id: 2, video_id: 2, frame_index: 0, file_name: 'frame_000001.jpg', width: 10, height: 10 },
      ],
      annotations: [
        { id: 1, image_id: 1, category_id: 1, bbox: [1, 1, 5, 5] },
        { id: 2, image_id: 2, category_id: 1, bbox: [2, 2, 6, 6] },
      ],
      categories: [{ id: 1, name: 'cat' }],
    };
    fs.writeFileSync(path.join(inputDir, 'project_coco.json'), JSON.stringify(cocoJson));

    const result = spawnSync(python, [
      IMPORT_SCRIPT,
      '-i', inputDir,
      '-o', outputDir,
      '-d', 'testdb',
      '-r', 'coco',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    // Both frames survive as distinct files -- neither copy overwrote the other.
    expect(fs.existsSync(path.join(outputDir, 'images', 'camA_1.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'images', 'camB_1.jpg'))).toBe(true);

    const dbPath = path.join(outputDir, 'testdb.db');
    const imageNames = queryDb(python, dbPath, 'SELECT IName FROM Images ORDER BY IName').map((r) => r.IName);
    expect(imageNames).toEqual(['camA_1.jpg', 'camB_1.jpg']);

    const labelsByImage = queryDb(python, dbPath, 'SELECT IName, X, Y FROM Labels ORDER BY IName');
    expect(labelsByImage).toEqual([
      { IName: 'camA_1.jpg', X: '1', Y: '1' },
      { IName: 'camB_1.jpg', X: '2', Y: '2' },
    ]);
  });
});
