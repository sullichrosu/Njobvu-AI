const queries = require("../../queries/queries");

async function changeLname(req, res) {
    var user = req.cookies.Username,
        LName = req.body.LName;

    try {
        await queries.managed.updateUser(user, null, null, null, LName, null);
    } catch (err) {
        global.logger.error(err);
        return res.send({ Success: "No" });
    }

    return res.send({ Success: "Yes" });
}

module.exports = changeLname;
