const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { runSandboxedPython, sanitizeCode } = require("../utils/sandboxedPythonRunner");
const { generateRunSummary } = require("../utils/runSummaryGenerator");

describe("Sandboxed Python Execution Runner", () => {
    test("sanitizes forbidden python code patterns", () => {
        expect(() => sanitizeCode("import os", "user")).toThrow(/Forbidden code pattern/);
        expect(() => sanitizeCode("import subprocess", "user")).toThrow(/Forbidden code pattern/);
        expect(() => sanitizeCode("eval('print(1)')", "user")).toThrow(/Forbidden code pattern/);
        expect(() => sanitizeCode("print('Hello World')", "user")).not.toThrow();
    });

    test("enforces user role check", () => {
        expect(() => sanitizeCode("print(123)", "guest_invalid")).toThrow(/not authorized/);
    });

    test("executes valid Python code safely", async () => {
        const result = await runSandboxedPython({
            code: "print('SANDBOX_TEST_OK')",
            userRole: "user",
            timeout: 5000
        });

        expect(result.success).toBe(true);
        expect(result.stdout).toContain("SANDBOX_TEST_OK");
        expect(result.timedOut).toBe(false);
    });

    test("handles code timeout appropriately", async () => {
        const result = await runSandboxedPython({
            code: "import time\ntime.sleep(2)",
            userRole: "user",
            timeout: 200
        });

        expect(result.success).toBe(false);
        expect(result.timedOut).toBe(true);
    }, 10000);
});

describe("Run Summary Generator", () => {
    const testRunDir = path.join(__dirname, "tmp_test_run");

    beforeAll(() => {
        if (!fs.existsSync(testRunDir)) {
            fs.mkdirSync(testRunDir, { recursive: true });
        }
        fs.writeFileSync(path.join(testRunDir, "args.yaml"), "epochs: 10\nbatch: 16\nmodel: yolov8n.pt", "utf8");
        fs.writeFileSync(path.join(testRunDir, "results.csv"), "epoch, mAP50\n1, 0.45\n2, 0.78\n3, 0.85", "utf8");
        fs.writeFileSync(path.join(testRunDir, "test_img.jpg"), "dummy image data", "utf8");
    });

    afterAll(() => {
        if (fs.existsSync(testRunDir)) {
            fs.rmSync(testRunDir, { recursive: true, force: true });
        }
    });

    test("generates summary.json and run_summary.md inside run directory", async () => {
        const summary = await generateRunSummary(testRunDir, { runType: "training", runName: "test_training_run" });

        expect(summary.runName).toBe("test_training_run");
        expect(summary.imageCount).toBe(1);
        expect(summary.metrics.totalEpochs).toBe(3);
        expect(summary.metrics.bestMap50).toBe(0.85);

        const summaryJsonPath = path.join(testRunDir, "summary.json");
        const summaryMdPath = path.join(testRunDir, "run_summary.md");

        expect(fs.existsSync(summaryJsonPath)).toBe(true);
        expect(fs.existsSync(summaryMdPath)).toBe(true);

        const mdContent = fs.readFileSync(summaryMdPath, "utf8");
        expect(mdContent).toContain("# Run Summary: test_training_run");
    });
});

describe("Sandbox API Routes", () => {
    test("POST /api/sandbox/python - executes python code", async () => {
        const res = await request(app)
            .post("/api/sandbox/python")
            .send({
                code: "print('API_PYTHON_TEST')",
                userRole: "admin"
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.stdout).toContain("API_PYTHON_TEST");
    });

    test("POST /api/sandbox/python - blocks forbidden code", async () => {
        const res = await request(app)
            .post("/api/sandbox/python")
            .send({
                code: "import os\nos.system('ls')",
                userRole: "user"
            });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain("Forbidden code pattern");
    });

    test("POST /api/runs/summary - creates run summary via API", async () => {
        const runDir = path.join(__dirname, "tmp_api_run");
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, "config.json"), JSON.stringify({ model: "custom" }), "utf8");
        fs.writeFileSync(path.join(runDir, "output.jpg"), "data", "utf8");

        const res = await request(app)
            .post("/api/runs/summary")
            .send({
                runDir,
                runName: "api_run_test"
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.runName).toBe("api_run_test");

        fs.rmSync(runDir, { recursive: true, force: true });
    });
});
