const { generatePipelineScript } = require('../../controllers/preprocessing/generatePipelineScript');

describe('generatePipelineScript', () => {
    it('emits a no-op process_image body when there are no enabled steps', () => {
        const script = generatePipelineScript([]);

        expect(script).toContain('def process_image(img):');
        expect(script).toContain('    pass');
        expect(script).toContain('import cv2');
    });

    it('skips disabled steps and orders enabled steps by `order`', () => {
        const script = generatePipelineScript([
            { type: 'rotate', enabled: true, order: 1, params: { angle: 90 } },
            { type: 'resize', enabled: false, order: 0, params: { width: 100, height: 100 } },
            { type: 'crop', enabled: true, order: 0, params: { top: 5, bottom: 5, left: 5, right: 5 } },
        ]);

        const cropIndex = script.indexOf('# Step 1: crop');
        const rotateIndex = script.indexOf('# Step 2: rotate');

        expect(cropIndex).toBeGreaterThan(-1);
        expect(rotateIndex).toBeGreaterThan(cropIndex);
        expect(script.match(/# Step \d+:/g)).toHaveLength(2);
        expect(script).not.toContain('cv2.resize');
    });

    it('routes custom steps through run_custom_script with the resolved script path', () => {
        const script = generatePipelineScript([
            { type: 'custom', scriptId: 7, scriptPath: '/proj/preprocessing/scripts/7_step.py', enabled: true, order: 0 },
        ]);

        expect(script).toContain('run_custom_script("/proj/preprocessing/scripts/7_step.py", img)');
    });

    it('generates CLAHE code for illumination normalization by default', () => {
        const script = generatePipelineScript([
            { type: 'illumination_normalization', enabled: true, order: 0, params: { clipLimit: 3, tileGridSize: 4 } },
        ]);

        expect(script).toContain('cv2.createCLAHE(clipLimit=3, tileGridSize=(4, 4))');
    });
});
