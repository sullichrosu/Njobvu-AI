const fs = require("fs");
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
// The dedupe suffix is zero-padded (`_001`, `_002`, ...) rather than plain
// (`_1`, `_2`, ...) so titles still sort intuitively wherever they're
// ordered as plain strings instead of naturally/numerically -- otherwise
// "video_10" sorts before "video_2".
function nextVideoFramePrefix(videoFileName, usedPrefixes) {
    const base = sanitizeFrameToken(
        path.basename(videoFileName, path.extname(videoFileName)),
    ) || "video";

    let prefix = base;
    let dedupeIndex = 1;
    while (usedPrefixes.has(prefix)) {
        prefix = `${base}_${String(dedupeIndex).padStart(3, "0")}`;
        dedupeIndex++;
    }

    usedPrefixes.add(prefix);
    return prefix;
}

// ffmpeg writes each video's frames as `<prefix>_<n>.jpg` with a bare `%d`
// (n = 1, 2, 3, ... -- ffmpeg does not zero-pad a plain `%d` pattern). That's
// fine for the DB, which reads frames back in via a numeric-aware sort, but
// it means a plain string sort (a file browser, an S3 listing, an external
// tool) would order "prefix_10.jpg" before "prefix_2.jpg". This renames one
// video's extracted frames in place to a zero-padded width sized to *that
// video's own* frame count -- a 9-frame video gets single-digit names, a

function zeroPadExtractedFrames(imagesPath, framePrefix) {
    const escapedPrefix = framePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const frameNamePattern = new RegExp(`^${escapedPrefix}_(\\d+)\\.jpg$`);

    const frames = fs.readdirSync(imagesPath)
        .map((name) => {
            const match = name.match(frameNamePattern);
            return match ? { name, num: Number(match[1]) } : null;
        })
        .filter(Boolean);

    if (frames.length === 0) {
        return [];
    }

    const width = String(Math.max(...frames.map((frame) => frame.num))).length;

    const renamed = [];
    for (const { name, num } of frames) {
        const paddedName = `${framePrefix}_${String(num).padStart(width, "0")}.jpg`;
        if (paddedName !== name) {
            fs.renameSync(
                path.join(imagesPath, name),
                path.join(imagesPath, paddedName),
            );
        }
        renamed.push({ frameNumber: num, iName: paddedName });
    }

    renamed.sort((a, b) => a.frameNumber - b.frameNumber);
    return renamed;
}

module.exports = { sanitizeFrameToken, nextVideoFramePrefix, zeroPadExtractedFrames };
