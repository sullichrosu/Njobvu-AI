const queries = require("../../queries/queries");
const path = require("path");

async function switchLabels(req, res) {
    try {
        const { selectedLabels, selectedClass, currentClass, admin, PName } =
            req.body;

        // Fix: Define currentPath properly
        const currentPath = path.resolve(__dirname, "../../");
        const mainPath = currentPath + "/public/projects/";
        const projectPath = mainPath + admin + "-" + PName;

        global.logger.debug("Request body:", req.body);
        global.logger.debug("switch labels for Project Path:", projectPath);
        global.logger.debug("labels type:", typeof selectedLabels);
        global.logger.debug("labels value:", selectedLabels);
        global.logger.debug("selectedClass:", selectedClass);
        global.logger.debug("currentClass:", currentClass);

        // Validate input
        if (!selectedLabels) {
            return res.status(400).json({
                message: "No labels provided"
            });
        }

        // Convert selectedLabels to array if it's not already
        let labelsArray;
        if (Array.isArray(selectedLabels)) {
            labelsArray = selectedLabels;
        } else if (typeof selectedLabels === 'string') {
            // If it's a string, try to split it or parse it
            labelsArray = selectedLabels.split(',').map(label => label.trim());
        } else {
            // If it's a single value, make it an array
            labelsArray = [selectedLabels];
        }

        if (labelsArray.length === 0) {
            return res.status(400).json({
                message: "No labels selected"
            });
        }

        if (!selectedClass || !currentClass) {
            return res.status(400).json({
                message: "Missing class information"
            });
        }

        const placeholders = labelsArray.map(() => "?").join(",");
        global.logger.debug("placeholders", placeholders);
        const sql = `UPDATE Labels SET CName = ? WHERE CName = ? AND LID IN (${placeholders})`;
        global.logger.debug("SQL query:", sql);

        const params = [selectedClass, currentClass, ...labelsArray];
        global.logger.debug("SQL params:", params);

        const result = await queries.project.sql(projectPath, sql, params);

        // Check if the query worked
        if (result.error) {
            global.logger.error("SQL Error:", result.error);
            return res.status(500).json({
                message: "Database error occurred",
                error: result.error
            });
        }
        global.logger.debug("Number of labels updated:", result.changes);

        if (result.changes === 0) {
            console.warn("No labels were updated - check if the labels exist and match the criteria");
            return res.json({
                message: "No labels were updated - labels may not exist or already have the target class",
                labelsAffected: 0,
                body: req.body,
            });
        }

        return res.json({
            message: "Labels switched successfully",
            labelsAffected: result.changes,
            body: req.body,
        });

    } catch (error) {
        global.logger.error("Error in switchLabels:", error);
        res.status(500).json({
            message: error.message,
            stack: error.stack
        });
    }
}

module.exports = switchLabels;