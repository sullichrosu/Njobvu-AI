const VideoPlayerController = require('../../public/js/v2/videoPlayerController');

// VideoPlayerController only touches a handful of <video>/<canvas> members,
// so a plain object double is enough here without pulling in jsdom (which
// this repo doesn't otherwise depend on).
function makeFakeVideoEl({ duration = 100, videoWidth = 64, videoHeight = 48 } = {}) {
    return {
        duration,
        videoWidth,
        videoHeight,
        currentTime: 0,
        _listeners: {},
        addEventListener(event, handler) {
            this._listeners[event] = this._listeners[event] || [];
            this._listeners[event].push(handler);
        },
        fireTimeUpdate() {
            (this._listeners.timeupdate || []).forEach((h) => h());
        },
        play: jest.fn(),
        pause: jest.fn(),
    };
}

describe('VideoPlayerController', () => {
    let originalDocument;

    beforeAll(() => {
        originalDocument = global.document;
        global.document = {
            createElement: () => ({
                width: 0,
                height: 0,
                getContext: () => ({ drawImage: jest.fn() }),
                toDataURL: () => 'data:image/png;base64,FAKE',
            }),
        };
    });

    afterAll(() => {
        global.document = originalDocument;
    });

    it('seeks clamped between 0 and the video duration', () => {
        const videoEl = makeFakeVideoEl({ duration: 10 });
        const controller = new VideoPlayerController(videoEl, { fps: 30 });

        controller.seek(5);
        expect(videoEl.currentTime).toBe(5);

        controller.seek(-3);
        expect(videoEl.currentTime).toBe(0);

        controller.seek(999);
        expect(videoEl.currentTime).toBe(10);
    });

    it('steps by whole frames based on the configured fps', () => {
        const videoEl = makeFakeVideoEl({ duration: 10 });
        const controller = new VideoPlayerController(videoEl, { fps: 10 });

        videoEl.currentTime = 1;
        controller.stepFrame(1);
        expect(videoEl.currentTime).toBeCloseTo(1.1);

        controller.stepFrame(-2);
        expect(videoEl.currentTime).toBeCloseTo(0.9);
    });

    it('computes the current frame index from currentTime and fps', () => {
        const videoEl = makeFakeVideoEl({ duration: 10 });
        const controller = new VideoPlayerController(videoEl, { fps: 30 });

        videoEl.currentTime = 2;
        expect(controller.getCurrentFrame()).toBe(60);
    });

    it('notifies frame-change handlers on timeupdate', () => {
        const videoEl = makeFakeVideoEl({ duration: 10 });
        const controller = new VideoPlayerController(videoEl, { fps: 30 });
        const handler = jest.fn();
        controller.onFrameChange(handler);

        videoEl.currentTime = 1;
        videoEl.fireTimeUpdate();

        expect(handler).toHaveBeenCalledWith(1, 30);
    });

    it('captures the current frame as a data URL with timestamp and frame index', () => {
        const videoEl = makeFakeVideoEl({ duration: 10 });
        const controller = new VideoPlayerController(videoEl, { fps: 30 });
        videoEl.currentTime = 1;

        const frame = controller.captureCurrentFrame();

        expect(frame.dataUrl).toBe('data:image/png;base64,FAKE');
        expect(frame.timestamp).toBe(1);
        expect(frame.frame).toBe(30);
    });
});
