const getDbClient = require("../getDbClient");

module.exports = {
    managed: {},
    project: {
        getPipeline: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT StepId, StepType, ScriptId, Enabled, StepOrder, Params FROM PreprocessingSteps ORDER BY StepOrder ASC";
            const result = await db.all(query);

            return result;
        },
        replacePipeline: async function (projectPath, steps) {
            const db = getDbClient(projectPath);
            await db.run("DELETE FROM PreprocessingSteps");

            for (const step of steps) {
                await db.run(
                    "INSERT INTO PreprocessingSteps (StepId, StepType, ScriptId, Enabled, StepOrder, Params) VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        step.id,
                        step.type,
                        step.scriptId || null,
                        step.enabled ? 1 : 0,
                        step.order,
                        JSON.stringify(step.params || {}),
                    ],
                );
            }

            return { success: true };
        },
        getCustomScripts: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT ScriptId, Name, FileName, UploadedAt FROM PreprocessingScripts ORDER BY UploadedAt ASC";
            const result = await db.all(query);

            return result;
        },
        getCustomScriptById: async function (projectPath, scriptId) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT ScriptId, Name, FileName, UploadedAt FROM PreprocessingScripts WHERE ScriptId = ?";
            const result = await db.get(query, [scriptId]);

            return result;
        },
        addCustomScript: async function (projectPath, script) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO PreprocessingScripts (ScriptId, Name, FileName, UploadedAt) VALUES (?, ?, ?, ?)";
            await db.run(query, [script.id, script.name, script.fileName, script.uploadedAt]);

            return { success: true };
        },
        deleteCustomScript: async function (projectPath, scriptId) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM PreprocessingScripts WHERE ScriptId = ?";
            const result = await db.run(query, [scriptId]);

            return result;
        },
    },
};
