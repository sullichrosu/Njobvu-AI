const queries = require("../../queries/queries");

async function addUser(req, res) {
    var PName = req.body.PName,
        Admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        validation = req.body.validation;

    var NewUser = req.body.newUser;

    let existingUsers;

    try {
        existingUsers = await queries.managed.checkUserExists(NewUser);
    } catch (err) {
        global.logger.error(err);
        res.status(404).send("That user does not exist");
        return;
    }

    if (existingUsers.row.ExistingUsers > 0) {
        let existingAccess;
        try {
            existingAccess = await queries.managed.checkUserHasProjectAccess(
                NewUser,
                PName,
                Admin,
            );
        } catch (err) {
            global.logger.error(err);
            res.status(500).send("Could not check if user has access");
        }

        if (existingAccess.row.ExistingAccess == 0) {
            try {
                await queries.managed.grantUserAccess(NewUser, PName, Admin);
            } catch (err) {
                global.logger.error(err);
                res.status(500).send("Error granting user access");
            }
        }
    }

    if (validation) return res.redirect("/configV?IDX=" + IDX);
    return res.redirect("/config/accessSettings?IDX=" + IDX);
}

module.exports = addUser;
