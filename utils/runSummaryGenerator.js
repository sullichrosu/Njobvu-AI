const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * Training & Inference Run Output Analysis / Summary Generator
 * 
 * Inspects a training or inference run output directory, deeply ingests complete run file
 * artifacts (args.yaml, config.json, results.csv, log files, plots, weight checkpoints),
 * and generates structured, context-aware analysis reports (summary.json & run_summary.md).
 */

/**
 * Deeply analyzes a run directory and writes comprehensive summary files.
 * 
 * @param {string} runDir - Absolute or relative path to the run directory
 * @param {Object} [options]
 * @param {string} [options.runType] - 'training' | 'inference' | 'auto'
 * @param {string} [options.runName] - Custom run name or label
 * @returns {Promise<Object>} Summary object
 */
async function generateRunSummary(runDir, options = {}) {
    if (!runDir || !fs.existsSync(runDir)) {
        throw new Error(`Run directory does not exist: ${runDir}`);
    }

    const stat = fs.statSync(runDir);
    if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${runDir}`);
    }

    const runName = options.runName || path.basename(runDir);
    const allFileEntries = getFilesRecursive(runDir);

    // Detect run type
    let runType = options.runType || "auto";
    if (runType === "auto") {
        const hasTrainingFiles = allFileEntries.some(f => 
            f.name === "results.csv" || f.name === "args.yaml" || f.name.includes("train") || f.relPath.includes("weights")
        );
        runType = hasTrainingFiles ? "training" : "inference";
    }

    // Categorize artifacts
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

    // 1. Ingest configuration & hyperparameters
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

    // 2. Ingest metrics & performance data (stream results.csv or metrics.json)
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

    // 3. Ingest log files
    const logDiagnostics = await parseLogFilesStream(runDir, allFileEntries);

    // 4. Ingest weight checkpoints
    const weightsInfo = parseWeightFiles(runDir, allFileEntries);

    // 5. Synthesize findings and actionable recommendations
    const findings = generateFindings(runType, metrics, imageCount, artifactFiles, weightsInfo, logDiagnostics);
    const recommendations = generateRecommendations(runType, metrics, performanceAnalysis, logDiagnostics);

    const summary = {
        runName,
        runDir: path.resolve(runDir),
        runType,
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

    // Write summary.json
    const summaryJsonPath = path.join(runDir, "summary.json");
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf8");

    // Write run_summary.md
    const summaryMdPath = path.join(runDir, "run_summary.md");
    const mdContent = generateMarkdownSummary(summary);
    fs.writeFileSync(summaryMdPath, mdContent, "utf8");

    return summary;
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
        if (logFile.sizeBytes > 10 * 1024 * 1024) continue; // Skip huge binary log files > 10MB

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

/**
 * Scans run directories for active training and inference runs and returns summary metadata.
 * 
 * @param {string} [baseRunsDir] - Base directory to scan (defaults to project runs directory)
 * @returns {Array<Object>} List of available runs with metadata
 */
function listAvailableRuns(baseRunsDir) {
    const rootPath = baseRunsDir || path.join(__dirname, "..", "runs");
    const searchDirs = [
        rootPath,
        path.join(rootPath, "detect"),
        path.join(rootPath, "train"),
        path.join(rootPath, "inference"),
        path.join(rootPath, "detect", "train"),
        path.join(rootPath, "detect", "predict")
    ];

    const discoveredRuns = [];
    const visitedPaths = new Set();

    searchDirs.forEach(dir => {
        if (!fs.existsSync(dir)) return;
        try {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                if (visitedPaths.has(itemPath)) return;
                
                try {
                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                        visitedPaths.add(itemPath);
                        const subFiles = fs.readdirSync(itemPath);
                        
                        const hasRunFiles = subFiles.some(f => 
                            f === "results.csv" || f === "args.yaml" || f === "summary.json" ||
                            f === "run_summary.md" || f === "config.json" || f.endsWith(".pt") ||
                            f.endsWith(".png") || f.endsWith(".jpg") || f === "weights"
                        );

                        if (hasRunFiles) {
                            const isTraining = subFiles.includes("results.csv") || subFiles.includes("args.yaml") || itemPath.includes("train");
                            const runType = isTraining ? "training" : "inference";
                            const hasSummary = subFiles.includes("summary.json") || subFiles.includes("run_summary.md");
                            const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
                            const imageCount = subFiles.filter(f => imageExtensions.includes(path.extname(f).toLowerCase())).length;

                            discoveredRuns.push({
                                runName: item,
                                runPath: path.resolve(itemPath),
                                relPath: path.relative(path.join(__dirname, ".."), itemPath),
                                runType,
                                hasSummary,
                                artifactCount: subFiles.length,
                                imageCount,
                                lastModified: stat.mtime.toISOString()
                            });
                        }
                    }
                } catch (e) {}
            });
        } catch (e) {}
    });

    return discoveredRuns;
}

module.exports = {
    generateRunSummary,
    listAvailableRuns,
    parseYamlSimple,
    parseResultsCsvStream
};
