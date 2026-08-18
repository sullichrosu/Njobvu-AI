const fs = require("fs");
const path = require("path");
const unzipFile = require("./unzipFile");
const queries = require("../queries/queries");
const { buildS3Client, listImageObjects, downloadObjectToFile } = require("./s3Client");

const DEFAULT_MAX_IMAGES = 100;
const SAFETY_CEILING_MAX_IMAGES = 5000;

async function prepareInferenceDataset(options) {
    const {
        PName,
        Admin,
        inference_file,
        use_s3_bucket,
        max_images,
        maxImages,
        limit,
        projectPath,
        inferenceUploadPath,
    } = options;

    const rawLimit = max_images || maxImages || limit;
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : null;
    const maxLimit = parsedLimit && Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, SAFETY_CEILING_MAX_IMAGES)
        : DEFAULT_MAX_IMAGES;

    let targetFilePath = inference_file;

    // S3 Bucket stream mode (JIT fetch right before inference run execution)
    if (use_s3_bucket || inference_file === "s3" || inference_file === "s3_bucket") {
        const bucketResult = await queries.managed.getBucket(PName, Admin);
        const bucket = bucketResult && bucketResult.row;

        if (!bucket) {
            throw new Error("No S3 bucket attached to this project");
        }

        const dateStamp = Date.now();
        const s3StreamFolder = path.join(inferenceUploadPath, `s3_stream_${dateStamp}`);

        if (!fs.existsSync(s3StreamFolder)) {
            fs.mkdirSync(s3StreamFolder, { recursive: true });
        }

        const s3Client = buildS3Client({
            region: bucket.Region,
            accessKeyId: bucket.AccessKeyId,
            secretAccessKey: bucket.SecretAccessKey,
            endpoint: bucket.Endpoint,
        });

        // Pass maxLimit directly to listImageObjects so S3 listing stops early
        const objectKeys = await listImageObjects(s3Client, bucket.BucketName, bucket.Prefix, maxLimit);
        let downloaded = 0;

        for (const key of objectKeys) {
            if (downloaded >= maxLimit) {
                break;
            }
            const fileName = path.basename(key).replace(/[ +]/g, "_");
            const destPath = path.join(s3StreamFolder, fileName);
            await downloadObjectToFile(s3Client, bucket.BucketName, key, destPath);
            downloaded++;
        }

        return {
            inferenceFilePath: s3StreamFolder,
            isS3Stream: true,
            syncedCount: downloaded,
        };
    }

    // Resolve local file path
    if (targetFilePath && !fs.existsSync(targetFilePath)) {
        const fallbackPath = path.join(inferenceUploadPath, targetFilePath);
        if (fs.existsSync(fallbackPath)) {
            targetFilePath = fallbackPath;
        }
    }

    // Zip/7z archive extraction
    if (targetFilePath && fs.existsSync(targetFilePath)) {
        const ext = path.extname(targetFilePath).toLowerCase();
        if (ext === ".zip" || ext === ".7z") {
            const folderName = path.parse(targetFilePath).name;
            const outputDir = path.join(inferenceUploadPath, folderName);

            if (!fs.existsSync(outputDir)) {
                await unzipFile(targetFilePath, outputDir);
            }

            return {
                inferenceFilePath: outputDir,
                isZipExtracted: true,
            };
        }
    }

    return {
        inferenceFilePath: targetFilePath || inference_file,
    };
}

module.exports = {
    prepareInferenceDataset,
};
