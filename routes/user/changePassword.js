const queries = require("../../queries/queries");

async function changePassword(req, res) {
    var username = req.cookies.Username,
        oldPassword = req.body.oldPassword,
        newPassword = req.body.newPassword;

    let user;
    try {
        user = await queries.managed.getUser(username);
    } catch (err) {
        global.logger.error(err);
        return res.send({ Success: "Could not get current user" });
    }

    global.logger.debug(user);

    if (!bcrypt.compareSync(oldPassword, user.row.Password)) {
        return res.send({ Success: "Wrong Password!" });
    } else {
        bcrypt.hash(newPassword, 10, async function (err, hash) {
            if (err) {
                global.logger.error(err);
                return res.send({
                    Success:
                        "Password hashing error. Password has not been changed",
                });
            } else {
                try {
                    await queries.managed.updateUser(
                        username,
                        null,
                        hash,
                        null,
                        null,
                        null,
                    );
                } catch (err) {
                    global.logger.error(err);
                    return res.send({ Success: "Error updating password" });
                }

                return res.send({ Success: "Yes" });
            }
        });
    }
}

module.exports = changePassword;
