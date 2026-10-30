const fs = require('fs');
const path = require('path');
const probe = require('probe-image-size');
const queries = require('../../../queries/queries');
const parseKwCocoCsv = require('../../../utils/parseKwCocoCsv');
const {
    parseAnnotationCsv,
    CsvFormatError,
    TEMPLATES,
    MODE_CLASSIFICATION,
    MODE_DETECTION,
} = require('../../../utils/parseAnnotationCsv');

const MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 50;
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt']);
const UPLOAD_FIELD_NAMES = ['annotation_csv', 'kwcoco_csv', 'csv_file', 'upload_csv'];

// An edge-to-edge box has its outline clipped by the canvas, so pull the bottom-right in slightly.
const WHOLE_IMAGE_BOX_MARGIN_RATIO = 0.005;

function wholeImageBox(width, height) {
    const margin = Math.max(1, Math.round(Math.min(width, height) * WHOLE_IMAGE_BOX_MARGIN_RATIO));
    return {
        x: 0,
        y: 0,
        w: Math.max(1, width - margin),
        h: Math.max(1, height - margin),
    };
}

function fail(res, status, code, message, extra = {}) {
    return res.status(status).json({ success: false, code, message, ...extra });
}

// PName/Admin become part of a filesystem path, so reject anything that could escape public/projects.
function isSafePathSegment(value) {
    return typeof value === 'string' && value.length > 0 && !/[\\/]/.test(value) && value !== '..' && value !== '.';
}

function pickUploadedFile(files) {
    for (const field of UPLOAD_FIELD_NAMES) {
        if (files[field]) return files[field];
    }
    return Object.values(files)[0];
}

// Reads only the image header, never the full pixel data, so large images do not load into memory.
async function readImageSize(imagePath) {
    const stream = fs.createReadStream(imagePath);
    try {
        const { width, height } = await probe(stream);
        return { width, height };
    } finally {
        stream.destroy();
    }
}

/**
 * POST /api/v2/projects/map-annotations-csv
 *
 * Maps a header-based CSV onto a project's images. Supports detection files
 * (file_name, class_name + bounding box columns) and classification files
 * (file_name, class_name only), where the label covers the whole image.
 *
 * The success body is a superset of the legacy /api/projects/map-kwcoco-csv response
 * (success, message, labelsInserted, classesAdded, imagesRegistered), so existing
 * consumers keep working.
 */
async function mapAnnotationsCsv(req, res) {
    try {
        const projectName = req.body.PName || req.body.project_name || req.body.projectName;
        const admin = req.body.Admin || req.cookies?.Username;

        if (!projectName) {
            return fail(res, 400, 'MISSING_PROJECT_NAME', 'Project name is required.');
        }
        if (!admin) {
            return fail(res, 400, 'MISSING_ADMIN', 'Project admin is required.');
        }
        if (!isSafePathSegment(projectName) || !isSafePathSegment(admin)) {
            return fail(res, 400, 'INVALID_PROJECT', 'Invalid project name or admin.');
        }
        if (req.cookies?.Username !== admin) {
            return fail(res, 403, 'FORBIDDEN', 'Only the project admin can map annotations.');
        }

        if (!req.files || Object.keys(req.files).length === 0) {
            return fail(res, 400, 'NO_FILE', 'No annotation file was uploaded.');
        }
        const uploadedFile = pickUploadedFile(req.files);

        const ext = path.extname(uploadedFile.name || '').toLowerCase();
        if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
            return fail(res, 400, 'UNSUPPORTED_FILE_TYPE',
                `Unsupported file type "${ext}". Upload a .csv file.`);
        }
        if (uploadedFile.truncated || uploadedFile.size > MAX_CSV_BYTES) {
            return fail(res, 413, 'FILE_TOO_LARGE',
                `CSV file is too large (limit ${MAX_CSV_BYTES / (1024 * 1024)} MB).`);
        }

        const buffer = uploadedFile.tempFilePath && !(uploadedFile.data && uploadedFile.data.length > 0)
            ? fs.readFileSync(uploadedFile.tempFilePath)
            : (uploadedFile.data || Buffer.alloc(0));
        // Text CSVs never contain NUL bytes; refuse binary payloads before parsing.
        if (buffer.includes(0)) {
            return fail(res, 400, 'INVALID_FILE', 'Uploaded file is not a text CSV file.');
        }

        const csvText = buffer.toString('utf8');
        let parsed;
        try {
            parsed = parseAnnotationCsv(csvText);
        } catch (err) {
            if (!(err instanceof CsvFormatError)) throw err;

            // Backward compatibility: the legacy route accepted header-less positional CSVs
            // (filename, class, x, y, xmax, ymax). Keep accepting them rather than break those files.
            const legacyRows = err.details.headerless ? parseKwCocoCsv(csvText) : [];
            if (legacyRows.length === 0) {
                return fail(res, 400, err.code, err.message, err.details);
            }
            parsed = {
                mode: MODE_DETECTION,
                rows: legacyRows.map(row => ({ line: null, ...row })),
                errors: [],
                totalRows: legacyRows.length,
            };
        }

        const reportedErrors = () => parsed.errors.slice(0, MAX_REPORTED_ERRORS);

        if (parsed.rows.length === 0) {
            return fail(res, 400, 'NO_VALID_ROWS', 'No valid annotation rows found in file.', {
                mode: parsed.mode,
                rowsProcessed: parsed.totalRows,
                rowsSkipped: parsed.errors.length,
                errors: reportedErrors(),
            });
        }

        const projectPath = path.join(__dirname, '..', '..', '..', 'public', 'projects', `${admin}-${projectName}`);
        if (!fs.existsSync(projectPath)) {
            return fail(res, 404, 'PROJECT_NOT_FOUND', `Project path not found: ${admin}-${projectName}`);
        }

        await queries.project.migrateProjectDb(projectPath);

        const isClassification = parsed.mode === MODE_CLASSIFICATION;
        const imagesDir = path.join(projectPath, 'images');
        const existingClasses = new Set(((await queries.project.getAllClasses(projectPath))?.rows || []).map(c => c.CName));
        const existingImages = new Set(((await queries.project.getAllImages(projectPath))?.rows || []).map(i => i.IName));

        // Classification labels cover the whole image, so each image's size is needed.
        const imageSizes = new Map();
        const labelRows = [];
        const skipped = [...parsed.errors];
        let duplicatesSkipped = 0;

        if (isClassification) {
            const seenInFile = new Set();
            for (const row of parsed.rows) {
                const key = JSON.stringify([row.filename, row.className]);
                if (seenInFile.has(key)) {
                    duplicatesSkipped++;
                    continue;
                }
                seenInFile.add(key);

                if (!imageSizes.has(row.filename)) {
                    let size = null;
                    try {
                        size = await readImageSize(path.join(imagesDir, row.filename));
                    } catch (err) {
                        size = null;
                    }
                    imageSizes.set(row.filename, size);
                }
                const size = imageSizes.get(row.filename);
                if (!size) {
                    skipped.push({ line: row.line, message: `Image "${row.filename}" was not found in the project or is not a readable image.` });
                    continue;
                }

                const existing = (await queries.project.getLabelsForImageNameAndClassName(projectPath, row.filename, row.className))?.rows || [];
                if (existing.length > 0) {
                    duplicatesSkipped++;
                    continue;
                }

                labelRows.push({ ...row, ...wholeImageBox(size.width, size.height) });
            }
        } else {
            labelRows.push(...parsed.rows);
        }

        if (labelRows.length === 0 && duplicatesSkipped === 0) {
            skipped.sort((a, b) => a.line - b.line);
            return fail(res, 400, 'NO_VALID_ROWS', 'No valid annotation rows found in file.', {
                mode: parsed.mode,
                rowsProcessed: parsed.totalRows,
                rowsSkipped: skipped.length,
                errors: skipped.slice(0, MAX_REPORTED_ERRORS),
            });
        }

        let classesAdded = 0;
        let imagesRegistered = 0;

        for (const row of labelRows) {
            if (!existingClasses.has(row.className)) {
                await queries.project.createClass(projectPath, row.className);
                existingClasses.add(row.className);
                classesAdded++;
            }
            if (!existingImages.has(row.filename)) {
                await queries.project.addImages(projectPath, row.filename, 0, 0);
                existingImages.add(row.filename);
                imagesRegistered++;
            }
        }

        const maxLidRows = (await queries.project.getMaxLabelId(projectPath))?.rows || [];
        let nextLid = maxLidRows.length > 0 && maxLidRows[0].LID ? maxLidRows[0].LID + 1 : 1;

        for (const row of labelRows) {
            await queries.project.createLabel(projectPath, nextLid++, row.className, row.x, row.y, row.w, row.h, row.filename);
        }

        skipped.sort((a, b) => a.line - b.line);
        const labelsInserted = labelRows.length;

        return res.json({
            success: true,
            message: `Successfully mapped ${labelsInserted} ${isClassification ? 'classification' : 'detection'} annotations.`
                + (skipped.length > 0 ? ` ${skipped.length} row(s) were skipped.` : ''),
            mode: parsed.mode,
            labelsInserted,
            classesAdded,
            imagesRegistered,
            rowsProcessed: parsed.totalRows,
            rowsSkipped: skipped.length,
            duplicatesSkipped,
            errors: skipped.slice(0, MAX_REPORTED_ERRORS),
        });
    } catch (err) {
        console.error('Error mapping annotations CSV:', err);
        const message = err?.message || err?.error?.message || 'Internal server error mapping annotations CSV.';
        return fail(res, 500, 'INTERNAL_ERROR', message);
    }
}

/**
 * GET /api/v2/projects/map-annotations-csv/template?type=detection|detection-corners|classification
 *
 * Returns an example CSV users can download and compare their own file against.
 */
function getAnnotationsCsvTemplate(req, res) {
    const type = req.query.type || 'detection';
    const template = Object.prototype.hasOwnProperty.call(TEMPLATES, type) ? TEMPLATES[type] : null;
    if (!template) {
        return fail(res, 400, 'INVALID_TEMPLATE_TYPE',
            `Unknown template type "${type}". Use one of: ${Object.keys(TEMPLATES).join(', ')}.`);
    }

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${template.filename}"`);
    return res.send(template.content);
}

module.exports = { mapAnnotationsCsv, getAnnotationsCsvTemplate };
