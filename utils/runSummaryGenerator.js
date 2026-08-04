const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * Training & Inference Run Output Analysis / Summary Generator
 * 
 * Inspects a training or inference run output directory, parses metadata,
 * metrics, and artifacts, and generates structured summary files (summary.json & run_summary.md).
 */

/**
 * Analyzes a run directory and writes summary files.
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

    const files = fs.readdirSync(runDir);
    const runName = options.runName || path.basename(runDir);

    let runType = options.runType || "auto";
    if (runType === "auto") {
        if (files.includes("results.csv") || files.includes("args.yaml") || files.includes("weights") || runDir.includes("train")) {
            runType = "training";
        } else {
            runType = "inference";
        }
    }

    const artifactFiles = [];
    const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".bmp"];
    let imageCount = 0;

    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (imageExtensions.includes(ext)) {
            imageCount++;
            artifactFiles.push(file);
        } else if (file.endsWith(".pt") || file.endsWith(".onnx") || file.endsWith(".engine") || file.endsWith(".csv") || file.endsWith(".yaml")) {
            artifactFiles.push(file);
        }
    });

    let configData = {};
    const argsPath = path.join(runDir, "args.yaml");
    if (fs.existsSync(argsPath)) {
        configData = parseYamlSimple(fs.readFileSync(argsPath, "utf8"));
    } else {
        const configJsonPath = path.join(runDir, "config.json");
        if (fs.existsSync(configJsonPath)) {
            try {
                configData = JSON.parse(fs.readFileSync(configJsonPath, "utf8"));
            } catch (e) {}
        }
    }

    let metrics = {};
    const resultsCsvPath = path.join(runDir, "results.csv");
    if (fs.existsSync(resultsCsvPath)) {
        metrics = await parseResultsCsvStream(resultsCsvPath);
    } else {
        const metricsJsonPath = path.join(runDir, "metrics.json");
        if (fs.existsSync(metricsJsonPath)) {
            try {
                metrics = JSON.parse(fs.readFileSync(metricsJsonPath, "utf8"));
            } catch (e) {}
        }
    }

    const summary = {
        runName,
        runDir: path.resolve(runDir),
        runType,
        generatedAt: new Date().toISOString(),
        artifactCount: artifactFiles.length,
        imageCount,
        config: configData,
        metrics,
        findings: generateFindings(runType, metrics, imageCount, artifactFiles)
    };

    // Write summary.json inside the run directory
    const summaryJsonPath = path.join(runDir, "summary.json");
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2), "utf8");

    // Write run_summary.md inside the run directory
    const summaryMdPath = path.join(runDir, "run_summary.md");
    const mdContent = generateMarkdownSummary(summary);
    fs.writeFileSync(summaryMdPath, mdContent, "utf8");

    return summary;
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
        let lastRow = null;
        let bestMap50 = 0;

        rl.on("line", (line) => {
            const row = line.split(",").map(s => s.trim());
            if (rowsCount === 0) {
                headers = row;
            } else {
                lastRow = row;
                const mapIdx = headers.findIndex(h => h.includes("mAP50") || h.includes("mAP_0.5"));
                if (mapIdx !== -1 && row[mapIdx]) {
                    const val = parseFloat(row[mapIdx]);
                    if (!isNaN(val) && val > bestMap50) {
                        bestMap50 = val;
                    }
                }
            }
            rowsCount++;
        });

        rl.on("close", () => {
            const parsed = {
                totalEpochs: Math.max(0, rowsCount - 1),
                bestMap50
            };
            if (headers.length && lastRow) {
                headers.forEach((h, idx) => {
                    if (lastRow[idx] !== undefined) {
                        const val = parseFloat(lastRow[idx]);
                        parsed[h] = isNaN(val) ? lastRow[idx] : val;
                    }
                });
            }
            resolve(parsed);
        });
    });
}

function generateFindings(runType, metrics, imageCount, artifactFiles) {
    const findings = [];

    if (runType === "training") {
        if (metrics.totalEpochs) {
            findings.push(`Completed ${metrics.totalEpochs} epochs of training.`);
        }
        if (metrics.bestMap50) {
            findings.push(`Achieved peak mAP@50 of ${(metrics.bestMap50 * 100).toFixed(2)}%.`);
        }
        if (artifactFiles.includes("best.pt") || artifactFiles.includes("weights/best.pt")) {
            findings.push("Saved best model weights checkpoint.");
        }
    } else {
        findings.push(`Inference run processed ${imageCount} output images.`);
        findings.push(`Total artifact files generated: ${artifactFiles.length}.`);
    }

    return findings;
}

function generateMarkdownSummary(summary) {
    let md = `# Run Summary: ${summary.runName}\n\n`;
    md += `- **Type**: ${summary.runType.toUpperCase()}\n`;
    md += `- **Generated At**: ${summary.generatedAt}\n`;
    md += `- **Images Count**: ${summary.imageCount}\n`;
    md += `- **Total Artifacts**: ${summary.artifactCount}\n\n`;

    md += `## Key Findings\n`;
    if (summary.findings && summary.findings.length) {
        summary.findings.forEach(f => {
            md += `- ${f}\n`;
        });
    } else {
        md += `- No special findings logged.\n`;
    }

    if (Object.keys(summary.metrics).length > 0) {
        md += `\n## Metrics\n`;
        md += `\`\`\`json\n${JSON.stringify(summary.metrics, null, 2)}\n\`\`\`\n`;
    }

    if (Object.keys(summary.config).length > 0) {
        md += `\n## Configuration\n`;
        md += `\`\`\`json\n${JSON.stringify(summary.config, null, 2)}\n\`\`\`\n`;
    }

    return md;
}

module.exports = {
    generateRunSummary,
    parseYamlSimple,
    parseResultsCsvStream
};
