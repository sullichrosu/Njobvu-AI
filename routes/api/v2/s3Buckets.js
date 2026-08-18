const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const queries = require("../../../queries/queries");
const {
    buildS3Client,
    verifyBucketAccess,
    listImageObjects,
    downloadObjectToFile,
    getObjectStream,
} = require("../../../utils/s3Client");

const SYNC_MODES = new Set(["download", "stream"]);

function getProjectPath(admin, projectName) {
    return path.join(currentPath, "public", "projects", `${admin}-${projectName}`);
}

function isOwner(req, admin) {
    return req.cookies && req.cookies.Username === admin;
}

function sanitizeFileName(name) {
    return name
        .trim()
        .split(" ")
        .join("_")
        .split("+")
        .join("_");
}

// Two distinct S3 keys can share a basename (e.g. "2024/img.jpg" and
// "2025/img.jpg"), so a plain basename can't be assumed unique across a
// bucket. Disambiguate deterministically from the full key so re-running a
// sync never renames or duplicates a file that was already given a suffix.
function disambiguateFileName(fileName, key) {
    const ext = path.extname(fileName);
    const base = fileName.slice(0, fileName.length - ext.length);
    const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);

    return `${base}_${hash}${ext}`;
}

function trimOrUndefined(value) {
    return typeof value === "string" ? value.trim() : value;
}

async function attachS3Bucket(req, res) {
    const { admin, projectName } = req.params;
    const body = req.body || {};
    const BucketName = trimOrUndefined(body.BucketName);
    const Region = trimOrUndefined(body.Region);
    const Prefix = trimOrUndefined(body.Prefix);
    const AccessKeyId = trimOrUndefined(body.AccessKeyId);
    const SecretAccessKey = trimOrUndefined(body.SecretAccessKey);
    const Endpoint = trimOrUndefined(body.Endpoint);
    const SyncMode = SYNC_MODES.has(body.SyncMode) ? body.SyncMode : "download";

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    if (!BucketName || !Region) {
        return res.status(400).json({ success: false, error: "BucketName and Region are required" });
    }

    const projectPath = getProjectPath(admin, projectName);
    if (!fs.existsSync(projectPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    try {
        const s3Client = buildS3Client({
            region: Region,
            accessKeyId: AccessKeyId,
            secretAccessKey: SecretAccessKey,
            endpoint: Endpoint,
        });

        await verifyBucketAccess(s3Client, BucketName);

        await queries.managed.attachBucket(
            projectName,
            admin,
            BucketName,
            Region,
            Prefix || "",
            AccessKeyId,
            SecretAccessKey,
            Endpoint || "",
            SyncMode,
        );

        return res.status(200).json({ success: true });
    } catch (err) {
        global.logger.error(err, {
            httpStatusCode: err.$metadata?.httpStatusCode,
            code: err.Code || err.name,
            requestId: err.$metadata?.requestId,
        });
        return res.status(400).json({
            success: false,
            error: "Could not verify or attach S3 bucket. Check credentials and permissions.",
        });
    }
}

async function getS3Bucket(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    try {
        const result = await queries.managed.getBucket(projectName, admin);
        const row = result && result.row;

        if (!row) {
            return res.status(404).json({ success: false, error: "No S3 bucket attached" });
        }

        return res.status(200).json({
            success: true,
            bucket: {
                BucketName: row.BucketName,
                Region: row.Region,
                Prefix: row.Prefix,
                Endpoint: row.Endpoint,
                LastSyncedAt: row.LastSyncedAt,
                SyncMode: row.SyncMode || "download",
                hasCredentials: !!row.AccessKeyId,
            },
        });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error fetching S3 bucket" });
    }
}

async function deleteS3Bucket(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    try {
        await queries.managed.deleteBucket(projectName, admin);
        return res.status(200).json({ success: true });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error removing S3 bucket" });
    }
}

async function syncS3Bucket(req, res) {
    const { admin, projectName } = req.params;

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    const projectPath = getProjectPath(admin, projectName);
    const imagesPath = path.join(projectPath, "images");

    if (!fs.existsSync(imagesPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    try {
        const bucketResult = await queries.managed.getBucket(projectName, admin);
        const bucket = bucketResult && bucketResult.row;

        if (!bucket) {
            return res.status(404).json({ success: false, error: "No S3 bucket attached to this project" });
        }

        console.log(bucket);

        const s3Client = buildS3Client({
            region: bucket.Region,
            accessKeyId: bucket.AccessKeyId,
            secretAccessKey: bucket.SecretAccessKey,
            endpoint: bucket.Endpoint,
        });

        const objectKeys = await listImageObjects(s3Client, bucket.BucketName, bucket.Prefix);

        // Snapshot of what's on disk *before* this run - unrelated to what this run
        // itself assigns. A basename already present here (a prior sync from before
        // SourceKey existed, or an unrelated local file) is treated as already covered,
        // same as before. `assignedNames` starts from this snapshot and grows as this
        // run hands out names, so it also catches two keys *from this same bucket
        // listing* colliding with each other.
        const preExistingImages = new Set(await global.readdirAsync(imagesPath));
        const assignedNames = new Set(preExistingImages);

        const existingImageRows = await queries.project.getAllImages(projectPath);
        const existingSourceKeys = new Set(
            (existingImageRows.rows || [])
                .map((row) => row.SourceKey)
                .filter(Boolean),
        );

        const syncedImages = [];
        let skippedCount = 0;

        for (const key of objectKeys) {
            // Already synced this exact object in a prior run - never re-download or
            // re-disambiguate a key we've already assigned a name to.
            if (existingSourceKeys.has(key)) {
                skippedCount += 1;
                continue;
            }

            const baseName = sanitizeFileName(path.basename(key));

            if (!baseName) {
                skippedCount += 1;
                continue;
            }

            if (preExistingImages.has(baseName)) {
                skippedCount += 1;
                continue;
            }

            // A different key from this same bucket listing already claimed this
            // basename - these are genuinely distinct objects, so disambiguate instead
            // of dropping this one.
            const fileName = assignedNames.has(baseName)
                ? disambiguateFileName(baseName, key)
                : baseName;

            // "stream" mode registers the image (so it's browsable/labelable) without
            // pulling its bytes to disk - GET .../images/:imageName fetches them from
            // the bucket live, on the rare request that actually needs them.
            if (bucket.SyncMode !== "stream") {
                const destPath = path.join(imagesPath, fileName);
                await downloadObjectToFile(s3Client, bucket.BucketName, key, destPath);
            }

            await queries.project.addImages(projectPath, fileName, 0, 0, "s3", key);

            assignedNames.add(fileName);
            existingSourceKeys.add(key);
            syncedImages.push(fileName);
        }

        await queries.managed.touchBucketSyncedAt(projectName, admin, new Date().toISOString());

        return res.status(200).json({
            success: true,
            syncedCount: syncedImages.length,
            skippedCount,
            images: syncedImages,
        });
    } catch (err) {
        global.logger.error(err, {
            httpStatusCode: err.$metadata?.httpStatusCode,
            code: err.Code || err.name,
            requestId: err.$metadata?.requestId,
        });
        return res.status(500).json({ success: false, error: "Error syncing S3 bucket" });
    }
}

// Serves a single project image, transparently covering both storage modes:
// a locally-present file (the common case - local imports, or "download"-mode
// S3 sync) is sent straight from disk; an image registered from S3 that was
// never downloaded ("stream" mode) is fetched from the bucket live, for this
// request only, and never written to disk. Any logged-in user can view it -
// this mirrors the existing (also unauthenticated) static file serving for
// local images, rather than introducing a stricter, inconsistent check here.
async function getProjectImage(req, res) {
    const { admin, projectName, imageName } = req.params;

    if (!req.cookies || !req.cookies.Username) {
        return res.status(403).json({ success: false, error: "Not authorized" });
    }

    const projectPath = getProjectPath(admin, projectName);
    const localPath = path.join(projectPath, "images", imageName);

    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }

    try {
        const imageResult = await queries.project.getImage(projectPath, imageName);
        const image = imageResult && imageResult.row;

        if (!image || image.Source !== "s3" || !image.SourceKey) {
            return res.status(404).json({ success: false, error: "Image not found" });
        }

        const bucketResult = await queries.managed.getBucket(projectName, admin);
        const bucket = bucketResult && bucketResult.row;

        if (!bucket) {
            return res.status(404).json({ success: false, error: "No S3 bucket attached to this project" });
        }

        const s3Client = buildS3Client({
            region: bucket.Region,
            accessKeyId: bucket.AccessKeyId,
            secretAccessKey: bucket.SecretAccessKey,
            endpoint: bucket.Endpoint,
        });

        const { body, contentType } = await getObjectStream(s3Client, bucket.BucketName, image.SourceKey);

        res.setHeader("Content-Type", contentType || "application/octet-stream");
        body.on("error", (err) => {
            global.logger.error(err);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });
        body.pipe(res);
    } catch (err) {
        global.logger.error(err, {
            httpStatusCode: err.$metadata?.httpStatusCode,
            code: err.Code || err.name,
            requestId: err.$metadata?.requestId,
        });
        return res.status(500).json({ success: false, error: "Error fetching image" });
    }
}

module.exports = {
    attachS3Bucket,
    getS3Bucket,
    deleteS3Bucket,
    syncS3Bucket,
    getProjectImage,
};
