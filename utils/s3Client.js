const fs = require("fs");
const path = require("path");
const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { NoAuthSigner } = require("@smithy/core");

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

function buildS3Client({ region, accessKeyId, secretAccessKey, endpoint }) {
    region = typeof region === "string" ? region.trim() : region;
    accessKeyId = typeof accessKeyId === "string" ? accessKeyId.trim() : accessKeyId;
    secretAccessKey = typeof secretAccessKey === "string" ? secretAccessKey.trim() : secretAccessKey;
    endpoint = typeof endpoint === "string" ? endpoint.trim() : endpoint;

    // GCS's XML API interop endpoint only validates SigV4 signatures signed
    // with the literal region "auto" - any real region name here produces a
    // signing key that doesn't match what GCS derives, causing
    // SignatureDoesNotMatch even with correct credentials.
    if (endpoint && endpoint.includes("storage.googleapis.com")) {
        region = "auto";
    }

    const config = { region: region || "us-east-1" };

    if (accessKeyId && secretAccessKey) {
        config.credentials = { accessKeyId, secretAccessKey };
    } else {
        // No credentials supplied: assume a public bucket and send unsigned
        // requests instead of letting the SDK fall back to its default
        // credential provider chain (which would throw in this environment).
        config.httpAuthSchemeProvider = () => [{ schemeId: "smithy.api#noAuth" }];
        config.httpAuthSchemes = [
            {
                schemeId: "smithy.api#noAuth",
                identityProvider: () => async () => ({}),
                signer: new NoAuthSigner(),
            },
        ];
    }

    if (endpoint) {
        config["forcePathStyle"] = true;
        config["endpoint"] = endpoint;

        // Newer SDK versions default to attaching flexible-checksum
        // headers/trailers to requests ("WHEN_SUPPORTED"). Real AWS S3
        // handles that fine, but non-AWS S3-compatible providers (GCS,
        // MinIO, R2, ...) often can't reproduce the same signature the SDK
        // computed once those extra headers are folded in, producing
        // SignatureDoesNotMatch even with correct credentials. Only add
        // checksums when the operation actually requires them.
        config.requestChecksumCalculation = "WHEN_REQUIRED";
        config.responseChecksumValidation = "WHEN_REQUIRED";
    }

    console.log({
        ...config,
        credentials: config.credentials
            ? { accessKeyId: config.credentials.accessKeyId, secretAccessKey: "[REDACTED]" }
            : undefined,
    });

    return new S3Client(config);
}

async function verifyBucketAccess(s3Client, bucketName) {
    // HeadBucket is a HEAD request, so providers never return a body on
    // failure and the SDK can't tell us anything beyond a generic error.
    // ListObjectsV2 is a GET, so a rejection comes back with a real XML
    // error body (actual code/message), which is what makes 403s
    // diagnosable instead of surfacing as "UnknownError".
    await s3Client.send(
        new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }),
    );
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

// For "stream" sync mode: fetch an object's bytes live for a single request
// instead of persisting them to disk. Caller is responsible for piping
// response.Body to the outgoing HTTP response.
async function getObjectStream(s3Client, bucketName, key) {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
    );

    return {
        body: response.Body,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
    };
}

module.exports = {
    buildS3Client,
    verifyBucketAccess,
    listImageObjects,
    downloadObjectToFile,
    getObjectStream,
};
