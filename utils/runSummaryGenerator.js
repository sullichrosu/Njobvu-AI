const fs = require("fs");
const path = require("path");
const readline = require("readline");
const sharp = require("sharp");

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
        // The on-disk project folder is typically `<admin>-<projectName>`, not the bare project name,
        // so search public/projects for the real match instead of guessing a path that won't exist.
        const projectsRoot = path.join(__dirname, "..", "public", "projects");
        let matchedProjectDir = null;
        if (fs.existsSync(projectsRoot)) {
            const entries = fs.readdirSync(projectsRoot).filter(e => {
                try { return fs.statSync(path.join(projectsRoot, e)).isDirectory(); } catch (e) { return false; }
            });
            matchedProjectDir =
                entries.find(e => e === projectName) ||
                entries.find(e => e.endsWith(`-${projectName}`) || e.endsWith(`_${projectName}`)) ||
                entries.find(e => e.includes(projectName)) ||
                null;
        }
        if (matchedProjectDir) {
            targetPath = path.join(projectsRoot, matchedProjectDir);
        } else {
            // Only fall back to the shared global runs/ dir when no project scope was matched at all —
            // never silently write a named project's aggregate report into that unrelated shared folder.
            const candidate2 = path.join(__dirname, "..", "runs", projectName);
            if (fs.existsSync(candidate2)) targetPath = candidate2;
        }
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
        f === "results.csv" || f === "args.yaml" || f === "cfgTemplate.txt" || f === "labels.jpg" ||
        f.endsWith(".log") || (f === "config.json" && !topFiles.includes("projects"))
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
            f.name === "results.csv" || f.name === "args.yaml" || f.name === "cfgTemplate.txt" ||
            f.name.endsWith(".log") || f.name.includes("train") || f.relPath.includes("weights")
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
    const cfgTemplatePath = path.join(runDir, "cfgTemplate.txt");
    const hypPath = path.join(runDir, "hyp.yaml");
    const optPath = path.join(runDir, "opt.yaml");
    const configJsonPath = path.join(runDir, "config.json");

    if (fs.existsSync(argsPath)) {
        configData = parseYamlSimple(fs.readFileSync(argsPath, "utf8"));
    } else if (fs.existsSync(cfgTemplatePath)) {
        configData = parseYamlSimple(fs.readFileSync(cfgTemplatePath, "utf8"));
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

    if (fs.existsSync(resultsCsvPath)) {
        const parsedCsv = await parseResultsCsvStream(resultsCsvPath);
        metrics = parsedCsv.metrics;
        performanceAnalysis = parsedCsv.analysis;
    } else {
        metrics = await parseFallbackMetrics(runDir, allFileEntries);
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

    const summaryMdPath = path.join(runDir, "run_summary.md");
    const mdContent = generateMarkdownSummary(summary);
    summary.markdownSummary = mdContent;
    summary.summaryMd = mdContent;

    const summaryJsonPath = path.join(runDir, "summary.json");
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf8");
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

    const mdContent = generateAggregatedMarkdownSummary(aggregated);
    aggregated.markdownSummary = mdContent;
    aggregated.summaryMd = mdContent;

    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        try {
            const summaryJsonPath = path.join(targetPath, "summary.json");
            fs.writeFileSync(summaryJsonPath, JSON.stringify(aggregated, null, 2), "utf8");

            const summaryMdPath = path.join(targetPath, "run_summary.md");
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
        let bestPrecision = 0;
        let bestRecall = 0;
        let bestAccuracy = 0;
        let epochLosses = [];

        rl.on("line", (line) => {
            const row = line.split(",").map(s => s.trim());
            if (rowsCount === 0) {
                headers = row;
            } else {
                if (rowsCount === 1) firstRow = row;
                lastRow = row;

                const epochIdx = headers.findIndex(h => h.toLowerCase().includes("epoch"));
                const map50Idx = headers.findIndex(h => {
                    const l = h.toLowerCase();
                    return (l.includes("map50") || l.includes("map_0.5")) && !l.includes("map50-95") && !l.includes("map_0.5:0.95");
                });
                const map95Idx = headers.findIndex(h => {
                    const l = h.toLowerCase();
                    return l.includes("map50-95") || l.includes("map_0.5:0.95") || l.includes("map95");
                });
                const precisionIdx = headers.findIndex(h => h.toLowerCase().includes("precision"));
                const recallIdx = headers.findIndex(h => h.toLowerCase().includes("recall"));
                const accuracyIdx = headers.findIndex(h => h.toLowerCase().includes("accuracy"));
                const lossIdx = headers.findIndex(h => {
                    const l = h.toLowerCase();
                    return l.includes("val/box_loss") || l.includes("val/loss") || l.includes("train/box_loss") || l.includes("train/loss");
                });

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
                if (precisionIdx !== -1 && row[precisionIdx]) {
                    const val = parseFloat(row[precisionIdx]);
                    if (!isNaN(val) && val > bestPrecision) {
                        bestPrecision = val;
                    }
                }
                if (recallIdx !== -1 && row[recallIdx]) {
                    const val = parseFloat(row[recallIdx]);
                    if (!isNaN(val) && val > bestRecall) {
                        bestRecall = val;
                    }
                }
                if (accuracyIdx !== -1 && row[accuracyIdx]) {
                    const val = parseFloat(row[accuracyIdx]);
                    if (!isNaN(val) && val > bestAccuracy) {
                        bestAccuracy = val;
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
                bestMap50_95,
                bestPrecision,
                bestRecall,
                bestAccuracy
            };

            if (headers.length && lastRow) {
                headers.forEach((h, idx) => {
                    if (lastRow[idx] !== undefined) {
                        const val = parseFloat(lastRow[idx]);
                        const numVal = isNaN(val) ? lastRow[idx] : val;
                        const cleanHeader = h.trim();
                        metrics[cleanHeader] = numVal;

                        // Normalize common YOLO header names onto metrics object
                        const lower = cleanHeader.toLowerCase();
                        if ((lower.includes("map50") || lower.includes("map_0.5")) && !lower.includes("map50-95") && !lower.includes("map_0.5:0.95")) {
                            if (!metrics.mAP50) metrics.mAP50 = numVal;
                        } else if (lower.includes("map50-95") || lower.includes("map_0.5:0.95")) {
                            if (!metrics["mAP50-95"]) metrics["mAP50-95"] = numVal;
                        } else if (lower.includes("precision")) {
                            if (!metrics.precision) metrics.precision = numVal;
                        } else if (lower.includes("recall")) {
                            if (!metrics.recall) metrics.recall = numVal;
                        } else if (lower.includes("accuracy")) {
                            if (!metrics.accuracy) metrics.accuracy = numVal;
                        }
                    }
                });
            }

            if (bestMap50 > 0) {
                metrics.bestMap50 = bestMap50;
                if (!metrics.mAP50) metrics.mAP50 = bestMap50;
            }
            if (bestMap50_95 > 0) {
                metrics.bestMap50_95 = bestMap50_95;
                if (!metrics["mAP50-95"]) metrics["mAP50-95"] = bestMap50_95;
            }
            if (bestPrecision > 0 && !metrics.precision) metrics.precision = bestPrecision;
            if (bestRecall > 0 && !metrics.recall) metrics.recall = bestRecall;
            if (bestAccuracy > 0 && !metrics.accuracy) metrics.accuracy = bestAccuracy;

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

/**
 * Fallback metric parser when results.csv is absent - inspects metrics.json, summary.json,
 * and execution log files (*.log, *.txt) for training/evaluation metric values.
 */
async function parseFallbackMetrics(runDir, fileEntries) {
    let metrics = {};

    const metricsJsonPath = path.join(runDir, "metrics.json");
    const summaryJsonPath = path.join(runDir, "summary.json");

    if (fs.existsSync(metricsJsonPath)) {
        try {
            const m = JSON.parse(fs.readFileSync(metricsJsonPath, "utf8"));
            if (m && typeof m === "object") metrics = { ...metrics, ...m };
        } catch (e) {}
    }
    if (fs.existsSync(summaryJsonPath)) {
        try {
            const s = JSON.parse(fs.readFileSync(summaryJsonPath, "utf8"));
            if (s && s.metrics && typeof s.metrics === "object") {
                metrics = { ...metrics, ...s.metrics };
            }
        } catch (e) {}
    }

    const logFiles = fileEntries.filter(f => 
        (f.name.endsWith(".log") || f.name.endsWith(".txt")) && f.name !== "cfgTemplate.txt"
    );

    let maxMap50 = metrics.bestMap50 || metrics.mAP50 || 0;
    let maxMap50_95 = metrics.bestMap50_95 || metrics["mAP50-95"] || 0;
    let lastPrecision = metrics.precision || metrics.bestPrecision || 0;
    let lastRecall = metrics.recall || metrics.bestRecall || 0;
    let lastAccuracy = metrics.accuracy || metrics.bestAccuracy || 0;

    for (const logFile of logFiles) {
        if (logFile.sizeBytes > 10 * 1024 * 1024) continue;
        let content;
        try {
            content = fs.readFileSync(logFile.fullPath, "utf8");
        } catch (e) {
            continue;
        }

        const lines = content.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Pattern 1: Standard YOLO evaluation row: 'all <images> <instances> <precision> <recall> <mAP50> <mAP50-95>'
            const allMatch = trimmed.match(/^\s*all\s+\d+\s+\d+\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
            if (allMatch) {
                const p = parseFloat(allMatch[1]);
                const r = parseFloat(allMatch[2]);
                const map50 = parseFloat(allMatch[3]);
                const map5095 = parseFloat(allMatch[4]);

                if (!isNaN(p) && p > 0) lastPrecision = p;
                if (!isNaN(r) && r > 0) lastRecall = r;
                if (!isNaN(map50) && map50 > maxMap50) maxMap50 = map50;
                if (!isNaN(map5095) && map5095 > maxMap50_95) maxMap50_95 = map5095;
                continue;
            }

            // Pattern 2: Key-value metric log entries
            const map50Match = trimmed.match(/mAP(?:@|_)?50(?!\s*-\s*95)\b(?:\s*[:=]\s*|\s+)(0\.\d+|\d+\.\d+)/i);
            if (map50Match) {
                const val = parseFloat(map50Match[1]);
                if (!isNaN(val) && val > maxMap50) maxMap50 = val;
            }

            const map95Match = trimmed.match(/mAP(?:@|_)?(?:50-95|0\.5:0\.95)\b(?:\s*[:=]\s*|\s+)(0\.\d+|\d+\.\d+)/i);
            if (map95Match) {
                const val = parseFloat(map95Match[1]);
                if (!isNaN(val) && val > maxMap50_95) maxMap50_95 = val;
            }

            const precMatch = trimmed.match(/\bprecision\b(?:\(B\))?\s*[:=]?\s*(0\.\d+|\d+\.\d+)/i);
            if (precMatch) {
                const val = parseFloat(precMatch[1]);
                if (!isNaN(val) && val > 0) lastPrecision = val;
            }

            const recMatch = trimmed.match(/\brecall\b(?:\(B\))?\s*[:=]?\s*(0\.\d+|\d+\.\d+)/i);
            if (recMatch) {
                const val = parseFloat(recMatch[1]);
                if (!isNaN(val) && val > 0) lastRecall = val;
            }

            const accMatch = trimmed.match(/\b(?:accuracy|accuracy_top1|top1)\b\s*[:=]?\s*(0\.\d+|\d+\.\d+)/i);
            if (accMatch) {
                const val = parseFloat(accMatch[1]);
                if (!isNaN(val) && val > 0) lastAccuracy = val;
            }
        }
    }

    if (maxMap50 > 0) {
        metrics.bestMap50 = maxMap50;
        metrics.mAP50 = maxMap50;
    }
    if (maxMap50_95 > 0) {
        metrics.bestMap50_95 = maxMap50_95;
        metrics["mAP50-95"] = maxMap50_95;
    }
    if (lastPrecision > 0) {
        metrics.bestPrecision = lastPrecision;
        metrics.precision = lastPrecision;
    }
    if (lastRecall > 0) {
        metrics.bestRecall = lastRecall;
        metrics.recall = lastRecall;
    }
    if (lastAccuracy > 0) {
        metrics.bestAccuracy = lastAccuracy;
        metrics.accuracy = lastAccuracy;
    }

    return metrics;
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
    const title = summary.runName || "Model Execution Report";
    let md = `# Run Summary: ${title}\n\n`;
    md += `- **Run Type**: ${summary.runType ? summary.runType.toUpperCase() : "TRAINING/INFERENCE"}\n`;
    md += `- **Execution Status**: ${summary.logDiagnostics && summary.logDiagnostics.completionStatus ? summary.logDiagnostics.completionStatus : "Completed"}\n`;
    md += `- **Generated At**: ${summary.generatedAt || new Date().toISOString()}\n`;
    md += `- **Artifact Count**: ${summary.artifactCount || 0} files (${summary.imageCount || 0} images)\n\n`;

    md += `## Executive Summary & Findings\n`;
    if (summary.findings && summary.findings.length) {
        summary.findings.forEach(f => {
            md += `- ${f}\n`;
        });
    } else {
        md += `- No summary findings recorded.\n`;
    }

    if (summary.metrics && (Object.keys(summary.metrics).length > 0 || (summary.performanceAnalysis && Object.keys(summary.performanceAnalysis).length > 0))) {
        md += `\n## Performance & Metrics Analysis\n`;
        if (summary.performanceAnalysis && summary.performanceAnalysis.lossReductionPercent) {
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

    if (summary.config && Object.keys(summary.config).length > 0) {
        md += `\n## Configuration & Hyperparameters\n`;
        md += `\`\`\`json\n${JSON.stringify(summary.config, null, 2)}\n\`\`\`\n`;
    }

    return md;
}

function generateAggregatedMarkdownSummary(summary) {
    const title = summary.runName || (summary.projectName ? `${summary.projectName} All Runs` : "All Projects");
    let md = `# Run Summary: ${title}\n\n`;
    md += `- **Type**: AGGREGATED ALL-RUNS REPORT\n`;
    md += `- **Project**: ${summary.projectName || "All Projects"}\n`;
    md += `- **Generated At**: ${summary.generatedAt || new Date().toISOString()}\n`;
    md += `- **Total Runs Analyzed**: ${summary.totalRuns || 0} (${summary.trainingRunCount || 0} training, ${summary.inferenceRunCount || 0} inference)\n\n`;

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

        // A run output directory is identified by run-level marker files directly inside it.
        // Structural directories (a project root that merely contains run folders, or a weights/
        // checkpoint folder holding only *.pt files) must NOT be treated as runs, otherwise
        // listings and aggregates fill with junk entries like "training" and "weights".
        const isRunDir = entries.some(f =>
            f === "results.csv" || f === "args.yaml" || f === "opt.yaml" || f === "hyp.yaml" ||
            f === "labels.jpg" || f === "labels.png" ||
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

        // Deduplicate discovered runs. The same run name can appear under multiple search roots
        // (e.g. runs/detect/train and public/projects/<proj>/training/train); within a project-scoped
        // query collapse those to a single entry, keeping the most recently modified path, so listings
        // and aggregated reports never show duplicate run names.
        const uniqueRuns = new Map();
        for (const r of runs) {
            const key = filterProject ? String(r.runName).toLowerCase() : `path:${r.runPath}`;
            const existing = uniqueRuns.get(key);
            if (!existing || new Date(r.lastModified) > new Date(existing.lastModified)) {
                uniqueRuns.set(key, r);
            }
        }

        const dedupedRuns = Array.from(uniqueRuns.values());
        dedupedRuns.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        return dedupedRuns;
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

/**
 * Model Card Generation (Hugging Face compatible)
 *
 * Builds a YAML-frontmatter README (MODEL_CARD.md) sourced entirely from a run's own
 * artifacts - never from a Hugging Face Hub URL. Reuses generateSingleRunSummary for
 * config/metrics/weights parsing rather than re-reading the run directory from scratch.
 */

const PIPELINE_TAG_BY_TASK = {
    detect: "object-detection",
    segment: "image-segmentation",
    obb: "object-detection",
    classify: "image-classification",
    pose: "keypoint-detection"
};

/**
 * Parses the "names:" class map out of a YOLO-style dataset yaml
 * (e.g. coco_classes.yaml / data.yaml), supporting both the
 * "  0: className" mapping form and a "  - className" list form.
 */
function parseClassNamesYaml(yamlStr) {
    const lines = yamlStr.split("\n");
    const byIndex = [];
    const list = [];
    let inNames = false;

    for (const line of lines) {
        if (/^names\s*:/.test(line.trim()) && !/^\s/.test(line)) {
            inNames = true;
            continue;
        }
        if (!inNames) continue;

        if (line.trim() === "") continue;
        if (!/^\s/.test(line)) break; // dedent back to top-level: names block ended

        const mapMatch = line.match(/^\s+(\d+)\s*:\s*(.+)$/);
        if (mapMatch) {
            byIndex[parseInt(mapMatch[1], 10)] = mapMatch[2].trim();
            continue;
        }
        const listMatch = line.match(/^\s+-\s*(.+)$/);
        if (listMatch) {
            list.push(listMatch[1].trim());
        }
    }

    const fromMap = byIndex.filter((name) => name !== undefined);
    return fromMap.length > 0 ? fromMap : list;
}

/**
 * Looks for a dataset yaml directly inside the run directory and extracts its class list.
 */
function discoverClassNames(runDir) {
    const candidates = ["coco_classes.yaml", "data.yaml", "dataset.yaml"];
    for (const fileName of candidates) {
        const filePath = path.join(runDir, fileName);
        if (fs.existsSync(filePath)) {
            try {
                const names = parseClassNamesYaml(fs.readFileSync(filePath, "utf8"));
                if (names.length > 0) {
                    return { names, source: fileName };
                }
            } catch (e) {}
        }
    }
    return { names: [], source: null };
}

function countImagesInDir(dir) {
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
    let count = 0;

    function walk(currentDir) {
        let entries;
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (imageExtensions.includes(path.extname(entry.name).toLowerCase())) {
                count++;
            }
        }
    }

    walk(dir);
    return count;
}

/**
 * Counts images per train/val/test split by inspecting the run's own dataset
 * layout (images/<split>/ for detect/segment/obb, <split>/<class>/ for classify).
 */
function discoverDatasetImageCounts(runDir) {
    const splits = ["train", "val", "test"];
    const counts = {};
    let total = 0;
    let found = false;

    for (const split of splits) {
        const detectSplitPath = path.join(runDir, "images", split);
        const classifySplitPath = path.join(runDir, split);

        let splitCount = 0;
        if (fs.existsSync(detectSplitPath)) {
            splitCount = countImagesInDir(detectSplitPath);
            found = true;
        } else if (fs.existsSync(classifySplitPath) && fs.statSync(classifySplitPath).isDirectory()) {
            splitCount = countImagesInDir(classifySplitPath);
            found = true;
        }

        counts[split] = splitCount;
        total += splitCount;
    }

    return found ? { ...counts, total } : null;
}

function inferTask(config, datasetCounts, classifyPathHint) {
    if (config && typeof config.task === "string" && config.task.trim()) {
        return config.task.trim().toLowerCase();
    }
    if (classifyPathHint) return "classify";
    return "detect";
}

function buildModelIndexMetrics(metrics) {
    const results = [];
    const seen = new Set();

    const push = (type, value) => {
        if (typeof value === "number" && Number.isFinite(value) && !seen.has(type)) {
            seen.add(type);
            results.push({ type, value });
        }
    };

    push("mAP50", metrics.bestMap50);
    push("mAP50-95", metrics.bestMap50_95);

    Object.keys(metrics || {}).forEach((key) => {
        const value = metrics[key];
        if (typeof value !== "number" || !Number.isFinite(value)) return;
        const lower = key.toLowerCase();

        if (lower.includes("precision")) push("Precision", value);
        else if (lower.includes("recall")) push("Recall", value);
        else if (lower.includes("top1")) push("Top-1 Accuracy", value);
        else if (lower.includes("top5")) push("Top-5 Accuracy", value);
        else if (lower.includes("accuracy")) push("Accuracy", value);
    });

    return results;
}

function buildTags(config, task) {
    const tags = new Set(["ultralytics", "yolo"]);
    if (task) tags.add(task);

    const modelRef = config && (config.model || config.weights);
    if (typeof modelRef === "string" && modelRef.trim()) {
        const base = path.basename(modelRef, path.extname(modelRef)).toLowerCase();
        if (base) tags.add(base);
    }

    return Array.from(tags);
}

function yamlScalar(value) {
    return JSON.stringify(String(value));
}

/**
 * Hand-rolled YAML writer scoped to the fixed model-card frontmatter shape below -
 * avoids pulling in a generic YAML dependency for a handful of known fields.
 */
function buildFrontmatterYaml({ pipelineTag, tags, modelIndex }) {
    let yaml = "";
    yaml += `library_name: ${yamlScalar("ultralytics")}\n`;
    yaml += `pipeline_tag: ${yamlScalar(pipelineTag)}\n`;
    yaml += `tags:\n`;
    tags.forEach((tag) => {
        yaml += `  - ${yamlScalar(tag)}\n`;
    });

    if (modelIndex && modelIndex.metrics.length > 0) {
        yaml += `model-index:\n`;
        yaml += `  - name: ${yamlScalar(modelIndex.name)}\n`;
        yaml += `    results:\n`;
        yaml += `      - task:\n`;
        yaml += `          type: ${yamlScalar(modelIndex.taskType)}\n`;
        yaml += `        dataset:\n`;
        yaml += `          name: ${yamlScalar(modelIndex.datasetName)}\n`;
        yaml += `          type: ${yamlScalar("custom")}\n`;
        yaml += `        metrics:\n`;
        modelIndex.metrics.forEach((metric) => {
            yaml += `          - type: ${yamlScalar(metric.type)}\n`;
            yaml += `            value: ${metric.value}\n`;
        });
    }

    return yaml;
}

function formatMetricValue(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function buildModelCardBody({ runName, runDir, summary, classNames, classSource, datasetCounts, task, modelIndexMetrics }) {
    const config = summary.config || {};
    let md = `# ${runName}\n\n`;
    md += `Auto-generated Hugging Face model card, sourced entirely from this run's own artifacts (config, results.csv, dataset files). Regenerate from the run directory rather than editing the config/metrics sections by hand.\n\n`;

    md += `## Model Details\n\n`;
    md += `- **Task**: ${task}\n`;
    md += `- **Framework**: Ultralytics YOLO\n`;
    md += `- **Base weights**: ${config.model || config.weights || "N/A"}\n`;
    md += `- **Run name**: ${runName}\n`;
    md += `- **Generated at**: ${summary.generatedAt || new Date().toISOString()}\n\n`;

    md += `## Training Data\n\n`;
    if (classNames.length > 0) {
        md += `- **Classes (${classNames.length})**: ${classNames.map((c) => `\`${c}\``).join(", ")}\n`;
        md += `- **Class source**: \`${classSource}\`\n`;
    } else {
        md += `- **Classes**: not found in run artifacts (no coco_classes.yaml/data.yaml present).\n`;
    }
    if (datasetCounts) {
        md += `- **Images**: ${datasetCounts.total} total (train: ${datasetCounts.train}, val: ${datasetCounts.val}, test: ${datasetCounts.test})\n\n`;
    } else {
        md += `- **Images**: ${summary.imageCount || 0} image artifact(s) discovered in the run directory (train/val/test split not found).\n\n`;
    }

    if (Object.keys(config).length > 0) {
        md += `## Training Configuration\n\n`;
        md += `\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\`\n\n`;
    }

    md += `## Evaluation Results\n\n`;
    if (modelIndexMetrics.length > 0) {
        md += `| Metric | Value |\n| --- | --- |\n`;
        modelIndexMetrics.forEach((metric) => {
            md += `| ${metric.type} | ${formatMetricValue(metric.value)} |\n`;
        });
        md += `\n`;
    } else {
        md += `No evaluation metrics were found in this run's results.csv.\n\n`;
    }

    if (summary.weightsInfo && summary.weightsInfo.length > 0) {
        md += `## Model Checkpoints\n\n`;
        md += `| File | Size |\n| --- | --- |\n`;
        summary.weightsInfo.forEach((weight) => {
            md += `| \`${weight.relPath}\` | ${weight.sizeMB} |\n`;
        });
        md += `\n`;
    }

    md += `## Limitations\n\n`;
    md += `- This card was generated automatically from run artifacts and has not been reviewed by a human.\n`;
    md += `- Evaluation metrics reflect performance on this run's own validation split only; verify against held-out data before deployment.\n`;
    if (summary.logDiagnostics && summary.logDiagnostics.errors && summary.logDiagnostics.errors.length > 0) {
        md += `- The training log recorded errors during this run; review \`logDiagnostics\` in \`summary.json\` before use.\n`;
    }
    md += `\n`;

    md += `## How to Use\n\n`;
    const bestWeight = (summary.weightsInfo || []).find((w) => w.name.includes("best")) || (summary.weightsInfo || [])[0];
    md += "```python\n";
    md += `from ultralytics import YOLO\n\n`;
    md += `model = YOLO("${bestWeight ? bestWeight.relPath : "best.pt"}")\n`;
    md += `results = model.predict("path/to/image.jpg")\n`;
    md += "```\n";

    return md;
}

/**
 * Renders an SVG template with model details, metrics, dataset counts, and framework info
 * and converts it to a PNG image buffer using sharp.
 */
/**
 * Truncates class list string before it reaches the right boundary of the image card container.
 */
function formatClassList(classNames, maxChars = 32) {
    if (!classNames || classNames.length === 0) return "N/A";

    let resultItems = [];
    for (let i = 0; i < classNames.length; i++) {
        const name = classNames[i];
        const remainingCount = classNames.length - i;
        const countSuffix = i > 0 ? ` (+${remainingCount} more)` : `... (+${remainingCount})`;

        const testStr = resultItems.length > 0 ? resultItems.join(", ") + `, ${name}` : name;
        if (testStr.length + (remainingCount > 1 ? countSuffix.length : 0) > maxChars) {
            if (resultItems.length === 0) {
                return name.slice(0, Math.max(5, maxChars - 5)) + "...";
            }
            return resultItems.join(", ") + ` (+${remainingCount} more)`;
        }
        resultItems.push(name);
    }
    return resultItems.join(", ");
}

/**
 * Renders an SVG template with model details, metrics, dataset counts, and framework info
 * in Njobvu platform brand aesthetics and converts it to a PNG image buffer using sharp.
 */
async function generateModelCardImageBuffer({
    runName,
    summary,
    classNames,
    classSource,
    datasetCounts,
    task,
    pipelineTag,
    modelIndexMetrics
}) {
    const config = (summary && summary.config) || {};
    const metrics = (summary && summary.metrics) || {};

    const formatMetric = (val) => {
        if (typeof val === "number" && Number.isFinite(val)) {
            return `${(val > 1 ? val : val * 100).toFixed(2)}%`;
        }
        if (val !== undefined && val !== null && val !== "") {
            return String(val);
        }
        return "N/A";
    };

    const getMetricVal = (...patterns) => {
        for (const pat of patterns) {
            if (metrics[pat] !== undefined && typeof metrics[pat] === "number" && !isNaN(metrics[pat])) {
                return metrics[pat];
            }
            for (const [k, v] of Object.entries(metrics)) {
                if (typeof v !== "number" || isNaN(v)) continue;
                const lowerK = k.toLowerCase().trim();
                const lowerPat = pat.toLowerCase().trim();
                if (lowerPat === "map50" && (lowerK.includes("map50-95") || lowerK.includes("map_0.5:0.95"))) {
                    continue;
                }
                if (lowerK.includes(lowerPat)) {
                    return v;
                }
            }
            const item = modelIndexMetrics.find((m) => {
                const t = m.type.toLowerCase();
                if (pat.toLowerCase() === "map50" && t.includes("map50-95")) return false;
                return t.includes(pat.toLowerCase());
            });
            if (item && typeof item.value === "number" && !isNaN(item.value)) {
                return item.value;
            }
        }
        return undefined;
    };

    const map50 = getMetricVal("bestMap50", "mAP50", "mAP_0.5", "metrics/mAP50(B)", "metrics/mAP50");
    const map50_95 = getMetricVal("bestMap50_95", "mAP50-95", "mAP_0.5:0.95", "metrics/mAP50-95(B)", "metrics/mAP50-95");
    const precision = getMetricVal("bestPrecision", "precision", "metrics/precision(B)", "metrics/precision");
    const recall = getMetricVal("bestRecall", "recall", "metrics/recall(B)", "metrics/recall");
    const accuracy = getMetricVal("bestAccuracy", "accuracy", "accuracy_top1", "metrics/accuracy_top1", "metrics/accuracy");

    const map50Str = formatMetric(map50);
    const map50_95Str = formatMetric(map50_95);
    const precisionStr = formatMetric(precision);
    const recallStr = formatMetric(recall);
    const accuracyStr = formatMetric(accuracy);

    const modelName = config.model || config.weights || "YOLOv8";
    const epochs = config.epochs !== undefined ? String(config.epochs) : "N/A";
    const batch = config.batch !== undefined ? String(config.batch) : "N/A";

    const classCountStr = String(classNames ? classNames.length : 0);
    const classListStr = formatClassList(classNames, 32);

    let trainCount = "N/A", valCount = "N/A", testCount = "N/A", totalCount = "0";
    if (datasetCounts) {
        trainCount = String(datasetCounts.train);
        valCount = String(datasetCounts.val);
        testCount = String(datasetCounts.test);
        totalCount = String(datasetCounts.total);
    } else if (summary && summary.imageCount !== undefined) {
        totalCount = String(summary.imageCount);
    }

    const esc = (s) => (s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : "");

    const svg = `<svg width="1000" height="720" viewBox="0 0 1000 720" xmlns="http://www.w3.org/2000/svg">
  <!-- Flat Dark Background -->
  <rect width="1000" height="720" rx="0" fill="#171717"/>
  
  <!-- Njobvu Brand Blue Top Bar -->
  <rect width="1000" height="6" rx="0" fill="#1569AE"/>

  <!-- Header Section -->
  <rect x="40" y="36" width="38" height="38" rx="0" fill="#1569AE"/>
  <text x="59" y="61" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="800" text-anchor="middle">N</text>

  <text x="90" y="52" fill="#1569AE" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5">NJOBVU AI PLATFORM</text>
  <text x="90" y="74" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700">${esc(runName)}</text>

  <!-- Header Badges -->
  <rect x="730" y="38" width="110" height="30" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <text x="785" y="58" fill="#5085A5" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" text-anchor="middle">Ultralytics</text>

  <rect x="850" y="38" width="110" height="30" rx="0" fill="#1569AE"/>
  <text x="905" y="58" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" text-anchor="middle">${esc((task || "detect").toUpperCase())}</text>

  <!-- Metric Stat Cards -->
  <rect x="40" y="110" width="215" height="115" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <text x="60" y="140" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">mAP@50</text>
  <text x="60" y="188" fill="#1569AE" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800">${esc(map50Str)}</text>

  <rect x="275" y="110" width="215" height="115" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <text x="295" y="140" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">mAP@50-95</text>
  <text x="295" y="188" fill="#5085A5" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800">${esc(map50_95Str)}</text>

  <rect x="510" y="110" width="215" height="115" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <text x="530" y="138" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">Precision / Recall</text>
  <text x="530" y="172" fill="#38bdf8" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700">P: ${esc(precisionStr)}</text>
  <text x="530" y="200" fill="#a0c4df" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600">R: ${esc(recallStr)}</text>

  <rect x="745" y="110" width="215" height="115" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <text x="765" y="140" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">Accuracy</text>
  <text x="765" y="188" fill="#0284c7" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="800">${esc(accuracyStr)}</text>

  <!-- Left Panel: Model & Framework Details -->
  <rect x="40" y="250" width="450" height="400" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <rect x="60" y="275" width="4" height="20" rx="0" fill="#1569AE"/>
  <text x="74" y="291" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700">Model &amp; Framework Details</text>
  <line x1="60" y1="308" x2="470" y2="308" stroke="#334155" stroke-width="1"/>

  <text x="60" y="342" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Framework:</text>
  <text x="210" y="342" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">Ultralytics YOLO</text>

  <text x="60" y="382" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Base Weights / Model:</text>
  <text x="210" y="382" fill="#5085A5" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">${esc(modelName)}</text>

  <text x="60" y="422" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Task Type:</text>
  <text x="210" y="422" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14">${esc(task)} (${esc(pipelineTag)})</text>

  <text x="60" y="462" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Epochs / Batch Size:</text>
  <text x="210" y="462" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14">${esc(epochs)} / ${esc(batch)}</text>

  <text x="60" y="502" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Run Name:</text>
  <text x="210" y="502" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14">${esc(runName)}</text>

  <text x="60" y="542" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Project:</text>
  <text x="210" y="542" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14">${esc(config.project || "N/A")}</text>

  <!-- Right Panel: Dataset & Class Statistics -->
  <rect x="510" y="250" width="450" height="400" rx="0" fill="#252525" stroke="#334155" stroke-width="1"/>
  <rect x="530" y="275" width="4" height="20" rx="0" fill="#1569AE"/>
  <text x="544" y="291" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700">Dataset &amp; Class Statistics</text>
  <line x1="530" y1="308" x2="940" y2="308" stroke="#334155" stroke-width="1"/>

  <text x="530" y="342" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Class Count:</text>
  <text x="670" y="342" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">${esc(classCountStr)} classes</text>

  <text x="530" y="382" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Classes List:</text>
  <text x="670" y="382" fill="#5085A5" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500">${esc(classListStr)}</text>

  <text x="530" y="422" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="14">Class Source:</text>
  <text x="670" y="422" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="13">${esc(classSource || "N/A")}</text>

  <text x="530" y="470" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600">Dataset Image Split Counts</text>

  <rect x="530" y="490" width="92" height="64" rx="0" fill="#171717" stroke="#334155"/>
  <text x="576" y="512" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Train</text>
  <text x="576" y="539" fill="#1569AE" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${esc(trainCount)}</text>

  <rect x="632" y="490" width="92" height="64" rx="0" fill="#171717" stroke="#334155"/>
  <text x="678" y="512" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Val</text>
  <text x="678" y="539" fill="#5085A5" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${esc(valCount)}</text>

  <rect x="734" y="490" width="92" height="64" rx="0" fill="#171717" stroke="#334155"/>
  <text x="780" y="512" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Test</text>
  <text x="780" y="539" fill="#0284c7" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${esc(testCount)}</text>

  <rect x="836" y="490" width="104" height="64" rx="0" fill="#171717" stroke="#1569AE"/>
  <text x="888" y="512" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Total</text>
  <text x="888" y="539" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="800" text-anchor="middle">${esc(totalCount)}</text>

  <!-- Footer Branding -->
  <text x="500" y="692" fill="#64748b" font-family="system-ui, -apple-system, sans-serif" font-size="12" text-anchor="middle">Njobvu AI Platform  •  Computer Vision Training &amp; Inference Pipeline</text>
</svg>`;

    return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Generates a Hugging Face-compatible model card (YAML frontmatter + markdown body)
 * as well as a rendered image model card (MODEL_CARD.png) for a single training run.
 *
 * @param {string} runDir - Run directory to source artifacts from
 * @param {Object} [options]
 * @param {Object} [options.summary] - Pre-computed summary object (skips re-parsing)
 * @param {string} [options.runName] - Custom run name/label
 * @param {string} [options.task] - Override task type (detect/segment/obb/classify/pose)
 * @param {string} [options.projectName] - Project name used as the dataset label
 * @returns {Promise<Object>} { modelCardPath, modelCardImagePath, frontmatter, markdown, summary }
 */
async function generateModelCard(runDir, options = {}) {
    if (!runDir || !fs.existsSync(runDir)) {
        throw new Error(`Run directory does not exist: ${runDir}`);
    }

    const summary = options.summary || await generateSingleRunSummary(runDir, options);
    const runName = options.runName || summary.runName || path.basename(runDir);

    const { names: classNames, source: classSource } = discoverClassNames(runDir);
    const datasetCounts = discoverDatasetImageCounts(runDir);
    const task = (options.task || inferTask(summary.config, datasetCounts)).toLowerCase();
    const pipelineTag = PIPELINE_TAG_BY_TASK[task] || "object-detection";

    const modelIndexMetrics = buildModelIndexMetrics(summary.metrics || {});
    const tags = buildTags(summary.config, task);

    const frontmatterYaml = buildFrontmatterYaml({
        pipelineTag,
        tags,
        modelIndex: {
            name: runName,
            taskType: pipelineTag,
            datasetName: options.projectName || (summary.config && summary.config.project) || runName,
            metrics: modelIndexMetrics
        }
    });

    const body = buildModelCardBody({
        runName,
        runDir,
        summary,
        classNames,
        classSource,
        datasetCounts,
        task,
        modelIndexMetrics
    });

    const markdown = `---\n${frontmatterYaml}---\n\n${body}`;
    const modelCardPath = path.join(runDir, "MODEL_CARD.md");
    fs.writeFileSync(modelCardPath, markdown, "utf8");

    const imageBuffer = await generateModelCardImageBuffer({
        runName,
        summary,
        classNames,
        classSource,
        datasetCounts,
        task,
        pipelineTag,
        modelIndexMetrics
    });
    const modelCardImagePath = path.join(runDir, "MODEL_CARD.png");
    fs.writeFileSync(modelCardImagePath, imageBuffer);

    return {
        modelCardPath,
        modelCardImagePath,
        frontmatter: { library_name: "ultralytics", pipeline_tag: pipelineTag, tags },
        markdown,
        summary
    };
}

module.exports = {
    generateRunSummary,
    generateSingleRunSummary,
    generateAggregatedRunSummary,
    discoverRunDirectories,
    listAvailableRuns,
    buildRunDocumentContext,
    persistCustomSummary,
    generateModelCard,
    parseYamlSimple,
    parseResultsCsvStream
};
