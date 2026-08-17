const getDbClient = require("../getDbClient");

module.exports = {
    project: {
        getImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Images WHERE IName = ?";
            const result = await db.get(query, [imageName]);

            return result;
        },
        getImageClassMapping: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = `
                    SELECT Labels.CName, Labels.X, Labels.Y, Labels.W, Labels.H, Images.IName, Images.reviewImage, Images.validateImage
                    FROM Labels
                    JOIN Images ON Labels.IName = Images.IName`;
            const result = await db.all(query);

            return result;
        },
        updateReviewImage: async function (
            projectPath,
            reviewImage,
            imageName,
        ) {
            const db = getDbClient(projectPath);

            const query = "UPDATE Images SET reviewImage = ? WHERE IName = ?";
            const result = await db.run(query, [reviewImage, imageName]);

            return result;
        },
        getAllImages: async function (projectPath) {
            const db = getDbClient(projectPath);
            const query = "SELECT * FROM Images";
            const result = await db.all(query);

            return result;
        },
        updateImageName: async function (projectPath, oldName, newName) {
            const db = getDbClient(projectPath);
            const query = "UPDATE Images SET IName = ? WHERE IName = ?";
            const result = await db.run(query, [newName, oldName]);

            return result;
        },
        deleteImage: async function (projectPath, imageName) {
            const db = getDbClient(projectPath);
            const query = "DELETE FROM Images WHERE IName = ?";
            const result = await db.run(query, [imageName]);

            return result;
        },
        filterImages: function (imageList, options = {}) {
            const {
                search = "",
                review = "all",
                validate = "all",
                labeled = "all",
                sortBy = "name",
                sortOrder = "asc",
            } = options;

            let filtered = [...imageList];

            if (search && search.trim() !== "") {
                const query = search.trim().toLowerCase();
                filtered = filtered.filter((img) =>
                    (img.IName || "").toLowerCase().includes(query),
                );
            }

            if (review === "true" || review === "1" || review === 1) {
                filtered = filtered.filter((img) => Number(img.reviewImage) === 1);
            } else if (review === "false" || review === "0" || review === 0) {
                filtered = filtered.filter((img) => Number(img.reviewImage) === 0);
            }

            if (validate === "true" || validate === "1" || validate === 1) {
                filtered = filtered.filter((img) => Number(img.validateImage) === 1);
            } else if (validate === "false" || validate === "0" || validate === 0) {
                filtered = filtered.filter((img) => Number(img.validateImage) === 0);
            }

            if (labeled === "labeled" || labeled === "true") {
                filtered = filtered.filter(
                    (img) => (Number(img.numLabels) || 0) > 0,
                );
            } else if (labeled === "unlabeled" || labeled === "false") {
                filtered = filtered.filter(
                    (img) => (Number(img.numLabels) || 0) === 0,
                );
            }

            const isDesc = String(sortOrder).toLowerCase() === "desc" ? -1 : 1;
            filtered.sort((a, b) => {
                let valA, valB;
                switch (sortBy) {
                    case "review":
                        valA = Number(a.reviewImage) || 0;
                        valB = Number(b.reviewImage) || 0;
                        break;
                    case "validate":
                        valA = Number(a.validateImage) || 0;
                        valB = Number(b.validateImage) || 0;
                        break;
                    case "numLabels":
                        valA = Number(a.numLabels) || 0;
                        valB = Number(b.numLabels) || 0;
                        break;
                    case "name":
                    default:
                        valA = (a.IName || "").toLowerCase();
                        valB = (b.IName || "").toLowerCase();
                        break;
                }

                if (typeof valA === "string") {
                    return valA.localeCompare(valB) * isDesc;
                }
                return (valA - valB) * isDesc;
            });

            return filtered;
        },
    },
};
