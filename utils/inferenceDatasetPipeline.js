const fs = require("fs");
const path = require("path");
const unzipFile = require("./unzipFile");
const queries = require("../queries/queries");
const { buildS3Client, listImageObjects, downloadObjectToFile } = require("./s3Client");

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

    const effectiveMaxImages = max_images || maxImages || limit;

    let targetFilePath = inference_file;

    // S3 Bucket stream mode
    if (use_s3_bucket || inference_file === "s3" || inference_file === "s3_bucket") {
        const bucketResult = await queries.managed.getBucket(PName, Admin);
        const bucket = bucketResult && bucketResult.row;

        if (!bucket) {
            throw new Error("No S3 bucket attached to this project");
        }

        const rawLimit = effectiveMaxImages || bucket.MaxImages || 100;
        const maxLimit = parseInt(rawLimit, 10);
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

        const objectKeys = await listImageObjects(s3Client, bucket.BucketName, bucket.Prefix);
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
