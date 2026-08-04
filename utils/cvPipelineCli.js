#!/usr/bin/env node

const path = require("path");
const { runSandboxedPython } = require("./sandboxedPythonRunner");
const { generateRunSummary, listAvailableRuns } = require("./runSummaryGenerator");

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === "run-python") {
        const scriptIdx = args.indexOf("--script");
        const codeIdx = args.indexOf("--code");
        const roleIdx = args.indexOf("--role");

        const scriptPath = scriptIdx !== -1 ? args[scriptIdx + 1] : null;
        const code = codeIdx !== -1 ? args[codeIdx + 1] : null;
        const userRole = roleIdx !== -1 ? args[roleIdx + 1] : "user";

        try {
            const result = await runSandboxedPython({ scriptPath, code, userRole });
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        } catch (err) {
            console.error("Error executing Python script:", err.message);
            process.exit(1);
        }
    } else if (command === "summarize-run") {
        const dirIdx = args.indexOf("--dir");
        const runDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

        if (!runDir) {
            console.error("Usage: cvPipelineCli summarize-run --dir <path_to_run_dir>");
            process.exit(1);
        }

        try {
            const summary = await generateRunSummary(runDir);
            console.log(JSON.stringify(summary, null, 2));
            process.exit(0);
        } catch (err) {
            console.error("Error generating run summary:", err.message);
            process.exit(1);
        }
    } else if (command === "list-runs") {
        const dirIdx = args.indexOf("--dir");
        const baseRunsDir = dirIdx !== -1 ? args[dirIdx + 1] : null;

        try {
            const runs = listAvailableRuns(baseRunsDir);
            console.log(JSON.stringify(runs, null, 2));
            process.exit(0);
        } catch (err) {
            console.error("Error listing available runs:", err.message);
            process.exit(1);
        }
    } else {
        console.log("CV Pipeline CLI Tool");
        console.log("Commands:");
        console.log("  run-python --script <path> | --code <code> [--role <role>]");
        console.log("  summarize-run --dir <path>");
        console.log("  list-runs [--dir <path>]");
        process.exit(0);
    }
}

if (require.main === module) {
    main();
}
