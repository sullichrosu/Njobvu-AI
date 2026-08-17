const getDbClient = require("../getDbClient");

module.exports = {
    project: {
        getAllValidations: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Validation";
            const result = await db.all(query);

            return result;
        },
        getAllValidationsForImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Validation WHERE IName = ?";
            const result = await db.all(query, [imageName]);

            return result;
        },
        createValidation: async function (
            projectPath,
            confidence,
            labelID,
            className,
            imageName,
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO Validation (Confidence, LID, CName, IName) VALUES (?, ?, ?, ?)";
            const result = await db.run(query, [
                confidence,
                Number(labelID),
                className,
                imageName,
            ]);

            return result;
        },
        updateValidationImageName: async function (
            projectPath,
            oldName,
            newName,
        ) {
            const db = getDbClient(projectPath);
            const query = "UPDATE Validation SET IName = ? WHERE IName = ?";
            const result = await db.run(query, [newName, oldName]);

            return result;
        },
        updateValidationClassName: async function (
            projectPath,
            oldName,
            newName,
        ) {
            const db = getDbClient(projectPath);
            const query = "UPDATE Validation SET CName = ? WHERE CName = ?";
            const result = await db.run(query, [newName, oldName]);

            return result;
        },
        deleteValidation: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Validation WHERE IName = ?";
            const result = await db.run(query, [imageName]);

            return result;
        },
        deleteAllValidations: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Validation";
            const result = await db.run(query);

            return result;
        },
        deleteAllValidationsForImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Validation WHERE IName = ?";
            const result = await db.run(query, [imageName]);

            return result;
        },
    },
};
