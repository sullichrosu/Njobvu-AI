const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../app");
const { runSandboxedPython, sanitizeCode } = require("../utils/sandboxedPythonRunner");
const { generateRunSummary, listAvailableRuns, buildRunDocumentContext, persistCustomSummary, generateModelCard } = require("../utils/runSummaryGenerator");

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
            userRole: "admin",
            timeout: 200
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("timed out");
    });
});

describe("Run Summary Generator & Discovery", () => {
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

    test("generates aggregated all-runs summary when target directory contains multiple run subdirectories", async () => {
        const aggregatedSummary = await generateRunSummary(__dirname, { allRuns: true, projectName: "tmp_test_run", baseRunsDir: __dirname });

        expect(aggregatedSummary.isAggregated).toBe(true);
        expect(aggregatedSummary.totalRuns).toBeGreaterThan(0);
        expect(aggregatedSummary.findings).toBeDefined();
        expect(Array.isArray(aggregatedSummary.runs)).toBe(true);
    });

    test("listAvailableRuns discovers run directories and metadata with project filtering", () => {
        const allRuns = listAvailableRuns(null, __dirname);
        expect(Array.isArray(allRuns)).toBe(true);
        expect(Array.isArray(allRuns.train)).toBe(true);
        expect(Array.isArray(allRuns.inference)).toBe(true);
        const testRun = allRuns.find(r => r.runName === "tmp_test_run");
        expect(testRun).toBeDefined();
        expect(testRun.runType).toBe("training");

        const filteredRuns = listAvailableRuns("tmp_test_run", __dirname);
        expect(filteredRuns.length).toBeGreaterThan(0);
        expect(filteredRuns[0].runName).toBe("tmp_test_run");
        expect(filteredRuns.train.length).toBeGreaterThan(0);

        const nonExistentFilter = listAvailableRuns("non_existent_project_12345", __dirname);
        expect(nonExistentFilter.length).toBe(0);
    });

    test("buildRunDocumentContext compiles run artifacts into LLM prompt context block", async () => {
        const contextText = await buildRunDocumentContext(testRunDir, { runName: "tmp_test_run" });
        expect(typeof contextText).toBe("string");
        expect(contextText).toContain("RUN DOCUMENT ARTIFACT CONTEXT");
        expect(contextText).toContain("epochs: 10");
        expect(contextText).toContain("results.csv");
    });

    test("persistCustomSummary writes custom LLM narrative to run_summary.md and summary.json", () => {
        const narrative = "# Custom LLM Performance Report\n\nModel trained for 3 epochs with peak mAP50 of 85%.";
        const updated = persistCustomSummary(testRunDir, narrative);

        expect(updated.customNarrative).toBe(narrative);
        const mdContent = fs.readFileSync(path.join(testRunDir, "run_summary.md"), "utf8");
        expect(mdContent).toBe(narrative);
    });

    test("discovery excludes structural directories and deduplicates duplicate run names", async () => {
        const fixture = path.join(__dirname, "tmp_discovery_fixture");
        const training = path.join(fixture, "classification", "training");
        const trainingAlt = path.join(fixture, "classification", "training_alt");
        const weightsDir = path.join(training, "weights");
        const trainDir = path.join(training, "train");
        const train2Dir = path.join(training, "train2");
        const train2AltDir = path.join(trainingAlt, "train2");
        const tsDir = path.join(training, "1785814743658");

        fs.mkdirSync(weightsDir, { recursive: true });
        fs.mkdirSync(trainDir, { recursive: true });
        fs.mkdirSync(train2Dir, { recursive: true });
        fs.mkdirSync(train2AltDir, { recursive: true });
        fs.mkdirSync(tsDir, { recursive: true });

        fs.writeFileSync(path.join(weightsDir, "best.pt"), "checkpoint", "utf8");
        fs.writeFileSync(path.join(trainDir, "args.yaml"), "epochs: 100\n", "utf8");
        fs.writeFileSync(path.join(trainDir, "results.csv"), "epoch,mAP50\n1,0.4\n", "utf8");
        fs.writeFileSync(path.join(train2Dir, "args.yaml"), "epochs: 10\n", "utf8");
        fs.writeFileSync(path.join(train2Dir, "results.csv"), "epoch,mAP50\n1,0.5\n", "utf8");
        fs.writeFileSync(path.join(tsDir, "args.yaml"), "epochs: 3\n", "utf8");
        fs.writeFileSync(path.join(tsDir, "labels.jpg"), "image", "utf8");
        fs.writeFileSync(path.join(train2AltDir, "args.yaml"), "epochs: 10\n", "utf8");
        fs.writeFileSync(path.join(train2AltDir, "results.csv"), "epoch,mAP50\n1,0.6\n", "utf8");
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(train2AltDir, later, later);
        fs.utimesSync(path.join(train2AltDir, "args.yaml"), later, later);
        fs.utimesSync(path.join(train2AltDir, "results.csv"), later, later);

        try {
            const runs = listAvailableRuns("classification", fixture);
            const names = runs.map(r => r.runName).sort();
            expect(names).toEqual(["1785814743658", "train", "train2"]);

            const train2Matches = runs.filter(r => r.runName === "train2");
            expect(train2Matches.length).toBe(1);
            expect(train2Matches[0].runPath).toBe(path.resolve(train2AltDir));

            expect(runs.some(r => r.runName === "weights")).toBe(false);
            expect(runs.some(r => r.runName === "training")).toBe(false);
            expect(runs.some(r => r.runName === "training_alt")).toBe(false);
        } finally {
            fs.rmSync(fixture, { recursive: true, force: true });
        }
    });

    test("aggregated summary writes per-run summaries into each run's own output directory", async () => {
        const fixture = path.join(__dirname, "tmp_agg_fixture");
        const runA = path.join(fixture, "training", "runA");
        const runB = path.join(fixture, "training", "runB");
        fs.mkdirSync(runA, { recursive: true });
        fs.mkdirSync(runB, { recursive: true });
        fs.writeFileSync(path.join(runA, "args.yaml"), "epochs: 5\n", "utf8");
        fs.writeFileSync(path.join(runA, "results.csv"), "epoch,mAP50\n1,0.4\n", "utf8");
        fs.writeFileSync(path.join(runB, "args.yaml"), "epochs: 3\n", "utf8");
        fs.writeFileSync(path.join(runB, "results.csv"), "epoch,mAP50\n1,0.5\n", "utf8");

        try {
            const agg = await generateRunSummary(fixture, { allRuns: true, projectName: "tmp_agg_fixture", baseRunsDir: fixture });
            expect(agg.isAggregated).toBe(true);
            expect(agg.totalRuns).toBe(2);

            for (const dir of [runA, runB]) {
                expect(fs.existsSync(path.join(dir, "run_summary.md"))).toBe(true);
                expect(fs.existsSync(path.join(dir, "summary.json"))).toBe(true);
                const md = fs.readFileSync(path.join(dir, "run_summary.md"), "utf8");
                expect(md.startsWith("# Run Summary:")).toBe(true);
            }
        } finally {
            fs.rmSync(fixture, { recursive: true, force: true });
        }
    });
});

describe("Model Card Generator", () => {
    const cardRunDir = path.join(__dirname, "tmp_model_card_run");

    beforeAll(() => {
        fs.mkdirSync(path.join(cardRunDir, "images", "train"), { recursive: true });
        fs.mkdirSync(path.join(cardRunDir, "images", "val"), { recursive: true });
        fs.mkdirSync(path.join(cardRunDir, "weights"), { recursive: true });

        fs.writeFileSync(
            path.join(cardRunDir, "args.yaml"),
            "task: detect\nmode: train\nmodel: yolov8n.pt\nepochs: 50\nbatch: 16\ndata: coco_classes.yaml",
            "utf8"
        );
        fs.writeFileSync(
            path.join(cardRunDir, "coco_classes.yaml"),
            "# Train/val/test sets\npath: /runs/example\ntrain: images/train\nval: images/val\ntest: \n\n# Classes (COCO classes)\nnames:\n  0: person\n  1: car\n  2: dog\n",
            "utf8"
        );
        fs.writeFileSync(
            path.join(cardRunDir, "results.csv"),
            "epoch, metrics/mAP50(B), metrics/mAP50-95(B), metrics/precision(B), metrics/recall(B)\n1, 0.40, 0.20, 0.55, 0.50\n2, 0.70, 0.45, 0.75, 0.68\n3, 0.91, 0.60, 0.88, 0.80",
            "utf8"
        );

        for (let i = 0; i < 3; i++) {
            fs.writeFileSync(path.join(cardRunDir, "images", "train", `train_${i}.jpg`), "img", "utf8");
        }
        fs.writeFileSync(path.join(cardRunDir, "images", "val", "val_0.jpg"), "img", "utf8");
        fs.writeFileSync(path.join(cardRunDir, "weights", "best.pt"), "checkpoint", "utf8");
    });

    afterAll(() => {
        if (fs.existsSync(cardRunDir)) {
            fs.rmSync(cardRunDir, { recursive: true, force: true });
        }
    });

    test("generates MODEL_CARD.md and MODEL_CARD.png with image model card and YAML frontmatter", async () => {
        const result = await generateModelCard(cardRunDir, { runName: "example_run" });

        const modelCardPath = path.join(cardRunDir, "MODEL_CARD.md");
        expect(result.modelCardPath).toBe(modelCardPath);
        expect(fs.existsSync(modelCardPath)).toBe(true);

        const modelCardImagePath = path.join(cardRunDir, "MODEL_CARD.png");
        expect(result.modelCardImagePath).toBe(modelCardImagePath);
        expect(fs.existsSync(modelCardImagePath)).toBe(true);
        expect(fs.statSync(modelCardImagePath).size).toBeGreaterThan(0);

        const content = fs.readFileSync(modelCardPath, "utf8");
        expect(content.startsWith("---\n")).toBe(true);

        const frontmatterEnd = content.indexOf("\n---\n", 4);
        const frontmatter = content.slice(4, frontmatterEnd);
        const body = content.slice(frontmatterEnd + 5);

        expect(frontmatter).toContain('library_name: "ultralytics"');
        expect(frontmatter).toContain('pipeline_tag: "object-detection"');
        expect(frontmatter).toContain('- "yolo"');
        expect(frontmatter).toContain('- "yolov8n"');
        expect(frontmatter).toContain("model-index:");
        expect(frontmatter).toContain('type: "mAP50"');
        expect(frontmatter).toContain("value: 0.91");

        expect(result.frontmatter.pipeline_tag).toBe("object-detection");
        expect(result.frontmatter.library_name).toBe("ultralytics");
        expect(result.frontmatter.tags).toEqual(expect.arrayContaining(["ultralytics", "yolo", "detect", "yolov8n"]));

        expect(result.summary.metrics.bestMap50).toBe(0.91);
        expect(result.summary.metrics.bestMap50_95).toBe(0.6);
        expect(result.summary.metrics.precision).toBe(0.88);
        expect(result.summary.metrics.recall).toBe(0.8);

        expect(body).toContain("# example_run");
        expect(body).toContain("**Classes (3)**: `person`, `car`, `dog`");
        expect(body).toContain("train: 3, val: 1, test: 0");
        expect(body).toContain("mAP50 | 91.00%");
        expect(body).toContain("weights/best.pt");
        expect(body).toContain("from ultralytics import YOLO");
    });

    test("truncates long class lists to prevent card image overflow", async () => {
        const longClassRunDir = path.join(__dirname, "tmp_model_card_long_classes");
        fs.mkdirSync(longClassRunDir, { recursive: true });

        const manyNames = Array.from({ length: 25 }, (_, i) => `long_object_class_name_${i + 1}`).map((n, i) => `  ${i}: ${n}`).join("\n");
        fs.writeFileSync(
            path.join(longClassRunDir, "coco_classes.yaml"),
            `names:\n${manyNames}\n`,
            "utf8"
        );
        fs.writeFileSync(
            path.join(longClassRunDir, "results.csv"),
            "epoch, metrics/mAP50(B), metrics/precision(B), metrics/recall(B)\n1, 0.85, 0.82, 0.79",
            "utf8"
        );

        try {
            const result = await generateModelCard(longClassRunDir, { runName: "long_classes_run" });
            const imagePath = path.join(longClassRunDir, "MODEL_CARD.png");
            expect(result.modelCardImagePath).toBe(imagePath);
            expect(fs.existsSync(imagePath)).toBe(true);
            expect(fs.statSync(imagePath).size).toBeGreaterThan(0);

            // Metrics are resolved cleanly
            expect(result.summary.metrics.precision).toBe(0.82);
            expect(result.summary.metrics.recall).toBe(0.79);
        } finally {
            fs.rmSync(longClassRunDir, { recursive: true, force: true });
        }
    });

    test("handles training runs with log files and cfgTemplate.txt (no results.csv present)", async () => {
        const noCsvRunDir = path.join(__dirname, "tmp_model_card_no_csv");
        fs.mkdirSync(noCsvRunDir, { recursive: true });

        fs.writeFileSync(
            path.join(noCsvRunDir, "cfgTemplate.txt"),
            "task: detect\nmodel: yolov8s.pt\nepochs: 100\nbatch: 32\n",
            "utf8"
        );

        fs.writeFileSync(
            path.join(noCsvRunDir, "1787162286668.log"),
            "100/100 2.5G 0.45 0.32 0.89 10 640: 100%\nall 150 400 0.86 0.81 0.92 0.65\nTraining complete.\n",
            "utf8"
        );

        try {
            const result = await generateModelCard(noCsvRunDir, { runName: "no_csv_log_run" });
            const imagePath = path.join(noCsvRunDir, "MODEL_CARD.png");

            expect(result.modelCardImagePath).toBe(imagePath);
            expect(fs.existsSync(imagePath)).toBe(true);
            expect(fs.statSync(imagePath).size).toBeGreaterThan(0);

            // Verify metric extraction from log file fallback
            expect(result.summary.metrics.bestMap50).toBe(0.92);
            expect(result.summary.metrics.bestMap50_95).toBe(0.65);
            expect(result.summary.metrics.precision).toBe(0.86);
            expect(result.summary.metrics.recall).toBe(0.81);

            // Verify config parsed from cfgTemplate.txt
            expect(result.summary.config.model).toBe("yolov8s.pt");
            expect(result.summary.config.epochs).toBe(100);
            expect(result.summary.config.batch).toBe(32);
        } finally {
            fs.rmSync(noCsvRunDir, { recursive: true, force: true });
        }
    });

    test("handles Njobvu training run with .log header options (no args.yaml or results.csv present)", async () => {
        const njobvuRunDir = path.join(__dirname, "public/projects/coco-test-annotate/training/logs/1787162767678");
        fs.mkdirSync(njobvuRunDir, { recursive: true });

        const logContent = `# ================================================================================
# Run Options (for reproducing this run)
# ================================================================================
# Project              : coco-test-annotate
# Task                 : detect
# Mode                 : train
# YOLO Version         : 5
# Classes              : person, bycicle, car, motorbike, plane, bus, train, truck
# Batch                : 16
# Epochs               : 10
# Image Size           : 640
# Device               : cpu
# Weights              : yolo11n.pt
# ================================================================================

      Epoch    GPU_mem   box_loss   cls_loss   dfl_loss  Instances       Size
                 Class     Images  Instances      Box(P          R      mAP50  mAP50-95): 100% ━━━━━━━━━━━━ 1/1 3.3s/it 3.3s
                   all          1          0          0          0          0          0
`;
        fs.writeFileSync(path.join(njobvuRunDir, "1787162767678.log"), logContent, "utf8");

        try {
            const result = await generateModelCard(njobvuRunDir, { runName: "1787162767678" });
            const imagePath = path.join(njobvuRunDir, "MODEL_CARD.png");

            expect(result.modelCardImagePath).toBe(imagePath);
            expect(fs.existsSync(imagePath)).toBe(true);

            // Assert project, epochs, batch, weights parsed from log header
            expect(result.summary.config.project).toBe("coco-test-annotate");
            expect(result.summary.config.epochs).toBe(10);
            expect(result.summary.config.batch).toBe(16);
            expect(result.summary.config.weights).toBe("yolo11n.pt");

            // Assert metrics include numeric 0 instead of N/A or undefined
            expect(result.summary.metrics.bestMap50).toBe(0);
            expect(result.summary.metrics.bestMap50_95).toBe(0);
            expect(result.summary.metrics.precision).toBe(0);
            expect(result.summary.metrics.recall).toBe(0);
            expect(result.summary.metrics.totalEpochs).toBe(10);

            // Assert class list extracted from log header
            expect(result.markdown).toContain("person");
            expect(result.markdown).toContain("coco-test-annotate");
        } finally {
            fs.rmSync(path.join(__dirname, "public"), { recursive: true, force: true });
        }
    });

    test("falls back gracefully when no dataset yaml or split directories are present", async () => {
        const bareDir = path.join(__dirname, "tmp_model_card_bare");
        fs.mkdirSync(bareDir, { recursive: true });
        fs.writeFileSync(path.join(bareDir, "args.yaml"), "task: classify\nmodel: yolov8n-cls.pt\nepochs: 5", "utf8");
        fs.writeFileSync(path.join(bareDir, "results.csv"), "epoch, metrics/accuracy_top1\n1, 0.80\n2, 0.92", "utf8");

        try {
            const result = await generateModelCard(bareDir, { runName: "bare_run" });
            const content = fs.readFileSync(result.modelCardPath, "utf8");

            expect(content).toContain('pipeline_tag: "image-classification"');
            expect(content).toContain("not found in run artifacts");
            expect(content).toContain("Top-1 Accuracy");

            const imagePath = path.join(bareDir, "MODEL_CARD.png");
            expect(result.modelCardImagePath).toBe(imagePath);
            expect(fs.existsSync(imagePath)).toBe(true);
            expect(fs.statSync(imagePath).size).toBeGreaterThan(0);

            expect(result.summary.metrics.accuracy).toBe(0.92);
        } finally {
            fs.rmSync(bareDir, { recursive: true, force: true });
        }
    });

    test("throws for a non-existent run directory", async () => {
        await expect(generateModelCard(path.join(__dirname, "does_not_exist_run"))).rejects.toThrow(
            /Run directory does not exist/
        );
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

    test("GET /api/runs/list - returns list of available runs filtered by project", async () => {
        const res = await request(app)
            .get("/api/runs/list?projectName=test_project");

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.projectName).toBe("test_project");
        expect(Array.isArray(res.body.runs)).toBe(true);
    });

    test("POST /api/runs/context - returns document artifact context for LLM", async () => {
        const runDir = path.join(__dirname, "tmp_api_context_run");
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, "args.yaml"), "epochs: 5", "utf8");

        const res = await request(app)
            .post("/api/runs/context")
            .send({ runDir });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.contextText).toContain("RUN DOCUMENT ARTIFACT CONTEXT");

        fs.rmSync(runDir, { recursive: true, force: true });
    });

    test("POST /api/runs/persist-summary - persists custom narrative summary", async () => {
        const runDir = path.join(__dirname, "tmp_api_context_run");
        fs.mkdirSync(runDir, { recursive: true });

        const customNarrative = "# Custom Narrative API Test\nModel achieved 85% mAP50.";

        const res = await request(app)
            .post("/api/runs/persist-summary")
            .send({ runDir, customNarrative });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.customNarrative).toBe(customNarrative);

        fs.rmSync(runDir, { recursive: true, force: true });
    });
});
