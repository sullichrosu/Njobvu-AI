const queries = require("../../queries/queries");

async function changeEmail(req, res) {
    var user = req.cookies.Username,
        email = req.body.Email;

    try {
        await queries.managed.updateUser(user, null, null, null, null, email);
    } catch (err) {
        global.logger.error(err);
        res.send({ Success: "No" });
        return;
    }

    return res.send({ Success: "Yes" });
}

module.exports = changeEmail;
