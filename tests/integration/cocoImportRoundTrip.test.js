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

// Builds a fixture for the classification (strangler) import path: two
// images, each with a single annotation deciding its whole-image class,
// mirroring what routes/projects/importKwCocoClassification.js hands to
// import_options.py -r coco_class.
function writeKwCocoClassificationFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'cat.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  fs.writeFileSync(path.join(dir, 'dog.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const cocoJson = {
    images: [
      { id: 1, file_name: 'cat.jpg', width: 10, height: 20 },
      { id: 2, file_name: 'dog.jpg', width: 30, height: 40 },
    ],
    annotations: [
      { id: 1, image_id: 1, category_id: 1, bbox: [1, 1, 5, 5] },
      { id: 2, image_id: 2, category_id: 2, bbox: [2, 2, 6, 6] },
    ],
    categories: [
      { id: 1, name: 'cat' },
      { id: 2, name: 'dog' },
    ],
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
});

describe('KW Coco classification archive round trip (real python import)', () => {
  let python;
  let tmpRoot;

  beforeAll(() => {
    python = findPython();
  });

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kwcoco-class-roundtrip-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('imports one whole-image class label per image instead of per-annotation bounding boxes', () => {
    const inputDir = path.join(tmpRoot, 'input');
    const outputDir = path.join(tmpRoot, 'output');
    writeKwCocoClassificationFixture(inputDir);

    const result = spawnSync(python, [
      IMPORT_SCRIPT,
      '-i', inputDir,
      '-o', outputDir,
      '-d', 'testdb',
      '-r', 'coco_class',
    ], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(fs.existsSync(path.join(outputDir, 'images', 'cat.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'images', 'dog.jpg'))).toBe(true);

    // query with the real sqlite3 CLI (not the npm sqlite3 package, which
    // tests/setup.js mocks globally for every suite) so this assertion
    // exercises the actual bytes the python importer wrote to disk.
    const dbPath = path.join(outputDir, 'testdb.db');
    const query = spawnSync('sqlite3', [
      dbPath,
      '-separator', '|',
      'SELECT CName, X, Y, W, H, IName FROM Labels ORDER BY IName;',
    ], { encoding: 'utf8' });

    expect(query.status).toBe(0);

    const rows = query.stdout.trim().split('\n').map((line) => {
      const [CName, X, Y, W, H, IName] = line.split('|');
      return { CName, X, Y, W: Number(W), H: Number(H), IName };
    });

    // exactly one label per image (per-image class, not per-object bbox)
    expect(rows).toHaveLength(2);

    const catLabel = rows.find((r) => r.IName === 'cat.jpg');
    expect(catLabel).toMatchObject({ CName: 'cat', X: '0', Y: '0', W: 10, H: 20 });

    const dogLabel = rows.find((r) => r.IName === 'dog.jpg');
    expect(dogLabel).toMatchObject({ CName: 'dog', X: '0', Y: '0', W: 30, H: 40 });
  });

  it('does not affect the existing detection run mode (coco stays bbox-based)', () => {
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
  });
});
