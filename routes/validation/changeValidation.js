const queries = require("../../queries/queries");

async function changeValidation(req, res) {
    var PName = req.body.PName;
    var admin = req.body.Admin;
    var status = parseInt(req.body.validMode);

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName;

    if (isNaN(status) || (status !== 0 && status !== 1)) {
        res.send({ Success: "No" });
        return;
    }
    try {
        if (status === 0) {
            await queries.managed.sql(
                "UPDATE Projects SET Validate = ? WHERE PName = ? AND Admin = ?",
                [Number(1), PName, admin],
            );
            await queries.project.sql(
                projectPath,
                "UPDATE Images SET reviewImage = 1",
            );
        }

        if (status == 1) {
            await queries.managed.sql(
                "UPDATE Projects SET Validate = ? WHERE PName = ? AND Admin = ?",
                [Number(0), PName, admin],
            );
            await queries.project.sql(
                projectPath,
                "UPDATE Images SET reviewImage = 0",
            );
        }
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating validation status");
    }

    res.send({ Success: "Yes" });
}

module.exports = changeValidation;
