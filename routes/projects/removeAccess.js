const queries = require("../../queries/queries");

async function removeAccess(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        validation = req.body.validation;

    var OldUser = req.body.OldUser;

    await queries.managed.deleteAccessFromProject(OldUser, PName);

    if (validation) return res.redirect("/configV?IDX=" + IDX);
    return res.redirect("/config/accessSettings?IDX=" + IDX);
}

module.exports = removeAccess;
