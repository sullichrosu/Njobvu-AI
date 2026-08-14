const RESERVED_INFERENCE_FILES = new Set(["datatovalues.py", "output"]);
const COCO_CLASSES_PATTERN = /coco[-_]?classes/i;

function isCocoClassesFile(fileName) {
    return COCO_CLASSES_PATTERN.test(fileName);
}

function isReservedInferenceFile(fileName) {
    return RESERVED_INFERENCE_FILES.has(fileName) || isCocoClassesFile(fileName);
}

module.exports = { isReservedInferenceFile, isCocoClassesFile };
