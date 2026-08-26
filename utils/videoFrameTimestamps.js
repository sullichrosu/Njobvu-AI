
function parseFfprobeFrameTimes(stdout) {
    if (!stdout || !stdout.trim()) {
        return [];
    }

    return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [ptsRaw, dtsRaw] = line.split(",");
            const pts = parseFloat(ptsRaw);
            if (Number.isFinite(pts)) {
                return pts;
            }

            const dts = parseFloat(dtsRaw);
            return Number.isFinite(dts) ? dts : null;
        });
}


function buildFrameRows(timestamps, frameStep, extractedFrames) {
    if (!Array.isArray(timestamps) || timestamps.length === 0) {
        return [];
    }

    const iNameByOriginalIndex = new Map();
    for (const { frameNumber, iName } of extractedFrames || []) {
        const originalIndex = (frameNumber - 1) * frameStep;
        iNameByOriginalIndex.set(originalIndex, iName);
    }

    const rows = [];
    for (let originalIndex = 0; originalIndex < timestamps.length; originalIndex++) {
        const timestampSec = timestamps[originalIndex];
        if (timestampSec === null || timestampSec === undefined) {
            continue;
        }

        rows.push({
            frameNumber: originalIndex,
            timestampSec,
            iName: iNameByOriginalIndex.get(originalIndex) ?? null,
        });
    }

    for (const originalIndex of iNameByOriginalIndex.keys()) {
        if (originalIndex >= timestamps.length && global.logger) {
            global.logger.error(
                `videoFrameTimestamps: extracted frame at source index ${originalIndex} has no matching ffprobe timestamp (only ${timestamps.length} decoded frames found)`,
            );
        }
    }

    return rows;
}

module.exports = { parseFfprobeFrameTimes, buildFrameRows };
