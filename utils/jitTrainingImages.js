const fs = require("fs");
const path = require("path");
const queries = require("../queries/queries");
const { buildS3Client, downloadObjectToFile } = require("./s3Client");

/**
 * Ensures all requested target images for a training run exist locally on disk.
 * If any image is S3-backed (Source === 's3' && SourceKey) and missing from disk,
 * it fetches the project S3 bucket credentials and downloads the image JIT.
 *
 * @param {string} projectName - Project name (PName)
 * @param {string} admin - Admin / owner username
 * @param {string} projectPath - Path to project directory
 * @param {Array<Object|string>} targetImages - Array of image DB rows or image names
 * @returns {Promise<Array<string>>} List of absolute file paths downloaded JIT by this call
 */
async function ensureTrainingImagesLocal(projectName, admin, projectPath, targetImages) {
    if (!Array.isArray(targetImages) || targetImages.length === 0) {
        return [];
    }

    const imagesPath = path.join(projectPath, "images");

    // Retrieve DB image records if targetImages consists of plain strings or objects missing Source
    let imageRows = targetImages;
    const firstImg = targetImages[0];
    if (typeof firstImg === "string" || !firstImg || typeof firstImg !== "object" || !("Source" in firstImg)) {
        try {
            const dbImagesResult = await queries.project.getAllImages(projectPath);
            const dbImagesMap = new Map();
            for (const row of (dbImagesResult && dbImagesResult.rows) || []) {
                dbImagesMap.set(row.IName, row);
            }

            imageRows = targetImages.map((img) => {
                const name = typeof img === "string" ? img : (img && img.IName);
                return dbImagesMap.get(name) || (typeof img === "object" && img ? img : { IName: name });
            });
        } catch (err) {
            if (global.logger && global.logger.error) {
                global.logger.error("Error fetching image DB records for JIT check:", err);
            }
        }
    }

    const missingS3Images = [];
    for (const img of imageRows) {
        if (!img || !img.IName) continue;
        const localPath = path.join(imagesPath, img.IName);
        if (!fs.existsSync(localPath) && img.Source === "s3" && img.SourceKey) {
            missingS3Images.push({ key: img.SourceKey, destPath: localPath });
        }
    }

    if (missingS3Images.length === 0) {
        return [];
    }

    const bucketResult = await queries.managed.getBucket(projectName, admin);
    const bucket = bucketResult && bucketResult.row;
    if (!bucket) {
        throw new Error(`S3 bucket configuration missing for project ${projectName}`);
    }

    const s3Client = buildS3Client({
        region: bucket.Region,
        accessKeyId: bucket.AccessKeyId,
        secretAccessKey: bucket.SecretAccessKey,
        endpoint: bucket.Endpoint,
    });

    const downloadedFiles = [];
    for (const { key, destPath } of missingS3Images) {
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        await downloadObjectToFile(s3Client, bucket.BucketName, key, destPath);
        downloadedFiles.push(destPath);
    }

    return downloadedFiles;
}

/**
 * Unlinks files downloaded JIT for a training run.
 * Leaves pre-existing local image files intact.
 *
 * @param {Array<string>} downloadedFiles - List of absolute file paths downloaded JIT
 */
async function cleanupJitTrainingImages(downloadedFiles) {
    if (!Array.isArray(downloadedFiles) || downloadedFiles.length === 0) {
        return;
    }

    for (const filePath of downloadedFiles) {
        try {
            await fs.promises.unlink(filePath);
        } catch (err) {
            if (err && err.code !== "ENOENT" && global.logger && global.logger.error) {
                global.logger.error(`Error unlinking JIT training image ${filePath}:`, err);
            }
        }
    }
}

module.exports = {
    ensureTrainingImagesLocal,
    cleanupJitTrainingImages,
};
