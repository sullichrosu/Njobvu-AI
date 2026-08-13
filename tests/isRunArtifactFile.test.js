const { isReservedInferenceFile, isCocoClassesFile } = require('../utils/isRunArtifactFile');

describe('isRunArtifactFile Utility Unit Tests', () => {
    describe('isCocoClassesFile', () => {
        it.each([
            'coco_classes.yaml',
            'coco-classes.txt',
            'COCO_CLASSES.yaml',
            'cocoClasses.yaml',
        ])('flags "%s" as a coco-classes file', (fileName) => {
            expect(isCocoClassesFile(fileName)).toBe(true);
        });

        it.each([
            'best.pt',
            'done.log',
            '1699999999.log',
            'classes.txt',
        ])('does not flag "%s" as a coco-classes file', (fileName) => {
            expect(isCocoClassesFile(fileName)).toBe(false);
        });
    });

    describe('isReservedInferenceFile', () => {
        it('still filters the pre-existing reserved script/output entries', () => {
            expect(isReservedInferenceFile('datatovalues.py')).toBe(true);
            expect(isReservedInferenceFile('output')).toBe(true);
        });

        it('filters coco-classes files out of inference run listings', () => {
            expect(isReservedInferenceFile('coco_classes.yaml')).toBe(true);
        });

        it('leaves normal run artifacts (e.g. weights) in the listing', () => {
            expect(isReservedInferenceFile('best.pt')).toBe(false);
            expect(isReservedInferenceFile('1699999999.log')).toBe(false);
        });
    });
});
