const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { generatePipelineScript } = require("./generatePipelineScript");

function runPython(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout);
        });
    });
}

function resolveCustomScriptPaths(pipeline, customScripts, scriptsDir) {
    const scriptById = new Map((customScripts || []).map((script) => [String(script.id), script]));

    return (pipeline || []).map((step) => {
        if (step.type !== "custom") {
            return step;
        }

        const script = scriptById.get(String(step.scriptId));
        return {
            ...step,
            scriptPath: script ? path.join(scriptsDir, script.filename) : "",
        };
    });
}

// Generates a single Python (OpenCV) script from the enabled/ordered pipeline
// and runs it once against every image in the project. Kept separate from
// the per-step OpenCV code (generatePipelineScript.js) so the codegen can be
// extended independently of this orchestration.
async function applyPipelineToProject({ projectPath, pipeline, customScripts }) {
    const imagesDir = path.join(projectPath, "images");

    if (!fs.existsSync(imagesDir)) {
        return { processed: 0 };
    }

    const preprocessingDir = path.join(projectPath, "preprocessing");
    const scriptsDir = path.join(preprocessingDir, "scripts");
    const outputDir = path.join(preprocessingDir, "output");
    const generatedScriptPath = path.join(preprocessingDir, "run_pipeline.py");

    if (!fs.existsSync(preprocessingDir)) {
        fs.mkdirSync(preprocessingDir, { recursive: true });
    }

    const resolvedPipeline = resolveCustomScriptPaths(pipeline, customScripts, scriptsDir);
    const scriptSource = generatePipelineScript(resolvedPipeline);
    fs.writeFileSync(generatedScriptPath, scriptSource, "utf8");

    const pythonBin = (global.configFile && global.configFile.default_python_path) || process.env.PYTHON_PATH || "python3";
    const stdout = await runPython(`${pythonBin} "${generatedScriptPath}" "${imagesDir}" "${outputDir}"`);
    const processed = parseInt(String(stdout).trim().split("\n").pop(), 10);

    return { processed: Number.isFinite(processed) ? processed : 0, outputDir };
}

module.exports = { applyPipelineToProject };
