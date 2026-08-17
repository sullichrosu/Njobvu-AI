const getDbClient = require("../getDbClient");

module.exports = {
    project: {
        getLabelsForImageNameAndClassName: async function (
            projectPath,
            imageName,
            className,
        ) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Labels WHERE IName = ? AND CName = ?";
            const result = await db.all(query, [imageName, className]);

            return result;
        },
        getLabelsForImageName: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Labels WHERE IName = ?";
            const result = await db.all(query, [imageName]);

            return result;
        },
        getMaxLabelId: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT * FROM Labels WHERE LID = (SELECT MAX(LID)  FROM Labels)";
            const result = await db.all(query);

            return result;
        },
        getAllLabels: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Labels";
            const result = await db.all(query);

            return result;
        },
        updateLabelImageName: async function (projectPath, oldName, newName) {
            const db = getDbClient(projectPath);
            const query = "UPDATE Labels SET IName = ? WHERE IName = ?";
            const result = await db.run(query, [newName, oldName]);

            return result;
        },
        updateLabelClassName: async function (projectPath, oldName, newName) {
            const db = getDbClient(projectPath);
            const query = "UPDATE Labels SET CName = ? WHERE CName = ?";
            const result = await db.run(query, [newName, oldName]);

            return result;
        },
        createLabel: async function (
            projectPath,
            labelId,
            className,
            leftX,
            bottomY,
            labelWidth,
            labelHeight,
            imageName,
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES (?, ?, ?, ?, ?, ?, ?)";

            const result = await db.run(query, [
                labelId,
                className,
                leftX,
                bottomY,
                labelWidth,
                labelHeight,
                imageName,
            ]);

            return result;
        },
        deleteLabel: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Labels WHERE IName = ?";
            const result = await db.run(query, [imageName]);

            return result;
        },
        deleteAllLabels: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Labels";
            const result = await db.run(query);

            return result;
        },
        deleteAllLabelsForImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Labels WHERE IName = ?";
            const result = await db.run(query, [imageName]);

            return result;
        },
    },
};
