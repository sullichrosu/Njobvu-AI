const fs = require("fs");
const path = require("path");
const {
    S3Client,
    HeadBucketCommand,
    ListObjectsV2Command,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");

const IMAGE_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".tif",
    ".tiff",
    ".gif",
    ".webp",
]);

function buildS3Client({ region, accessKeyId, secretAccessKey }) {
    const config = { region: region || "us-east-1" };

    if (accessKeyId && secretAccessKey) {
        config.credentials = { accessKeyId, secretAccessKey };
    }

    return new S3Client(config);
}

async function verifyBucketAccess(s3Client, bucketName) {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucketName }));
}

async function listImageObjects(s3Client, bucketName, prefix = "") {
    const objects = [];
    let continuationToken;

    do {
        const response = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix || undefined,
                ContinuationToken: continuationToken,
            }),
        );

        for (const object of response.Contents || []) {
            if (!object.Key || object.Key.endsWith("/")) {
                continue;
            }

            if (IMAGE_EXTENSIONS.has(path.extname(object.Key).toLowerCase())) {
                objects.push(object.Key);
            }
        }

        continuationToken = response.IsTruncated
            ? response.NextContinuationToken
            : undefined;
    } while (continuationToken);

    return objects;
}

async function downloadObjectToFile(s3Client, bucketName, key, destPath) {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );

    await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(destPath);
        response.Body.pipe(writeStream);
        response.Body.on("error", reject);
        writeStream.on("error", reject);
        writeStream.on("finish", resolve);
    });
}

module.exports = {
    buildS3Client,
    verifyBucketAccess,
    listImageObjects,
    downloadObjectToFile,
};
