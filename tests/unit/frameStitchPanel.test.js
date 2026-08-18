const FrameStitchPanel = require('../../public/js/v2/frameStitchPanel');

describe('FrameStitchPanel', () => {
    let originalFetch;

    beforeEach(() => {
        originalFetch = global.fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('accumulates and removes selected frames', () => {
        const panel = new FrameStitchPanel({ admin: 'alice', projectName: 'proj' });

        panel.addFrame({ dataUrl: 'data:image/png;base64,AAA', timestamp: 1 });
        panel.addFrame({ dataUrl: 'data:image/png;base64,BBB', timestamp: 2 });
        expect(panel.selectedFrames).toHaveLength(2);

        panel.removeFrame(0);
        expect(panel.selectedFrames).toHaveLength(1);
        expect(panel.selectedFrames[0].timestamp).toBe(2);

        panel.clear();
        expect(panel.selectedFrames).toHaveLength(0);
    });

    it('rejects adding more than maxFrames', () => {
        const panel = new FrameStitchPanel({ admin: 'alice', projectName: 'proj', maxFrames: 1 });
        panel.addFrame({ dataUrl: 'data:image/png;base64,AAA', timestamp: 1 });

        expect(() => panel.addFrame({ dataUrl: 'data:image/png;base64,BBB', timestamp: 2 })).toThrow(
            /up to 1 frames/,
        );
    });

    it('rejects stitching with fewer than minFrames selected', async () => {
        const panel = new FrameStitchPanel({ admin: 'alice', projectName: 'proj', minFrames: 2 });
        panel.addFrame({ dataUrl: 'data:image/png;base64,AAA', timestamp: 1 });

        await expect(panel.stitch()).rejects.toThrow(/at least 2 frames/);
    });

    it('posts the selected frames to the project-scoped stitch endpoint', async () => {
        const panel = new FrameStitchPanel({ admin: 'alice', projectName: 'my project' });
        panel.addFrame({ dataUrl: 'data:image/png;base64,AAA', timestamp: 1 });
        panel.addFrame({ dataUrl: 'data:image/png;base64,BBB', timestamp: 2 });

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ success: true, fileName: 'stitch-1.png', width: 20, height: 10 }),
        });

        const result = await panel.stitch('vertical', 'my-stitch.png');

        expect(global.fetch).toHaveBeenCalledWith(
            '/api/v2/projects/alice/my%20project/videos/stitch',
            expect.objectContaining({ method: 'POST' }),
        );
        const body = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(body.layout).toBe('vertical');
        expect(body.fileName).toBe('my-stitch.png');
        expect(body.frames).toEqual([
            { dataUrl: 'data:image/png;base64,AAA', timestamp: 1 },
            { dataUrl: 'data:image/png;base64,BBB', timestamp: 2 },
        ]);
        expect(result.fileName).toBe('stitch-1.png');
    });

    it('surfaces server-side errors from a failed stitch request', async () => {
        const panel = new FrameStitchPanel({ admin: 'alice', projectName: 'proj' });
        panel.addFrame({ dataUrl: 'data:image/png;base64,AAA', timestamp: 1 });
        panel.addFrame({ dataUrl: 'data:image/png;base64,BBB', timestamp: 2 });

        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ success: false, error: 'boom' }),
        });

        await expect(panel.stitch()).rejects.toThrow('boom');
    });
});
