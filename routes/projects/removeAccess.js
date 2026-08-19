const queries = require("../../queries/queries");

async function removeAccess(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        validation = req.body.validation;

    var OldUser = req.body.OldUser;

    try {
        await queries.managed.deleteAccessFromProject(OldUser, PName);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error removing access");
    }

    if (validation) return res.redirect("/configV?IDX=" + IDX);
    return res.redirect("/config/accessSettings?IDX=" + IDX);
}

module.exports = removeAccess;
