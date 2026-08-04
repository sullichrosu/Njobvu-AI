const queries = require("../../queries/queries");

async function changeFname(req, res) {
    var user = req.cookies.Username,
        FName = req.body.FName;

    try {
        await queries.managed.updateUser(user, null, null, FName, null, null);
    } catch (err) {
        global.logger.error(err);
        return res.send({ Success: "No" });
    }

    return res.send({ Success: "Yes" });
}

module.exports = changeFname;
