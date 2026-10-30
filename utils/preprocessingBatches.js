const fs = require("fs");
const path = require("path");

const JOB_ID_PATTERN = /^\d+$/;
const TRANSFORMS_FILE = "transforms.json";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"]);
// A box that keeps less than this share of its area inside the processed image is dropped.
const MIN_VISIBLE_FRACTION = 0.2;
const MAX_BATCH_NAME_LENGTH = 100;

function batchesRoot(projectPath) {
    return path.join(projectPath, "preprocessing", "output");
}

function batchDir(projectPath, jobId) {
    if (!JOB_ID_PATTERN.test(String(jobId))) {
        return null;
    }
    return path.join(batchesRoot(projectPath), String(jobId));
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
        return null;
    }
}

/** Completed /apply jobs whose output folder still exists, newest first. */
function listBatches(projectPath) {
    const jobsDir = path.join(projectPath, "preprocessing", "jobs");
    let entries;
    try {
        entries = fs.readdirSync(jobsDir);
    } catch (err) {
        return [];
    }

    const batches = [];
    for (const entry of entries) {
        const match = /^(\d+)-status\.json$/.exec(entry);
        if (!match) continue;

        const jobId = match[1];
        const status = readJson(path.join(jobsDir, entry));
        const dir = batchDir(projectPath, jobId);
        if (!status || status.state !== "completed" || !dir || !fs.existsSync(dir)) continue;

        const manifest = readJson(path.join(jobsDir, `${jobId}-manifest.json`)) || {};
        batches.push({
            jobId,
            name: (readJson(metaPath(projectPath, jobId)) || {}).name || "",
            startedAt: status.startedAt || null,
            finishedAt: status.finishedAt || null,
            processed: status.processed || 0,
            skipped: status.skipped || 0,
            steps: (manifest.steps || []).map((step) => step.scriptName || step.type),
            // Batches made before label remapping existed have no transforms file.
            hasTransforms: fs.existsSync(path.join(dir, TRANSFORMS_FILE)),
        });
    }

    return batches.sort((a, b) => Number(b.jobId) - Number(a.jobId));
}

/** Image files directly inside `dir`: no label .txt files, macOS "._" files or sub-folders. */
function listImageFiles(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(
            (e) =>
                e.isFile() &&
                !e.name.startsWith(".") &&
                IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()),
        )
        .map((e) => e.name)
        .sort();
}

function metaPath(projectPath, jobId) {
    return path.join(projectPath, "preprocessing", "jobs", `${jobId}-meta.json`);
}

/** Cleans a user-typed batch name: trimmed, control characters removed, 100 characters at most. */
function normalizeBatchName(raw) {
    if (raw === undefined || raw === null) return { value: "" };
    if (typeof raw !== "string") return { error: "name must be a string" };
    const value = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (value.length > MAX_BATCH_NAME_LENGTH) {
        return { error: `name is too long (max ${MAX_BATCH_NAME_LENGTH} characters)` };
    }
    return { value };
}

function writeBatchName(projectPath, jobId, name) {
    const file = metaPath(projectPath, jobId);
    const meta = readJson(file) || {};
    if (name) {
        meta.name = name;
    } else {
        delete meta.name;
    }
    fs.writeFileSync(file, JSON.stringify(meta));
}

function listBatchImages(projectPath, jobId) {
    const dir = batchDir(projectPath, jobId);
    if (!dir) return null;
    try {
        return listImageFiles(dir);
    } catch (err) {
        return null;
    }
}

/** { dir, transforms } for a batch, or null when it does not exist or predates transforms. */
function loadBatch(projectPath, jobId) {
    const dir = batchDir(projectPath, jobId);
    if (!dir) return null;
    const transforms = readJson(path.join(dir, TRANSFORMS_FILE));
    return transforms ? { dir, transforms } : null;
}

function applyMatrix(m, x, y) {
    return { x: m[0] * x + m[1] * y + m[2], y: m[3] * x + m[4] * y + m[5] };
}

function parseCoordinateList(value) {
    const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
    return items.map((v) => Number(typeof v === "string" ? v.trim() : v)).filter(Number.isFinite);
}

function boundsOf(points) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function clampPoint(p, width, height) {
    return { x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) };
}

/**
 * Maps one label row (DB shape: X/Y/W/H top-left rectangle, or X/Y as comma-separated
 * polygon coordinates) into a processed image's pixel space. Returns the new row, or
 * null if less than MIN_VISIBLE_FRACTION of the box is still inside the image.
 *
 * Rectangles come back as the bounding rectangle of the transformed corners, so a
 * rotation by a non-multiple of 90 degrees makes the box looser, not wrong.
 */
function transformLabelRow(row, transform) {
    const { matrix, width, height } = transform;

    const xs = parseCoordinateList(row.X);
    const ys = parseCoordinateList(row.Y);
    const isPolygon = xs.length >= 3 && xs.length === ys.length;

    let points;
    if (isPolygon) {
        points = xs.map((x, i) => ({ x, y: ys[i] }));
    } else {
        const left = Number(row.X);
        const top = Number(row.Y);
        const w = Number(row.W);
        const h = Number(row.H);
        if (![left, top, w, h].every(Number.isFinite) || w < 0 || h < 0) return null;
        points = [
            { x: left, y: top },
            { x: left + w, y: top },
            { x: left + w, y: top + h },
            { x: left, y: top + h },
        ];
    }

    const mapped = points.map((p) => applyMatrix(matrix, p.x, p.y));
    const free = boundsOf(mapped);
    const freeArea = (free.maxX - free.minX) * (free.maxY - free.minY);

    const clamped = mapped.map((p) => clampPoint(p, width, height));
    const kept = boundsOf(clamped);
    const keptArea = (kept.maxX - kept.minX) * (kept.maxY - kept.minY);

    if (kept.maxX - kept.minX <= 0 || kept.maxY - kept.minY <= 0) return null;
    if (freeArea > 0 && keptArea / freeArea < MIN_VISIBLE_FRACTION) return null;

    if (isPolygon) {
        return {
            ...row,
            X: clamped.map((p) => p.x).join(","),
            Y: clamped.map((p) => p.y).join(","),
        };
    }

    return {
        ...row,
        X: kept.minX,
        Y: kept.minY,
        W: kept.maxX - kept.minX,
        H: kept.maxY - kept.minY,
    };
}

module.exports = {
    IMAGE_EXTENSIONS,
    JOB_ID_PATTERN,
    TRANSFORMS_FILE,
    batchDir,
    listBatches,
    listImageFiles,
    listBatchImages,
    normalizeBatchName,
    writeBatchName,
    loadBatch,
    transformLabelRow,
};
