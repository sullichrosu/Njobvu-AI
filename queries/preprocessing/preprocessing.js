module.exports = {
    managed: {
        listSteps: async function (projectName, admin) {
            const query =
                "SELECT * FROM PreprocessingSteps WHERE PName = ? AND Admin = ? ORDER BY StepOrder ASC";

            return await global.managedDbClient.all(query, [projectName, admin]);
        },
        replaceSteps: async function (projectName, admin, steps) {
            await global.managedDbClient.run(
                "DELETE FROM PreprocessingSteps WHERE PName = ? AND Admin = ?",
                [projectName, admin],
            );

            for (const step of steps) {
                await global.managedDbClient.run(
                    "INSERT INTO PreprocessingSteps (PName, Admin, Type, ScriptId, Enabled, StepOrder, Params) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [
                        projectName,
                        admin,
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
        listScripts: async function (projectName, admin) {
            const query =
                "SELECT * FROM PreprocessingScripts WHERE PName = ? AND Admin = ? ORDER BY UploadedAt ASC";

            return await global.managedDbClient.all(query, [projectName, admin]);
        },
        addScript: async function (projectName, admin, name, filename) {
            return await global.managedDbClient.run(
                "INSERT INTO PreprocessingScripts (PName, Admin, Name, Filename, UploadedAt) VALUES (?, ?, ?, ?, ?)",
                [projectName, admin, name, filename, new Date().toISOString()],
            );
        },
    },
};
