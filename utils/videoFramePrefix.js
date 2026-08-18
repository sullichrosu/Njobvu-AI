const path = require("path");

// Matches the sanitization already applied to uploaded file names elsewhere
// in createProject.js/addImages.js, so a video's frame prefix stays
// consistent with how the rest of the app normalizes file names on disk.
function sanitizeFrameToken(name) {
    return name.trim().split(" ").join("_").split("+").join("_");
}

// Derives the prefix ffmpeg will stamp on every frame extracted from a
// video (`<prefix>_<n>.jpg`). Two videos uploaded together can share an
// original file name (e.g. two camera exports both called "video.mp4"),
// which would otherwise make their frame numbering collide from frame 1;
// `usedPrefixes` lets the caller keep prefixes unique across one batch.
function nextVideoFramePrefix(videoFileName, usedPrefixes) {
    const base = sanitizeFrameToken(
        path.basename(videoFileName, path.extname(videoFileName)),
    ) || "video";

    let prefix = base;
    let dedupeIndex = 1;
    while (usedPrefixes.has(prefix)) {
        prefix = `${base}_${dedupeIndex}`;
        dedupeIndex++;
    }

    usedPrefixes.add(prefix);
    return prefix;
}

module.exports = { sanitizeFrameToken, nextVideoFramePrefix };
