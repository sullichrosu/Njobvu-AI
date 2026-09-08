const path = require('path');

jest.mock('fs');
jest.mock('child_process', () => ({
    execFile: jest.fn((pythonBin, args, options, callback) => {
        callback(null, '3\n', '');
    }),
}));

const fs = require('fs');
const { execFile } = require('child_process');
const { applyPipelineToProject } = require('../../controllers/preprocessing/applyPipeline');

describe('applyPipelineToProject', () => {
    const projectPath = '/proj';
    const imagesDir = path.join(projectPath, 'images');
    const scriptsDir = path.join(projectPath, 'preprocessing', 'scripts');

    beforeEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockReturnValue(undefined);
        fs.writeFileSync.mockReturnValue(undefined);
    });

    it('runs python via execFile with an argument array, never a shell-interpolated string', async () => {
        fs.readFileSync.mockReturnValue('img = img\n');

        await applyPipelineToProject({
            projectPath,
            pipeline: [{ type: 'resize', enabled: true, order: 0, params: { width: 10, height: 10 } }],
            customScripts: [],
        });

        expect(execFile).toHaveBeenCalledTimes(1);
        const [command, args] = execFile.mock.calls[0];
        expect(typeof command).toBe('string');
        expect(Array.isArray(args)).toBe(true);
        expect(args).toEqual([
            path.join(projectPath, 'preprocessing', 'run_pipeline.py'),
            imagesDir,
            path.join(projectPath, 'preprocessing', 'output'),
        ]);
    });

    it('rejects the run before ever invoking python if a custom step\'s script contains a disallowed import', async () => {
        fs.readFileSync.mockReturnValue('import os\ndef process(img):\n    return img\n');

        await expect(applyPipelineToProject({
            projectPath,
            pipeline: [{ type: 'custom', scriptId: 1, enabled: true, order: 0, params: {} }],
            customScripts: [{ id: 1, name: 'evil.py', filename: '1_evil.py' }],
        })).rejects.toThrow(/Forbidden code pattern/);

        expect(fs.readFileSync).toHaveBeenCalledWith(path.join(scriptsDir, '1_evil.py'), 'utf8');
        expect(execFile).not.toHaveBeenCalled();
    });

    it('allows a custom step whose script has no disallowed patterns', async () => {
        fs.readFileSync.mockReturnValue('def process(img):\n    return img\n');

        await applyPipelineToProject({
            projectPath,
            pipeline: [{ type: 'custom', scriptId: 1, enabled: true, order: 0, params: {} }],
            customScripts: [{ id: 1, name: 'safe.py', filename: '1_safe.py' }],
        });

        expect(execFile).toHaveBeenCalledTimes(1);
    });
});
