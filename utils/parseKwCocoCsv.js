const path = require('path');

/**
 * Parses KW COCO CSV annotation strings or file contents into structured bounding box records.
 *
 * Supports header-based CSVs (filename/file_name, class/category/label, xmin/x/bbox_x, ymin/y/bbox_y, xmax/w/bbox_w, ymax/h/bbox_h)
 * and positional/VIAME CSVs (filename, class, xmin/x, ymin/y, xmax/w, ymax/h).
 *
 * @param {string} csvContent - Raw CSV string content
 * @returns {Array<{filename: string, className: string, x: number, y: number, w: number, h: number}>} Parsed annotation objects
 */
function parseKwCocoCsv(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') {
        return [];
    }

    const lines = csvContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));

    if (lines.length === 0) {
        return [];
    }

    const firstLine = lines[0];
    const rawTokens = firstLine.split(',').map(t => t.trim());
    const lowerTokens = rawTokens.map(t => t.toLowerCase());

    const hasHeader = lowerTokens.some(t =>
        ['filename', 'file_name', 'file', 'image', 'class', 'category', 'label', 'xmin', 'x', 'ymin', 'y', 'xmax', 'w', 'ymax', 'h', 'bbox_x'].includes(t)
    );

    let filenameIdx = 0;
    let classIdx = 1;
    let xIdx = 2;
    let yIdx = 3;
    let wOrXmaxIdx = 4;
    let hOrYmaxIdx = 5;
    let isWidthHeight = false;

    let startLine = 0;

    if (hasHeader) {
        startLine = 1;

        filenameIdx = lowerTokens.findIndex(t => ['filename', 'file_name', 'file', 'image', 'iname', 'image_name'].includes(t));
        if (filenameIdx === -1) filenameIdx = 0;

        classIdx = lowerTokens.findIndex(t => ['class', 'category', 'label', 'cname', 'class_name'].includes(t));
        if (classIdx === -1) classIdx = 1;

        xIdx = lowerTokens.findIndex(t => ['xmin', 'x', 'left_x', 'left', 'bbox_x', 'tl_x'].includes(t));
        if (xIdx === -1) xIdx = 2;

        yIdx = lowerTokens.findIndex(t => ['ymin', 'y', 'top_y', 'top', 'bbox_y', 'tl_y'].includes(t));
        if (yIdx === -1) yIdx = 3;

        const wIdx = lowerTokens.findIndex(t => ['w', 'width', 'box_w', 'bbox_w'].includes(t));
        const xmaxIdx = lowerTokens.findIndex(t => ['xmax', 'right_x', 'right', 'br_x'].includes(t));

        if (wIdx !== -1) {
            wOrXmaxIdx = wIdx;
            isWidthHeight = true;
        } else if (xmaxIdx !== -1) {
            wOrXmaxIdx = xmaxIdx;
            isWidthHeight = false;
        } else {
            wOrXmaxIdx = 4;
        }

        const hIdx = lowerTokens.findIndex(t => ['h', 'height', 'box_h', 'bbox_h'].includes(t));
        const ymaxIdx = lowerTokens.findIndex(t => ['ymax', 'bottom_y', 'bottom', 'br_y'].includes(t));

        if (hIdx !== -1) {
            hOrYmaxIdx = hIdx;
        } else if (ymaxIdx !== -1) {
            hOrYmaxIdx = ymaxIdx;
        } else {
            hOrYmaxIdx = 5;
        }
    }

    const results = [];

    for (let i = startLine; i < lines.length; i++) {
        const row = lines[i].split(',').map(col => col.trim());
        if (row.length <= Math.max(filenameIdx, classIdx, xIdx, yIdx, wOrXmaxIdx, hOrYmaxIdx)) {
            continue;
        }

        const rawFilename = row[filenameIdx];
        const rawClass = row[classIdx];

        if (!rawFilename || !rawClass) {
            continue;
        }

        const filename = path.basename(rawFilename.replace(/\\/g, '/'));
        const className = rawClass.replace(/\s+/g, '_');

        const xVal = parseFloat(row[xIdx]);
        const yVal = parseFloat(row[yIdx]);
        const val4 = parseFloat(row[wOrXmaxIdx]);
        const val5 = parseFloat(row[hOrYmaxIdx]);

        if (isNaN(xVal) || isNaN(yVal) || isNaN(val4) || isNaN(val5)) {
            continue;
        }

        let x = Math.round(xVal);
        let y = Math.round(yVal);
        let w = 0;
        let h = 0;

        if (isWidthHeight) {
            w = Math.round(val4);
            h = Math.round(val5);
        } else {
            w = Math.round(val4 - xVal);
            h = Math.round(val5 - yVal);
        }

        if (w <= 0 || h <= 0) {
            continue;
        }

        results.push({
            filename,
            className,
            x,
            y,
            w,
            h
        });
    }

    return results;
}

module.exports = parseKwCocoCsv;
