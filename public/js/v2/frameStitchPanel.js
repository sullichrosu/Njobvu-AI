// FrameStitchPanel manages a user's multi-frame selection (captured via
// VideoPlayerController.captureCurrentFrame) and submits the stitched
// composite to the v2 stitch endpoint.
class FrameStitchPanel {
    constructor({ admin, projectName, maxFrames = 12, minFrames = 2 } = {}) {
        this.admin = admin;
        this.projectName = projectName;
        this.maxFrames = maxFrames;
        this.minFrames = minFrames;
        this.selectedFrames = [];
    }

    addFrame(frame) {
        if (this.selectedFrames.length >= this.maxFrames) {
            throw new Error(`You can only select up to ${this.maxFrames} frames`);
        }
        this.selectedFrames.push(frame);
        return this.selectedFrames.length - 1;
    }

    removeFrame(index) {
        this.selectedFrames.splice(index, 1);
    }

    clear() {
        this.selectedFrames = [];
    }

    async stitch(layout = "horizontal", fileName) {
        if (this.selectedFrames.length < this.minFrames) {
            throw new Error(`Select at least ${this.minFrames} frames before stitching`);
        }

        const response = await fetch(
            `/api/v2/projects/${encodeURIComponent(this.admin)}/${encodeURIComponent(this.projectName)}/videos/stitch`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    frames: this.selectedFrames.map((f) => ({ dataUrl: f.dataUrl, timestamp: f.timestamp })),
                    layout,
                    fileName,
                }),
            },
        );

        const body = await response.json();
        if (!response.ok || !body.success) {
            throw new Error(body.error || "Failed to stitch frames");
        }

        return body;
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = FrameStitchPanel;
}
