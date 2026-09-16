const fs = require("fs");
const path = require("path");
const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");

const { prepareInferenceDataset } = require("../../utils/inferenceDatasetPipeline");
const uploadInferenceFile = require("../../routes/inference/uploadInferenceFile");
const { attachS3Bucket, syncS3Bucket } = require("../../routes/api/v2/s3Buckets");
const queries = require("../../queries/queries");
const s3Client = require("../../utils/s3Client");

jest.mock("../../queries/queries", () => ({
    managed: {
        getBucket: jest.fn(),
        attachBucket: jest.fn().mockResolvedValue({ success: true }),
        touchBucketSyncedAt: jest.fn().mockResolvedValue({ success: true }),
    },
    project: {
        addImages: jest.fn().mockResolvedValue({ success: true }),
        getAllImages: jest.fn().mockResolvedValue({ success: true, rows: [] }),
    },
}));

jest.mock("../../utils/s3Client", () => ({
    buildS3Client: jest.fn(() => ({ fake: true })),
    verifyBucketAccess: jest.fn().mockResolvedValue(undefined),
    listImageObjects: jest.fn().mockResolvedValue(["img1.jpg", "img2.jpg", "img3.jpg"]),
    downloadObjectToFile: jest.fn().mockImplementation(async (client, bucket, key, dest) => {
        require("fs").writeFileSync(dest, "fake image content");
    }),
}));

jest.mock("../../utils/unzipFile", () => jest.fn().mockImplementation(async (zipPath, outDir) => {
    const mockFs = require("fs");
    mockFs.mkdirSync(outDir, { recursive: true });
    mockFs.writeFileSync(require("path").join(outDir, "extracted_image.jpg"), "extracted content");
    mockFs.writeFileSync(require("path").join(outDir, "extracted_video.mp4"), "video content");
}));

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.post("/upload_inference_file", (req, res, next) => {
        req.files = req.files || {};
        next();
    }, uploadInferenceFile);
    app.post("/api/v2/projects/:admin/:projectName/s3-bucket", attachS3Bucket);
    app.post("/api/v2/projects/:admin/:projectName/s3-bucket/sync", syncS3Bucket);
    return app;
}

describe("Inference Dataset Pipeline & S3 Max Image Limit", () => {
    const tmpDir = path.join(__dirname, "../tmp_dataset_test");

    beforeAll(() => {
        global.currentPath = tmpDir + "/";
        global.logger = { error: jest.fn(), debug: jest.fn() };
        global.readdirAsync = jest.fn().mockResolvedValue([]);
        fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("prepareInferenceDataset utility", () => {
        it("extracts zip archives (images & videos) for inference", async () => {
            const uploadDir = path.join(tmpDir, "public/projects/admin1-proj1/inference/uploads");
            fs.mkdirSync(uploadDir, { recursive: true });
            const zipPath = path.join(uploadDir, "sample.zip");
            fs.writeFileSync(zipPath, "dummy zip binary");

            const result = await prepareInferenceDataset({
                PName: "proj1",
                Admin: "admin1",
                inference_file: "sample.zip",
                projectPath: path.join(tmpDir, "public/projects/admin1-proj1"),
                inferenceUploadPath: uploadDir,
            });

            expect(result.isZipExtracted).toBe(true);
            expect(result.inferenceFilePath).toBe(path.join(uploadDir, "sample"));
            expect(fs.existsSync(path.join(uploadDir, "sample/extracted_image.jpg"))).toBe(true);
        });

        it("pulls S3 image stream up to configured maxImages limit for inference", async () => {
            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: "my-bucket",
                    Region: "us-east-1",
                    Prefix: "images/",
                    MaxImages: 2,
                    AccessKeyId: "key",
                    SecretAccessKey: "secret",
                },
            });

            const uploadDir = path.join(tmpDir, "public/projects/admin1-proj1/inference/uploads");
            fs.mkdirSync(uploadDir, { recursive: true });

            const result = await prepareInferenceDataset({
                PName: "proj1",
                Admin: "admin1",
                use_s3_bucket: true,
                max_images: 2,
                projectPath: path.join(tmpDir, "public/projects/admin1-proj1"),
                inferenceUploadPath: uploadDir,
            });

            expect(result.isS3Stream).toBe(true);
            expect(result.syncedCount).toBe(2);
            expect(s3Client.downloadObjectToFile).toHaveBeenCalledTimes(2);
        });
    });

    describe("syncS3Bucket with maxImages limit", () => {
        it("respects maxImages limit during bucket sync", async () => {
            const projectDir = path.join(tmpDir, "public/projects/testuser-test-project/images");
            fs.mkdirSync(projectDir, { recursive: true });

            queries.managed.getBucket.mockResolvedValueOnce({
                row: {
                    BucketName: "test-bucket",
                    Region: "us-east-1",
                    Prefix: "images/",
                    AccessKeyId: "key",
                    SecretAccessKey: "secret",
                },
            });
            s3Client.listImageObjects.mockResolvedValueOnce(["images/1.jpg", "images/2.jpg", "images/3.jpg"]);

            const app = buildApp();
            const res = await request(app)
                .post("/api/v2/projects/testuser/test-project/s3-bucket/sync")
                .set("Cookie", ["Username=testuser"])
                .send({ maxImages: 2 });

            expect(res.statusCode).toBe(200);
            expect(res.body.syncedCount).toBe(2);
            expect(s3Client.downloadObjectToFile).toHaveBeenCalledTimes(2);
        });
    });

    describe("attachS3Bucket without MaxImages column", () => {
        it("attaches bucket successfully without MaxImages in DB", async () => {
            const projectDir = path.join(tmpDir, "public/projects/testuser-test-project");
            fs.mkdirSync(projectDir, { recursive: true });

            const app = buildApp();
            const res = await request(app)
                .post("/api/v2/projects/testuser/test-project/s3-bucket")
                .set("Cookie", ["Username=testuser"])
                .send({
                    BucketName: "test-bucket",
                    Region: "us-east-1",
                });

            expect(res.statusCode).toBe(200);
            expect(queries.managed.attachBucket).toHaveBeenCalledWith(
                "test-project",
                "testuser",
                "test-bucket",
                "us-east-1",
                "",
                undefined,
                undefined,
                "",
                "download",
            );
        });
    });
});
