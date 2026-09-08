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

    it('parses the pad step\'s "#rrggbb" color field into a BGR tuple for cv2', () => {
        // The UI's fill-color field is <input type="color">, so params.color is a
        // hex string ("#3f51b5"), not an [r, g, b] array - and cv2 expects BGR.
        const script = generatePipelineScript([
            { type: 'pad', enabled: true, order: 0, params: { top: 1, bottom: 1, left: 1, right: 1, color: '#3f51b5' } },
        ]);

        // #3f51b5 -> r=0x3f=63, g=0x51=81, b=0xb5=181 -> BGR tuple (181, 81, 63)
        expect(script).toContain('value=(181, 81, 63)');
    });

    it('falls back to black padding for a missing/malformed color instead of throwing', () => {
        const script = generatePipelineScript([
            { type: 'pad', enabled: true, order: 0, params: { top: 1, bottom: 1, left: 1, right: 1, color: 'not-a-color' } },
        ]);

        expect(script).toContain('value=(0, 0, 0)');
    });

    it('honors an explicit noise amount of 0 instead of falling back to the default', () => {
        // `Number(params.amount) || 0.05` would silently replace an explicit
        // 0 with the 0.05 default, since 0 is falsy in JS.
        const script = generatePipelineScript([
            { type: 'noise', enabled: true, order: 0, params: { type: 'gaussian', amount: 0 } },
        ]);

        expect(script).toContain('sigma = 0 * 255');
    });
});
