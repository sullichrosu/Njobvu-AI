const getDbClient = require("../getDbClient");

// Strangler-fig v2 companion to queries/labelling/labelling.js: adds author
// tracking and a breadcrumb history on top of the existing Labels table
// without changing any of the legacy CRUD functions there.
module.exports = {
    project: {
        createLabelWithAuthor: async function (
            projectPath,
            { lid, className, x, y, w, h, imageName, authorId, authorType },
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO Labels (LID, CName, X, Y, W, H, IName, AuthorId, AuthorType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

            return db.run(query, [
                lid,
                className,
                x,
                y,
                w,
                h,
                imageName,
                authorId,
                authorType,
            ]);
        },
        updateLabelFieldsAndAuthor: async function (
            projectPath,
            lid,
            { className, x, y, w, h, authorId, authorType },
        ) {
            const db = getDbClient(projectPath);
            const query =
                "UPDATE Labels SET CName = ?, X = ?, Y = ?, W = ?, H = ?, AuthorId = ?, AuthorType = ? WHERE LID = ?";

            return db.run(query, [
                className,
                x,
                y,
                w,
                h,
                authorId,
                authorType,
                lid,
            ]);
        },
        deleteLabelById: async function (projectPath, lid) {
            const db = getDbClient(projectPath);
            return db.run("DELETE FROM Labels WHERE LID = ?", [lid]);
        },
        insertLabelHistory: async function (
            projectPath,
            { lid, authorId, authorType, action, changedAt = new Date().toISOString() },
        ) {
            const db = getDbClient(projectPath);
            const query =
                "INSERT INTO LabelHistory (LID, AuthorId, AuthorType, Action, ChangedAt) VALUES (?, ?, ?, ?, ?)";

            return db.run(query, [lid, authorId, authorType, action, changedAt]);
        },
        getLabelHistory: async function (projectPath, lid) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT * FROM LabelHistory WHERE LID = ? ORDER BY HistoryId ASC";

            return db.all(query, [lid]);
        },
        getLabelHistoryForImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query =
                "SELECT LabelHistory.*, Labels.CName AS CName, Labels.IName AS IName " +
                "FROM LabelHistory INNER JOIN Labels ON Labels.LID = LabelHistory.LID " +
                "WHERE Labels.IName = ? ORDER BY LabelHistory.LID ASC, LabelHistory.HistoryId ASC";

            return db.all(query, [imageName]);
        },
    },
};
