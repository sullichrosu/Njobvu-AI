const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * Training & Inference Run Output Analysis / Summary Generator
 * 
 * Inspects a training or inference run output directory, deeply ingests complete run file
 * artifacts (args.yaml, config.json, results.csv, log files, plots, weight checkpoints),
 * and generates structured, context-aware analysis reports (summary.json & run_summary.md).
 * Supports both single-run analysis and all-run summary aggregations for a project.
 */

/**
 * Analyzes a run directory (or project run set) and writes comprehensive summary files.
 * 
 * @param {string} [runDir] - Absolute or relative path to a run directory or project directory
 * @param {Object} [options]
 * @param {string} [options.runType] - 'training' | 'inference' | 'auto'
 * @param {string} [options.runName] - Custom run name or label
 * @param {string} [options.projectName] - Project name to aggregate runs for
 * @param {boolean} [options.allRuns] - Explicitly generate aggregated summary across all project runs
 * @returns {Promise<Object>} Summary object
 */
async function generateRunSummary(runDir, options = {}) {
    const projectName = options.projectName || options.PName || null;
    let targetPath = runDir;

    if ((!targetPath || !fs.existsSync(targetPath)) && projectName) {
        const candidate1 = path.join(__dirname, "..", "public", "projects", projectName);
        const candidate2 = path.join(__dirname, "..", "runs", projectName);
        const candidate3 = path.join(__dirname, "..", "runs");
        if (fs.existsSync(candidate1)) targetPath = candidate1;
        else if (fs.existsSync(candidate2)) targetPath = candidate2;
        else if (fs.existsSync(candidate3)) targetPath = candidate3;
    }

    if (!targetPath && !projectName) {
        targetPath = path.join(__dirname, "..", "runs");
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
        throw new Error(`Run directory does not exist: ${runDir || projectName || 'unspecified'}`);
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${targetPath}`);
    }

    const topFiles = fs.readdirSync(targetPath);
    const hasDirectRunFiles = topFiles.some(f => 
        f === "results.csv" || f === "args.yaml" || f === "labels.jpg" ||
        (f === "config.json" && !topFiles.includes("projects"))
    );

    if (options.allRuns || !hasDirectRunFiles) {
        return await generateAggregatedRunSummary(targetPath, { ...options, projectName });
    }

    return await generateSingleRunSummary(targetPath, options);
}

/**
 * Generates summary for a single run directory.
 */
async function generateSingleRunSummary(runDir, options = {}) {
    const runName = options.runName || path.basename(runDir);
    const allFileEntries = getFilesRecursive(runDir);

    let runType = options.runType || "auto";
    if (runType === "auto") {
        const hasTrainingFiles = allFileEntries.some(f => 
            f.name === "results.csv" || f.name === "args.yaml" || f.name.includes("train") || f.relPath.includes("weights")
        );
        runType = hasTrainingFiles ? "training" : "inference";
    }

    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
    const artifactFiles = [];
    const visualPlots = [];
    let imageCount = 0;

    allFileEntries.forEach(entry => {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.includes(ext)) {
            imageCount++;
            visualPlots.push(entry.relPath);
            artifactFiles.push(entry.relPath);
        } else if ([".pt", ".onnx", ".engine", ".tflite", ".pb", ".csv", ".yaml", ".log", ".txt", ".json"].includes(ext)) {
            artifactFiles.push(entry.relPath);
        }
    });

    let configData = {};
    const argsPath = path.join(runDir, "args.yaml");
    const hypPath = path.join(runDir, "hyp.yaml");
    const optPath = path.join(runDir, "opt.yaml");
    const configJsonPath = path.join(runDir, "config.json");

    if (fs.existsSync(argsPath)) {
        configData = parseYamlSimple(fs.readFileSync(argsPath, "utf8"));
    } else if (fs.existsSync(configJsonPath)) {
        try {
            configData = JSON.parse(fs.readFileSync(configJsonPath, "utf8"));
        } catch (e) {}
    }

    if (fs.existsSync(hypPath)) {
        configData.hyperparameters = parseYamlSimple(fs.readFileSync(hypPath, "utf8"));
    }
    if (fs.existsSync(optPath)) {
        configData.options = parseYamlSimple(fs.readFileSync(optPath, "utf8"));
    }

    let metrics = {};
    let performanceAnalysis = {};
    const resultsCsvPath = path.join(runDir, "results.csv");
    const metricsJsonPath = path.join(runDir, "metrics.json");

    if (fs.existsSync(resultsCsvPath)) {
        const parsedCsv = await parseResultsCsvStream(resultsCsvPath);
        metrics = parsedCsv.metrics;
        performanceAnalysis = parsedCsv.analysis;
    } else if (fs.existsSync(metricsJsonPath)) {
        try {
            metrics = JSON.parse(fs.readFileSync(metricsJsonPath, "utf8"));
        } catch (e) {}
    }

    const logDiagnostics = await parseLogFilesStream(runDir, allFileEntries);
    const weightsInfo = parseWeightFiles(runDir, allFileEntries);

    const findings = generateFindings(runType, metrics, imageCount, artifactFiles, weightsInfo, logDiagnostics);
    const recommendations = generateRecommendations(runType, metrics, performanceAnalysis, logDiagnostics);

    const summary = {
        runName,
        runDir: path.resolve(runDir),
        runType,
        isAggregated: false,
        generatedAt: new Date().toISOString(),
        artifactCount: artifactFiles.length,
        imageCount,
        config: configData,
        metrics,
        performanceAnalysis,
        logDiagnostics,
        weightsInfo,
        visualPlots,
        findings,
        recommendations
    };

    const summaryJsonPath = path.join(runDir, "summary.json");
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf8");

    const summaryMdPath = path.join(runDir, "run_summary.md");
    const mdContent = generateMarkdownSummary(summary);
    fs.writeFileSync(summaryMdPath, mdContent, "utf8");

    return summary;
}

/**
 * Generates an aggregated summary across all available runs in a project/directory.
 */
async function generateAggregatedRunSummary(targetPath, options = {}) {
    const projectName = options.projectName || options.PName || null;
    const availableRuns = listAvailableRuns(projectName || targetPath, options.baseRunsDir);
    const runName = options.runName || (projectName ? `${projectName}_all_runs_summary` : "all_runs_summary");

    const runSummaries = [];
    let totalEpochsTrained = 0;
    let bestOverallMap50 = 0;
    let bestRunName = "None";
    let trainingRunCount = 0;
    let inferenceRunCount = 0;

    for (const r of availableRuns) {
        try {
            if (path.resolve(r.runPath) === path.resolve(targetPath)) continue;

            const singleSummary = await generateSingleRunSummary(r.runPath, {
                runName: r.runName,
                runType: r.runType
            });
            runSummaries.push(singleSummary);

            if (r.runType === "training") {
                trainingRunCount++;
                if (singleSummary.metrics && singleSummary.metrics.totalEpochs) {
                    totalEpochsTrained += singleSummary.metrics.totalEpochs;
                }
                if (singleSummary.metrics && singleSummary.metrics.bestMap50) {
                    if (singleSummary.metrics.bestMap50 > bestOverallMap50) {
                        bestOverallMap50 = singleSummary.metrics.bestMap50;
                        bestRunName = r.runName;
                    }
                }
            } else {
                inferenceRunCount++;
            }
        } catch (err) {
            // Skip unparseable run
        }
    }

    const findings = [
        `Aggregated analysis for ${runSummaries.length} run(s)${projectName ? ` in project '${projectName}'` : ""}.`,
        `Training runs: ${trainingRunCount}, Inference runs: ${inferenceRunCount}.`
    ];

    if (trainingRunCount > 0) {
        findings.push(`Total epochs trained across all runs: ${totalEpochsTrained}.`);
        if (bestOverallMap50 > 0) {
            findings.push(`Top performing training run: '${bestRunName}' with peak mAP@50 of ${(bestOverallMap50 * 100).toFixed(2)}%.`);
        }
    }

    const recommendations = [];
    if (trainingRunCount === 0 && inferenceRunCount === 0) {
        findings.push("No active run output directories found for analysis.");
        recommendations.push("Initiate a training or inference job to generate model run outputs.");
    } else if (bestOverallMap50 > 0.8) {
        recommendations.push(`Run '${bestRunName}' demonstrated high detection performance (mAP@50 > 80%). Recommended for deployment.`);
    } else if (trainingRunCount > 0) {
        recommendations.push("Consider increasing training epochs or fine-tuning hyperparameters for improved accuracy.");
    }

    const aggregated = {
        runName,
        runDir: path.resolve(targetPath),
        runType: "aggregated",
        isAggregated: true,
        projectName,
        generatedAt: new Date().toISOString(),
        totalRuns: runSummaries.length,
        trainingRunCount,
        inferenceRunCount,
        aggregateMetrics: {
            totalEpochsTrained,
            bestOverallMap50,
            bestRunName
        },
        findings,
        recommendations,
        runs: runSummaries
    };

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        try {
            const summaryJsonPath = path.join(targetPath, "summary.json");
            fs.writeFileSync(summaryJsonPath, JSON.stringify(aggregated, null, 2), "utf8");

            const summaryMdPath = path.join(targetPath, "run_summary.md");
            const mdContent = generateAggregatedMarkdownSummary(aggregated);
            fs.writeFileSync(summaryMdPath, mdContent, "utf8");
        } catch (e) {}
    }

    return aggregated;
}

function getFilesRecursive(dir, baseDir = dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(baseDir, fullPath);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFilesRecursive(fullPath, baseDir));
        } else {
            results.push({ name: file, fullPath, relPath, sizeBytes: stat.size, mtime: stat.mtime });
        }
    });
    return results;
}

function parseYamlSimple(yamlStr) {
    const result = {};
    const lines = yamlStr.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
            const key = trimmed.slice(0, colonIdx).trim();
            let val = trimmed.slice(colonIdx + 1).trim();
            if (val === "true") val = true;
            else if (val === "false") val = false;
            else if (!isNaN(Number(val)) && val !== "") val = Number(val);
            result[key] = val;
        }
    }
    return result;
}

async function parseResultsCsvStream(csvPath) {
    return new Promise((resolve) => {
        const fileStream = fs.createReadStream(csvPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        let headers = [];
        let rowsCount = 0;
        let firstRow = null;
        let lastRow = null;
        let bestMap50 = 0;
        let bestMap50Epoch = 0;
        let bestMap50_95 = 0;
        let epochLosses = [];

        rl.on("line", (line) => {
            const row = line.split(",").map(s => s.trim());
            if (rowsCount === 0) {
                headers = row;
            } else {
                if (rowsCount === 1) firstRow = row;
                lastRow = row;

                const epochIdx = headers.findIndex(h => h.toLowerCase().includes("epoch"));
                const map50Idx = headers.findIndex(h => h.includes("mAP50") || h.includes("mAP_0.5"));
                const map95Idx = headers.findIndex(h => h.includes("mAP50-95") || h.includes("mAP_0.5:0.95"));
                const lossIdx = headers.findIndex(h => h.includes("val/box_loss") || h.includes("val/loss") || h.includes("train/box_loss") || h.includes("train/loss"));

                const currentEpoch = epochIdx !== -1 && !isNaN(parseInt(row[epochIdx])) ? parseInt(row[epochIdx]) : rowsCount;

                if (map50Idx !== -1 && row[map50Idx]) {
                    const val = parseFloat(row[map50Idx]);
                    if (!isNaN(val) && val > bestMap50) {
                        bestMap50 = val;
                        bestMap50Epoch = currentEpoch;
                    }
                }
                if (map95Idx !== -1 && row[map95Idx]) {
                    const val = parseFloat(row[map95Idx]);
                    if (!isNaN(val) && val > bestMap50_95) {
                        bestMap50_95 = val;
                    }
                }
                if (lossIdx !== -1 && row[lossIdx]) {
                    const lVal = parseFloat(row[lossIdx]);
                    if (!isNaN(lVal)) epochLosses.push(lVal);
                }
            }
            rowsCount++;
        });

        rl.on("close", () => {
            const totalEpochs = Math.max(0, rowsCount - 1);
            const metrics = {
                totalEpochs,
                bestMap50,
                bestMap50Epoch,
                bestMap50_95
            };

            if (headers.length && lastRow) {
                headers.forEach((h, idx) => {
                    if (lastRow[idx] !== undefined) {
                        const val = parseFloat(lastRow[idx]);
                        metrics[h] = isNaN(val) ? lastRow[idx] : val;
                    }
                });
            }

            let initialLoss = epochLosses.length > 0 ? epochLosses[0] : null;
            let finalLoss = epochLosses.length > 0 ? epochLosses[epochLosses.length - 1] : null;
            let lossReductionPercent = (initialLoss && finalLoss && initialLoss > 0) 
                ? (((initialLoss - finalLoss) / initialLoss) * 100).toFixed(2) + "%" 
                : "N/A";

            let lossTrend = "stable";
            if (epochLosses.length >= 3) {
                const recent = epochLosses.slice(-3);
                if (recent[2] < recent[0] * 0.95) lossTrend = "decreasing";
                else if (recent[2] > recent[0] * 1.05) lossTrend = "increasing (possible overfitting)";
                else lossTrend = "plateaued";
            }

            const analysis = {
                initialLoss,
                finalLoss,
                lossReductionPercent,
                lossTrend,
                bestPerformanceEpoch: bestMap50Epoch
            };

            resolve({ metrics, analysis });
        });
    });
}

async function parseLogFilesStream(runDir, fileEntries) {
    const logEntries = fileEntries.filter(f => f.name.endsWith(".log") || f.name.endsWith(".txt"));
    const diagnostics = {
        detectedHardware: "N/A",
        durationSeconds: null,
        warnings: [],
        errors: [],
        completionStatus: "Unknown"
    };

    if (logEntries.length === 0) return diagnostics;

    for (const logFile of logEntries) {
        if (logFile.sizeBytes > 10 * 1024 * 1024) continue;

        const fileStream = fs.createReadStream(logFile.fullPath, { encoding: "utf8" });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
            const lower = line.toLowerCase();
            if (lower.includes("cuda") || lower.includes("gpu") || lower.includes("device")) {
                if (diagnostics.detectedHardware === "N/A") {
                    diagnostics.detectedHardware = line.trim();
                }
            }
            if (lower.includes("warning") || lower.includes("warn")) {
                if (diagnostics.warnings.length < 5) diagnostics.warnings.push(line.trim());
            }
            if (lower.includes("error") || lower.includes("exception") || lower.includes("failed")) {
                if (diagnostics.errors.length < 5) diagnostics.errors.push(line.trim());
            }
            if (lower.includes("training complete") || lower.includes("results saved to") || lower.includes("100%|")) {
                diagnostics.completionStatus = "Completed Successfully";
            }
        }
    }

    if (diagnostics.errors.length > 0) {
        diagnostics.completionStatus = "Encountered Errors";
    }

    return diagnostics;
}

function parseWeightFiles(runDir, fileEntries) {
    const weights = [];
    fileEntries.forEach(f => {
        if (f.name.endsWith(".pt") || f.name.endsWith(".onnx") || f.name.endsWith(".engine") || f.name.endsWith(".tflite")) {
            weights.push({
                name: f.name,
                relPath: f.relPath,
                sizeMB: (f.sizeBytes / (1024 * 1024)).toFixed(2) + " MB",
                modifiedAt: f.mtime.toISOString()
            });
        }
    });
    return weights;
}

function generateFindings(runType, metrics, imageCount, artifactFiles, weightsInfo, logDiagnostics) {
    const findings = [];

    if (runType === "training") {
        if (metrics.totalEpochs) {
            findings.push(`Completed ${metrics.totalEpochs} epochs of training.`);
        }
        if (metrics.bestMap50) {
            findings.push(`Achieved peak mAP@50 of ${(metrics.bestMap50 * 100).toFixed(2)}% (Epoch ${metrics.bestMap50Epoch || 'N/A'}).`);
        }
        if (metrics.bestMap50_95) {
            findings.push(`Achieved peak mAP@50-95 of ${(metrics.bestMap50_95 * 100).toFixed(2)}%.`);
        }
        if (weightsInfo.length > 0) {
            const bestWeight = weightsInfo.find(w => w.name.includes("best")) || weightsInfo[0];
            findings.push(`Saved model weight checkpoint: ${bestWeight.relPath} (${bestWeight.sizeMB}).`);
        }
    } else {
        findings.push(`Inference run processed ${imageCount} output images.`);
        findings.push(`Generated ${artifactFiles.length} output artifacts.`);
    }

    if (logDiagnostics.completionStatus !== "Unknown") {
        findings.push(`Log execution status: ${logDiagnostics.completionStatus}.`);
    }

    return findings;
}

function generateRecommendations(runType, metrics, performanceAnalysis, logDiagnostics) {
    const recs = [];

    if (runType === "training") {
        if (performanceAnalysis.lossTrend === "plateaued") {
            recs.push("Loss trend has plateaued. Consider applying learning rate decay or stopping early.");
        } else if (performanceAnalysis.lossTrend && performanceAnalysis.lossTrend.includes("overfitting")) {
            recs.push("Validation loss is increasing relative to training loss. Increase regularization (weight decay/dropout) or add data augmentations.");
        }

        if (metrics.bestMap50 && metrics.bestMap50 > 0.8) {
            recs.push("Model achieved strong detection accuracy (mAP@50 > 80%). Ready for validation and deployment.");
        } else if (metrics.bestMap50 && metrics.bestMap50 < 0.5) {
            recs.push("Model accuracy is low (mAP@50 < 50%). Train for additional epochs or increase dataset label quality.");
        }
    } else {
        recs.push("Verify inference bounding box accuracy against ground truth annotations.");
    }

    if (logDiagnostics.errors && logDiagnostics.errors.length > 0) {
        recs.push("Review log error diagnostics to address execution issues.");
    }

    return recs;
}

function generateMarkdownSummary(summary) {
    let md = `# Run Summary: ${summary.runName}\n\n`;
    md += `- **Run Type**: ${summary.runType.toUpperCase()}\n`;
    md += `- **Execution Status**: ${summary.logDiagnostics.completionStatus || "Completed"}\n`;
    md += `- **Generated At**: ${summary.generatedAt}\n`;
    md += `- **Artifact Count**: ${summary.artifactCount} files (${summary.imageCount} images)\n\n`;

    md += `## Executive Summary & Findings\n`;
    if (summary.findings && summary.findings.length) {
        summary.findings.forEach(f => {
            md += `- ${f}\n`;
        });
    } else {
        md += `- No summary findings recorded.\n`;
    }

    if (Object.keys(summary.metrics).length > 0 || Object.keys(summary.performanceAnalysis).length > 0) {
        md += `\n## Performance & Metrics Analysis\n`;
        if (summary.performanceAnalysis.lossReductionPercent) {
            md += `- **Loss Reduction**: ${summary.performanceAnalysis.lossReductionPercent} (Initial: ${summary.performanceAnalysis.initialLoss}, Final: ${summary.performanceAnalysis.finalLoss})\n`;
            md += `- **Loss Trajectory**: ${summary.performanceAnalysis.lossTrend}\n`;
        }
        md += `\`\`\`json\n${JSON.stringify(summary.metrics, null, 2)}\n\`\`\`\n`;
    }

    if (summary.weightsInfo && summary.weightsInfo.length > 0) {
        md += `\n## Model Checkpoint Weights\n`;
        md += `| File Name | Relative Path | Size | Modified |\n`;
        md += `| --- | --- | --- | --- |\n`;
        summary.weightsInfo.forEach(w => {
            md += `| \`${w.name}\` | \`${w.relPath}\` | ${w.sizeMB} | ${w.modifiedAt} |\n`;
        });
    }

    if (summary.recommendations && summary.recommendations.length > 0) {
        md += `\n## AI Recommendations & Next Steps\n`;
        summary.recommendations.forEach(r => {
            md += `- 💡 ${r}\n`;
        });
    }

    if (Object.keys(summary.config).length > 0) {
        md += `\n## Configuration & Hyperparameters\n`;
        md += `\`\`\`json\n${JSON.stringify(summary.config, null, 2)}\n\`\`\`\n`;
    }

    return md;
}

function generateAggregatedMarkdownSummary(summary) {
    let md = `# Run Summary: ${summary.runName}\n\n`;
    md += `- **Type**: AGGREGATED ALL-RUNS REPORT\n`;
    md += `- **Project**: ${summary.projectName || "All Projects"}\n`;
    md += `- **Generated At**: ${summary.generatedAt}\n`;
    md += `- **Total Runs Analyzed**: ${summary.totalRuns} (${summary.trainingRunCount} training, ${summary.inferenceRunCount} inference)\n\n`;

    md += `## Executive Summary & Findings\n`;
    summary.findings.forEach(f => {
        md += `- ${f}\n`;
    });

    if (summary.trainingRunCount > 0) {
        md += `\n## Aggregate Metrics\n`;
        md += `- **Total Epochs Trained**: ${summary.aggregateMetrics.totalEpochsTrained}\n`;
        md += `- **Best Overall mAP@50**: ${(summary.aggregateMetrics.bestOverallMap50 * 100).toFixed(2)}%\n`;
        md += `- **Top Performing Run**: \`${summary.aggregateMetrics.bestRunName}\`\n`;
    }

    if (summary.runs && summary.runs.length > 0) {
        md += `\n## Individual Run Breakdown\n`;
        md += `| Run Name | Type | Images | Best mAP@50 | Total Epochs |\n`;
        md += `| --- | --- | --- | --- | --- |\n`;
        summary.runs.forEach(r => {
            const mapStr = r.metrics && r.metrics.bestMap50 ? `${(r.metrics.bestMap50 * 100).toFixed(2)}%` : "N/A";
            const epochsStr = r.metrics && r.metrics.totalEpochs ? r.metrics.totalEpochs : "N/A";
            md += `| \`${r.runName}\` | ${r.runType} | ${r.imageCount} | ${mapStr} | ${epochsStr} |\n`;
        });
    }

    if (summary.recommendations && summary.recommendations.length > 0) {
        md += `\n## AI Recommendations & Next Steps\n`;
        summary.recommendations.forEach(r => {
            md += `- 💡 ${r}\n`;
        });
    }

    return md;
}

/**
 * Recursively scans directory trees to discover historical/completed and active run output folders.
 */
function discoverRunDirectories(searchDir, visited = new Set(), maxDepth = 5, currentDepth = 0) {
    const discovered = [];
    if (!searchDir || currentDepth > maxDepth || !fs.existsSync(searchDir)) {
        return discovered;
    }

    try {
        const canonical = path.resolve(searchDir);
        if (visited.has(canonical)) return discovered;
        visited.add(canonical);

        const stat = fs.statSync(canonical);
        if (!stat.isDirectory()) return discovered;

        const entries = fs.readdirSync(canonical);
        
        const isRunDir = entries.some(f => 
            f === "results.csv" || f === "args.yaml" || f.endsWith(".pt") ||
            (f === "weights" && fs.existsSync(path.join(canonical, "weights"))) ||
            (f.endsWith(".png") && (f.includes("results") || f.includes("confusion") || f.includes("F1") || f.includes("labels")))
        );

        if (isRunDir) {
            discovered.push(canonical);
        }

        for (const entry of entries) {
            if (entry === "node_modules" || entry === ".git" || entry === "tmp") continue;
            const childPath = path.join(canonical, entry);
            try {
                const childStat = fs.statSync(childPath);
                if (childStat.isDirectory()) {
                    const subDiscovered = discoverRunDirectories(childPath, visited, maxDepth, currentDepth + 1);
                    discovered.push(...subDiscovered);
                }
            } catch (e) {}
        }
    } catch (e) {}

    return discovered;
}

/**
 * Scans run directories for active and historical training and inference runs and returns summary metadata.
 * Returned object functions both as an Array<Object> and as an object with .train and .inference properties.
 * 
 * @param {string|Object} [projectNameOrOptions] - Project name to filter by, or options object
 * @param {string} [baseRunsDir] - Base directory to scan (defaults to project runs directory)
 * @returns {Array<Object> & { train: Array<Object>, inference: Array<Object> }} List of available runs
 */
function listAvailableRuns(projectNameOrOptions, baseRunsDir) {
    let projectName = null;
    let rootDir = null;

    if (typeof projectNameOrOptions === "object" && projectNameOrOptions !== null) {
        projectName = projectNameOrOptions.projectName || projectNameOrOptions.PName || null;
        rootDir = projectNameOrOptions.baseRunsDir || projectNameOrOptions.dir || baseRunsDir || null;
    } else if (typeof projectNameOrOptions === "string") {
        if (projectNameOrOptions.includes("/") || projectNameOrOptions.includes("\\")) {
            rootDir = projectNameOrOptions;
            projectName = baseRunsDir || null;
        } else {
            projectName = projectNameOrOptions;
            rootDir = baseRunsDir || null;
        }
    } else {
        rootDir = baseRunsDir || null;
    }

    const runsRoot = rootDir || path.join(__dirname, "..", "runs");
    const publicProjectsRoot = path.join(__dirname, "..", "public", "projects");

    const searchRoots = [
        runsRoot,
        path.join(runsRoot, "train"),
        path.join(runsRoot, "inference"),
        path.join(runsRoot, "detect"),
        publicProjectsRoot
    ];

    const allDiscoveredPaths = new Set();
    searchRoots.forEach(root => {
        if (fs.existsSync(root)) {
            const found = discoverRunDirectories(root);
            found.forEach(p => allDiscoveredPaths.add(p));
        }
    });

    function processPaths(paths, filterProject) {
        const runs = [];
        paths.forEach(itemPath => {
            try {
                const stat = fs.statSync(itemPath);
                const subFiles = fs.readdirSync(itemPath);
                const item = path.basename(itemPath);

                let associatedProject = null;
                const argsPath = path.join(itemPath, "args.yaml");
                const summaryJsonPath = path.join(itemPath, "summary.json");
                const configJsonPath = path.join(itemPath, "config.json");

                if (fs.existsSync(summaryJsonPath)) {
                    try {
                        const sData = JSON.parse(fs.readFileSync(summaryJsonPath, "utf8"));
                        associatedProject = sData.projectName || (sData.config && (sData.config.project || sData.config.PName));
                    } catch (e) {}
                }
                if (!associatedProject && fs.existsSync(argsPath)) {
                    try {
                        const parsedArgs = parseYamlSimple(fs.readFileSync(argsPath, "utf8"));
                        associatedProject = parsedArgs.project || parsedArgs.PName || parsedArgs.projectName;
                    } catch (e) {}
                }
                if (!associatedProject && fs.existsSync(configJsonPath)) {
                    try {
                        const cData = JSON.parse(fs.readFileSync(configJsonPath, "utf8"));
                        associatedProject = cData.project || cData.PName || cData.projectName;
                    } catch (e) {}
                }

                if (filterProject) {
                    const cleanProj = filterProject.trim().toLowerCase();
                    const pathLower = itemPath.toLowerCase();
                    const nameLower = item.toLowerCase();
                    const assocLower = associatedProject ? String(associatedProject).toLowerCase() : "";

                    const cleanProjNoHyphen = cleanProj.replace(/[-_]/g, "");
                    const pathNoHyphen = pathLower.replace(/[-_]/g, "");

                    const matchesProject = 
                        pathLower.includes(cleanProj) ||
                        nameLower.includes(cleanProj) ||
                        (assocLower && assocLower.includes(cleanProj)) ||
                        pathNoHyphen.includes(cleanProjNoHyphen);

                    if (!matchesProject) {
                        return;
                    }
                }

                const isTraining = subFiles.includes("results.csv") || subFiles.includes("args.yaml") || itemPath.toLowerCase().includes("train");
                const runType = isTraining ? "training" : "inference";
                const hasSummary = subFiles.includes("summary.json") || subFiles.includes("run_summary.md");
                const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
                const imageCount = subFiles.filter(f => imageExtensions.includes(path.extname(f).toLowerCase())).length;

                runs.push({
                    runName: item,
                    projectName: associatedProject || filterProject || null,
                    runPath: path.resolve(itemPath),
                    relPath: path.relative(path.join(__dirname, ".."), itemPath),
                    runType,
                    hasSummary,
                    artifactCount: subFiles.length,
                    imageCount,
                    lastModified: stat.mtime.toISOString()
                });
            } catch (e) {}
        });

        runs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        return runs;
    }

    const targetPaths = Array.from(allDiscoveredPaths);
    let discoveredRuns = processPaths(targetPaths, projectName);

    // Fallback scanning for runs/train, runs/inference, runs/detect when project-specific directories yield no direct matches
    if (projectName && discoveredRuns.length === 0 && !baseRunsDir) {
        const defaultRunsRoot = path.join(__dirname, "..", "runs");
        const fallbackPaths = [];
        [
            defaultRunsRoot,
            path.join(defaultRunsRoot, "train"),
            path.join(defaultRunsRoot, "inference"),
            path.join(defaultRunsRoot, "detect")
        ].forEach(root => {
            if (fs.existsSync(root)) {
                fallbackPaths.push(...discoverRunDirectories(root));
            }
        });

        if (fallbackPaths.length > 0) {
            discoveredRuns = processPaths(Array.from(new Set(fallbackPaths)), null);
            discoveredRuns.isFallback = true;
        }
    }

    const train = discoveredRuns.filter(r => r.runType === "training");
    const inference = discoveredRuns.filter(r => r.runType === "inference");

    Object.defineProperty(discoveredRuns, "train", {
        value: train,
        writable: true,
        enumerable: true,
        configurable: true
    });

    Object.defineProperty(discoveredRuns, "inference", {
        value: inference,
        writable: true,
        enumerable: true,
        configurable: true
    });

    return discoveredRuns;
}

/**
 * Compiles complete run document artifacts (args.yaml, config.json, results.csv, metrics.json, logs, weights)
 * into a structured LLM prompt context block so the LLM can interpret metrics and generate custom analysis.
 * 
 * @param {string} runDir - Directory path of the target run or project folder
 * @param {Object} [options]
 * @returns {Promise<string>} Structured text context block for LLM prompting
 */
async function buildRunDocumentContext(runDir, options = {}) {
    if (!runDir || !fs.existsSync(runDir)) {
        const projectName = options.projectName || options.PName || null;
        if (projectName) {
            const discovered = listAvailableRuns(projectName);
            if (discovered.length > 0) {
                runDir = discovered[0].runPath;
            }
        }
    }

    if (!runDir || !fs.existsSync(runDir)) {
        throw new Error(`Run directory does not exist: ${runDir || 'unspecified'}`);
    }

    const stat = fs.statSync(runDir);
    if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${runDir}`);
    }

    const topFiles = fs.readdirSync(runDir);
    const hasDirectRunFiles = topFiles.some(f => 
        f === "results.csv" || f === "args.yaml" || f === "labels.jpg" ||
        (f === "config.json" && !topFiles.includes("projects"))
    );

    let contextText = "";

    if (!hasDirectRunFiles) {
        const availableRuns = listAvailableRuns(options.projectName || runDir, options.baseRunsDir);
        contextText += `=== AGGREGATED PROJECT RUN ARTIFACT CONTEXT ===\n`;
        contextText += `Project / Path: ${options.projectName || path.basename(runDir)}\n`;
        contextText += `Total Discovered Runs: ${availableRuns.length}\n\n`;

        for (let i = 0; i < Math.min(availableRuns.length, 5); i++) {
            const r = availableRuns[i];
            try {
                const subContext = await buildSingleRunDocumentContext(r.runPath, { runName: r.runName });
                contextText += `--- RUN [${i + 1}/${availableRuns.length}]: ${r.runName} (${r.runType}) ---\n`;
                contextText += `${subContext}\n\n`;
            } catch (e) {}
        }
        contextText += `===============================================\n`;
        return contextText;
    }

    return await buildSingleRunDocumentContext(runDir, options);
}

async function buildSingleRunDocumentContext(runDir, options = {}) {
    const runName = options.runName || path.basename(runDir);
    const allFileEntries = getFilesRecursive(runDir);

    let configContent = "None found";
    const argsPath = path.join(runDir, "args.yaml");
    const configJsonPath = path.join(runDir, "config.json");
    if (fs.existsSync(argsPath)) {
        configContent = fs.readFileSync(argsPath, "utf8");
    } else if (fs.existsSync(configJsonPath)) {
        configContent = fs.readFileSync(configJsonPath, "utf8");
    }

    let resultsCsvExcerpts = "No results.csv found";
    const resultsCsvPath = path.join(runDir, "results.csv");
    if (fs.existsSync(resultsCsvPath)) {
        const rawCsv = fs.readFileSync(resultsCsvPath, "utf8");
        const lines = rawCsv.split("\n").filter(l => l.trim().length > 0);
        if (lines.length <= 15) {
            resultsCsvExcerpts = rawCsv;
        } else {
            const header = lines[0];
            const firstFew = lines.slice(1, 4).join("\n");
            const lastFew = lines.slice(-6).join("\n");
            resultsCsvExcerpts = `${header}\n${firstFew}\n... [${lines.length - 10} epochs omitted] ...\n${lastFew}`;
        }
    }

    const logDiagnostics = await parseLogFilesStream(runDir, allFileEntries);
    const weightsInfo = parseWeightFiles(runDir, allFileEntries);

    let summaryJsonData = null;
    const summaryJsonPath = path.join(runDir, "summary.json");
    if (fs.existsSync(summaryJsonPath)) {
        try {
            summaryJsonData = JSON.parse(fs.readFileSync(summaryJsonPath, "utf8"));
        } catch (e) {}
    }

    let contextText = `=== RUN DOCUMENT ARTIFACT CONTEXT ===\n`;
    contextText += `Run Name: ${runName}\n`;
    contextText += `Run Directory: ${path.resolve(runDir)}\n`;
    contextText += `Artifact Count: ${allFileEntries.length} files\n\n`;

    contextText += `--- Configuration & Hyperparameters ---\n${configContent}\n\n`;
    contextText += `--- Training Metrics & Results (results.csv) ---\n${resultsCsvExcerpts}\n\n`;

    if (summaryJsonData && summaryJsonData.metrics) {
        contextText += `--- Processed Summary Metrics ---\n${JSON.stringify(summaryJsonData.metrics, null, 2)}\n\n`;
    }

    contextText += `--- Model Checkpoints / Weights ---\n`;
    if (weightsInfo.length > 0) {
        weightsInfo.forEach(w => {
            contextText += `- ${w.name} (${w.sizeMB}) at ${w.relPath}\n`;
        });
    } else {
        contextText += `No model weight files found.\n`;
    }
    contextText += `\n`;

    contextText += `--- Execution Logs & Diagnostics ---\n`;
    contextText += `Hardware: ${logDiagnostics.detectedHardware}\n`;
    contextText += `Status: ${logDiagnostics.completionStatus}\n`;
    if (logDiagnostics.warnings && logDiagnostics.warnings.length > 0) {
        contextText += `Warnings:\n${logDiagnostics.warnings.join("\n")}\n`;
    }
    if (logDiagnostics.errors && logDiagnostics.errors.length > 0) {
        contextText += `Errors:\n${logDiagnostics.errors.join("\n")}\n`;
    }
    contextText += `====================================\n`;

    return contextText;
}

/**
 * Persists an LLM-generated narrative summary report into run_summary.md and summary.json within runDir.
 * 
 * @param {string} runDir - Target run directory
 * @param {string} customNarrative - Markdown narrative synthesized by the LLM
 * @param {Object} [options]
 * @returns {Object} Updated summary object
 */
function persistCustomSummary(runDir, customNarrative, options = {}) {
    if (!runDir || !fs.existsSync(runDir)) {
        throw new Error(`Run directory does not exist: ${runDir}`);
    }

    const summaryMdPath = path.join(runDir, "run_summary.md");
    fs.writeFileSync(summaryMdPath, customNarrative, "utf8");

    const summaryJsonPath = path.join(runDir, "summary.json");
    let summaryData = {};
    if (fs.existsSync(summaryJsonPath)) {
        try {
            summaryData = JSON.parse(fs.readFileSync(summaryJsonPath, "utf8"));
        } catch (e) {}
    }

    summaryData.runDir = path.resolve(runDir);
    summaryData.customNarrative = customNarrative;
    summaryData.narrativeSummary = customNarrative;
    summaryData.updatedAt = new Date().toISOString();

    fs.writeFileSync(summaryJsonPath, JSON.stringify(summaryData, null, 2), "utf8");
    return summaryData;
}

module.exports = {
    generateRunSummary,
    generateSingleRunSummary,
    generateAggregatedRunSummary,
    discoverRunDirectories,
    listAvailableRuns,
    buildRunDocumentContext,
    persistCustomSummary,
    parseYamlSimple,
    parseResultsCsvStream
};
