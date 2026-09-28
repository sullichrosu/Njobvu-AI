const path = require('path');

/**
 * Strict, header-based annotation CSV parser used by the v2 mapping route.
 *
 * Unlike utils/parseKwCocoCsv (which guesses positional columns and silently drops
 * anything it cannot read), this parser requires a header row and reports exactly
 * what is wrong with the file so users can fix it.
 *
 * Two layouts are accepted:
 *   - detection:      file_name, class_name, x, y, w, h   (or xmin, ymin, xmax, ymax)
 *   - classification: file_name, class_name              (label is the whole image)
 */

const COLUMN_ALIASES = {
    fileName: ['file_name', 'filename', 'file', 'image', 'image_name', 'iname'],
    className: ['class_name', 'class', 'category', 'category_name', 'label', 'cname'],
    x: ['x', 'xmin', 'x_min', 'left', 'left_x', 'bbox_x', 'tl_x'],
    y: ['y', 'ymin', 'y_min', 'top', 'top_y', 'bbox_y', 'tl_y'],
    w: ['w', 'width', 'bbox_w', 'box_w'],
    h: ['h', 'height', 'bbox_h', 'box_h'],
    xmax: ['xmax', 'x_max', 'right', 'right_x', 'br_x'],
    ymax: ['ymax', 'y_max', 'bottom', 'bottom_y', 'br_y'],
};

const MODE_DETECTION = 'detection';
const MODE_CLASSIFICATION = 'classification';

class CsvFormatError extends Error {
    /**
     * @param {string} code - Machine-readable error code
     * @param {string} message - Human-readable explanation
     * @param {object} [details] - Extra fields merged into the API error response
     */
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'CsvFormatError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Splits CSV text into records, honouring RFC 4180 quoting (embedded commas, quotes and newlines).
 * Blank lines and lines starting with '#' are skipped.
 *
 * @param {string} text
 * @returns {Array<{line: number, fields: string[]}>} Records with the 1-based line each one starts on
 */
function tokenizeCsv(text) {
    const records = [];
    let fields = [];
    let field = '';
    let inQuotes = false;
    let fieldWasQuoted = false;
    let line = 1;
    let recordLine = 1;

    const endField = () => {
        fields.push(fieldWasQuoted ? field : field.trim());
        field = '';
        fieldWasQuoted = false;
    };
    const endRecord = () => {
        endField();
        const isBlank = fields.length === 1 && fields[0] === '';
        const isComment = fields[0].startsWith('#');
        if (!isBlank && !isComment) {
            records.push({ line: recordLine, fields });
        }
        fields = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                if (ch === '\n') line++;
                field += ch;
            }
            continue;
        }

        if (ch === '"' && field.trim() === '') {
            inQuotes = true;
            fieldWasQuoted = true;
            field = '';
        } else if (ch === ',') {
            endField();
        } else if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            endRecord();
            line++;
            recordLine = line;
        } else {
            field += ch;
        }
    }

    if (inQuotes) {
        throw new CsvFormatError(
            'MALFORMED_CSV',
            `Malformed CSV: the quoted field starting near line ${recordLine} is never closed.`,
            { line: recordLine }
        );
    }

    if (field !== '' || fields.length > 0 || fieldWasQuoted) {
        endRecord();
    }

    return records;
}

function normalizeHeader(value) {
    return String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function findColumn(headers, aliases) {
    return headers.findIndex(h => aliases.includes(h));
}

/**
 * Resolves the header row into column indexes and works out which layout the file uses.
 *
 * @param {string[]} rawHeader
 * @returns {{mode: string, cols: object}}
 */
function resolveColumns(rawHeader) {
    const headers = rawHeader.map(normalizeHeader);
    const cols = {};
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        cols[key] = findColumn(headers, aliases);
    }

    const missing = [];
    if (cols.fileName === -1) missing.push('file_name');
    if (cols.className === -1) missing.push('class_name');

    const hasWidth = cols.w !== -1;
    const hasHeight = cols.h !== -1;
    const hasBboxColumn = cols.x !== -1 || cols.y !== -1 || hasWidth || hasHeight
        || cols.xmax !== -1 || cols.ymax !== -1;
    const mode = hasBboxColumn ? MODE_DETECTION : MODE_CLASSIFICATION;

    if (mode === MODE_DETECTION) {
        if (cols.x === -1) missing.push('x (or xmin)');
        if (cols.y === -1) missing.push('y (or ymin)');
        if (!hasWidth && cols.xmax === -1) missing.push('w (or xmax)');
        if (!hasHeight && cols.ymax === -1) missing.push('h (or ymax)');
    }

    if (missing.length > 0) {
        const looksHeaderless = cols.fileName === -1 && cols.className === -1;
        throw new CsvFormatError(
            'MISSING_COLUMNS',
            `CSV is missing required column(s): ${missing.join(', ')}.`
                + (looksHeaderless ? ' The first row must be a header row.' : '')
                + ' Download an example CSV to see the expected format.',
            { missingColumns: missing, foundColumns: headers, headerless: looksHeaderless }
        );
    }

    // Prefer width/height when both spellings are present, matching the legacy parser.
    cols.useSize = hasWidth && hasHeight;
    if (!cols.useSize && mode === MODE_DETECTION) {
        // A mixed pair (e.g. w + ymax) would silently mix units, so require a consistent pair.
        if (hasWidth !== hasHeight) {
            throw new CsvFormatError(
                'MISSING_COLUMNS',
                'CSV mixes size and corner columns. Use x,y,w,h or xmin,ymin,xmax,ymax.',
                { missingColumns: [hasWidth ? 'h' : 'w'], foundColumns: headers }
            );
        }
    }

    return { mode, cols };
}

function parseNumber(raw) {
    if (raw === undefined || raw === null || String(raw).trim() === '') return NaN;
    return Number(raw);
}

/**
 * Parses annotation CSV content.
 *
 * @param {string} csvContent - Raw CSV text (a UTF-8 BOM is tolerated)
 * @returns {{
 *   mode: 'detection'|'classification',
 *   rows: Array<{line: number, filename: string, className: string, x?: number, y?: number, w?: number, h?: number}>,
 *   errors: Array<{line: number, message: string}>,
 *   totalRows: number
 * }}
 * @throws {CsvFormatError} When the file is empty, structurally malformed, or lacks required columns
 */
function parseAnnotationCsv(csvContent) {
    if (typeof csvContent !== 'string' || csvContent.trim() === '') {
        throw new CsvFormatError('EMPTY_CSV', 'The uploaded CSV file is empty.');
    }

    const text = csvContent.replace(/^\uFEFF/, '');
    const records = tokenizeCsv(text);
    if (records.length === 0) {
        throw new CsvFormatError('EMPTY_CSV', 'The uploaded CSV file has no header or data rows.');
    }

    const [headerRecord, ...dataRecords] = records;
    const { mode, cols } = resolveColumns(headerRecord.fields);
    const columnCount = headerRecord.fields.length;

    const rows = [];
    const errors = [];

    for (const { line, fields } of dataRecords) {
        if (fields.length !== columnCount) {
            errors.push({ line, message: `Expected ${columnCount} columns but found ${fields.length}.` });
            continue;
        }

        const rawFilename = fields[cols.fileName];
        const rawClass = fields[cols.className];
        if (!rawFilename) {
            errors.push({ line, message: 'file_name is empty.' });
            continue;
        }
        if (!rawClass) {
            errors.push({ line, message: 'class_name is empty.' });
            continue;
        }

        const filename = path.basename(rawFilename.replace(/\\/g, '/'));
        const className = rawClass.replace(/\s+/g, '_');
        if (!filename || filename === '.' || filename === '..') {
            errors.push({ line, message: `file_name "${rawFilename}" is not a valid file name.` });
            continue;
        }

        if (mode === MODE_CLASSIFICATION) {
            rows.push({ line, filename, className });
            continue;
        }

        const xVal = parseNumber(fields[cols.x]);
        const yVal = parseNumber(fields[cols.y]);
        const third = parseNumber(fields[cols.useSize ? cols.w : cols.xmax]);
        const fourth = parseNumber(fields[cols.useSize ? cols.h : cols.ymax]);

        if (![xVal, yVal, third, fourth].every(Number.isFinite)) {
            errors.push({ line, message: 'Bounding box values must all be numbers.' });
            continue;
        }

        const w = Math.round(cols.useSize ? third : third - xVal);
        const h = Math.round(cols.useSize ? fourth : fourth - yVal);
        if (w <= 0 || h <= 0) {
            errors.push({ line, message: 'Bounding box must have a positive width and height.' });
            continue;
        }

        rows.push({ line, filename, className, x: Math.round(xVal), y: Math.round(yVal), w, h });
    }

    return { mode, rows, errors, totalRows: dataRecords.length };
}

/**
 * Example files users can download and compare their own CSV against.
 */
const TEMPLATES = {
    detection: {
        filename: 'annotations_detection_example.csv',
        content: [
            'file_name,class_name,x,y,w,h',
            'img_0001.jpg,dolphin,120,80,200,150',
            'img_0001.jpg,shark,400,220,90,60',
            'img_0002.jpg,dolphin,45,60,310,180',
            '',
        ].join('\n'),
    },
    'detection-corners': {
        filename: 'annotations_detection_corners_example.csv',
        content: [
            'file_name,class_name,xmin,ymin,xmax,ymax',
            'img_0001.jpg,dolphin,120,80,320,230',
            'img_0001.jpg,shark,400,220,490,280',
            'img_0002.jpg,dolphin,45,60,355,240',
            '',
        ].join('\n'),
    },
    classification: {
        filename: 'annotations_classification_example.csv',
        content: [
            'file_name,class_name',
            'img_0001.jpg,dolphin',
            'img_0002.jpg,shark',
            'img_0003.jpg,dolphin',
            '',
        ].join('\n'),
    },
};

module.exports = {
    parseAnnotationCsv,
    CsvFormatError,
    COLUMN_ALIASES,
    TEMPLATES,
    MODE_DETECTION,
    MODE_CLASSIFICATION,
};
