const queries = require("../../queries/queries");

async function changeValidation(req, res) {
    var PName = req.body.PName;
    var admin = req.body.Admin;
    var status = parseInt(req.body.validMode);

    if (isNaN(status) || (status !== 0 && status !== 1)) {
        res.send({ Success: "No" });
        return;
    }
    try {
        // Toggling the project's overall Validate mode intentionally leaves
        // each image's individual reviewImage flag untouched, so per-image
        // review state set via /toggleAllReview or manual review survives a
        // Validate toggle instead of being clobbered.
        if (status === 0) {
            await queries.managed.sql(
                "UPDATE Projects SET Validate = ? WHERE PName = ? AND Admin = ?",
                [Number(1), PName, admin],
            );
        }

        if (status == 1) {
            await queries.managed.sql(
                "UPDATE Projects SET Validate = ? WHERE PName = ? AND Admin = ?",
                [Number(0), PName, admin],
            );
        }
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating validation status");
    }

    res.send({ Success: "Yes" });
}

module.exports = changeValidation;
