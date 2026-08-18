// VideoPlayerController wraps an HTML5 <video> element with play/pause/seek
// and frame-step controls. The video source is loaded entirely client-side
// (via an object URL from a local file picker), so no server-side video
// upload/streaming is required just to scrub through it.
class VideoPlayerController {
    constructor(videoEl, { fps = 30 } = {}) {
        this.videoEl = videoEl;
        this.fps = fps;
        this._frameChangeHandlers = [];

        this.videoEl.addEventListener("timeupdate", () => {
            this._frameChangeHandlers.forEach((handler) => handler(this.getCurrentTime(), this.getCurrentFrame()));
        });
    }

    loadFile(file) {
        const url = URL.createObjectURL(file);
        this.videoEl.src = url;
        return url;
    }

    play() {
        return this.videoEl.play();
    }

    pause() {
        this.videoEl.pause();
    }

    seek(timeSeconds) {
        const duration = this.videoEl.duration || 0;
        this.videoEl.currentTime = Math.max(0, Math.min(timeSeconds, duration));
    }

    stepFrame(deltaFrames) {
        const frameDuration = 1 / this.fps;
        this.seek(this.getCurrentTime() + deltaFrames * frameDuration);
    }

    getCurrentTime() {
        return this.videoEl.currentTime || 0;
    }

    getCurrentFrame() {
        return Math.round(this.getCurrentTime() * this.fps);
    }

    onFrameChange(handler) {
        this._frameChangeHandlers.push(handler);
    }

    // Captures the frame currently painted on the <video> element as a PNG
    // data URL, using an offscreen canvas sized to the video's native
    // resolution.
    captureCurrentFrame() {
        const canvas = document.createElement("canvas");
        canvas.width = this.videoEl.videoWidth;
        canvas.height = this.videoEl.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);

        return {
            dataUrl: canvas.toDataURL("image/png"),
            timestamp: this.getCurrentTime(),
            frame: this.getCurrentFrame(),
        };
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = VideoPlayerController;
}
