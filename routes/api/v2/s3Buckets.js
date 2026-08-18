const fs = require("fs");
const path = require("path");
const queries = require("../../../queries/queries");
const {
    buildS3Client,
    verifyBucketAccess,
    listImageObjects,
    downloadObjectToFile,
} = require("../../../utils/s3Client");

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
    const rawMaxImages = body.MaxImages !== undefined ? body.MaxImages : (body.maxImages !== undefined ? body.maxImages : body.max_images);
    const MaxImages = (rawMaxImages !== undefined && rawMaxImages !== null && rawMaxImages !== "") ? parseInt(rawMaxImages, 10) : null;

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
            MaxImages
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

        const maxImg = row.MaxImages != null ? Number(row.MaxImages) : null;

        return res.status(200).json({
            success: true,
            bucket: {
                BucketName: row.BucketName,
                Region: row.Region,
                Prefix: row.Prefix,
                Endpoint: row.Endpoint,
                MaxImages: maxImg,
                max_images: maxImg,
                LastSyncedAt: row.LastSyncedAt,
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

        const s3Client = buildS3Client({
            region: bucket.Region,
            accessKeyId: bucket.AccessKeyId,
            secretAccessKey: bucket.SecretAccessKey,
            endpoint: bucket.Endpoint,
        });

        const maxImages = bucket.MaxImages != null ? Number(bucket.MaxImages) : null;
        const objectKeys = await listImageObjects(s3Client, bucket.BucketName, bucket.Prefix);
        const existingImages = new Set(await global.readdirAsync(imagesPath));

        const syncedImages = [];
        let skippedCount = 0;

        for (const key of objectKeys) {
            if (Number.isFinite(maxImages) && maxImages > 0 && existingImages.size >= maxImages) {
                break;
            }

            const fileName = sanitizeFileName(path.basename(key));

            if (!fileName || existingImages.has(fileName)) {
                skippedCount += 1;
                continue;
            }

            const destPath = path.join(imagesPath, fileName);
            await downloadObjectToFile(s3Client, bucket.BucketName, key, destPath);
            await queries.project.addImages(projectPath, fileName, 0, 0);

            existingImages.add(fileName);
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

module.exports = {
    attachS3Bucket,
    getS3Bucket,
    deleteS3Bucket,
    syncS3Bucket,
};
