const getDbClient = require("../getDbClient");

// Strangler-fig v2 companion to queries/labelling/labelling.js: adds author
// tracking to the Labels table without changing any of the legacy CRUD
// functions there. Labels are only ever deleted and recreated (never edited
// in place), so the author simply lives as a column on the row itself.
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
    },
};
