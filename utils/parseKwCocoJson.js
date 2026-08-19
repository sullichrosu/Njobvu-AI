const path = require('path');

/**
 * Parses KW COCO / COCO-style JSON annotation content into the same
 * {filename, className, x, y, w, h} shape produced by parseKwCocoCsv, so both
 * formats can feed the same downstream label-import pipeline.
 *
 * Expects the standard COCO structure: {images: [...], annotations: [...], categories: [...]}
 * with annotations referencing images/categories by id and bbox as [x, y, w, h].
 *
 * @param {string} jsonContent - Raw JSON string content
 * @returns {Array<{filename: string, className: string, x: number, y: number, w: number, h: number}>} Parsed annotation objects
 */
function parseKwCocoJson(jsonContent) {
    if (!jsonContent || typeof jsonContent !== 'string') {
        return [];
    }

    let data;
    try {
        data = JSON.parse(jsonContent);
    } catch (err) {
        return [];
    }

    if (!data || typeof data !== 'object') {
        return [];
    }

    const images = Array.isArray(data.images) ? data.images : [];
    const annotations = Array.isArray(data.annotations) ? data.annotations : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];

    if (images.length === 0 || annotations.length === 0) {
        return [];
    }

    const imageIdToFilename = new Map();
    for (const img of images) {
        if (!img || img.id == null) continue;
        const rawName = img.file_name || img.filename || img.name;
        if (!rawName) continue;
        imageIdToFilename.set(img.id, path.basename(String(rawName).replace(/\\/g, '/')));
    }

    const categoryIdToName = new Map();
    for (const cat of categories) {
        if (!cat || cat.id == null) continue;
        const rawName = cat.name || cat.category_name;
        if (!rawName) continue;
        categoryIdToName.set(cat.id, String(rawName).replace(/\s+/g, '_'));
    }

    const results = [];

    for (const ann of annotations) {
        if (!ann) continue;

        const filename = imageIdToFilename.get(ann.image_id);
        if (!filename) continue;

        const className = categoryIdToName.get(ann.category_id);
        if (!className) continue;

        const bbox = ann.bbox;
        if (!Array.isArray(bbox) || bbox.length < 4) continue;

        const xVal = parseFloat(bbox[0]);
        const yVal = parseFloat(bbox[1]);
        const wVal = parseFloat(bbox[2]);
        const hVal = parseFloat(bbox[3]);

        if (isNaN(xVal) || isNaN(yVal) || isNaN(wVal) || isNaN(hVal)) {
            continue;
        }

        const x = Math.round(xVal);
        const y = Math.round(yVal);
        const w = Math.round(wVal);
        const h = Math.round(hVal);

        if (w <= 0 || h <= 0) {
            continue;
        }

        results.push({ filename, className, x, y, w, h });
    }

    return results;
}

module.exports = parseKwCocoJson;
