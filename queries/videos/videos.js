const getDbClient = require("../getDbClient");

module.exports = {
    project: {
        createVideo: async function (
            projectPath,
            originalFileName,
            storedFileName,
            framePrefix,
            frameStep,
            durationSec,
            fps,
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO Videos (OriginalFileName, StoredFileName, FramePrefix, FrameStep, DurationSec, Fps) VALUES (?, ?, ?, ?, ?, ?)";
            const result = await db.run(query, [
                originalFileName,
                storedFileName,
                framePrefix,
                frameStep,
                durationSec,
                fps,
            ]);

            return result;
        },
        insertFrames: async function (projectPath, videoId, frameRows) {
            const db = getDbClient(projectPath);

            await db.run("BEGIN TRANSACTION");

            try {
                for (const row of frameRows) {
                    await db.run(
                        "INSERT INTO Frames (VideoId, FrameNumber, TimestampSec, IName) VALUES (?, ?, ?, ?)",
                        [videoId, row.frameNumber, row.timestampSec, row.iName ?? null],
                    );
                }

                await db.run("COMMIT");
            } catch (err) {
                await db.run("ROLLBACK").catch(() => {});
                throw err;
            }
        },
        getVideoForImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT Videos.* FROM Videos JOIN Frames ON Videos.VideoId = Frames.VideoId WHERE Frames.IName = ?";
            const result = await db.get(query, [imageName]);

            return result;
        },
        getFramesForVideo: async function (projectPath, videoId) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT FrameNumber, TimestampSec, IName FROM Frames WHERE VideoId = ? ORDER BY FrameNumber";
            const result = await db.all(query, [videoId]);

            return result;
        },
    },
};
