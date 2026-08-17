const fs = require("fs");
const queries = require("../../queries/queries");
const bcrypt = require('bcryptjs'); 


async function login(req, res) {
    var username = req.body.username,
        password = req.body.password;

    

    var publicPath = currentPath;
    var mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        downloadsPath = mainPath + username + "_Downloads";

    if (!fs.existsSync(downloadsPath)) {
        fs.mkdir(downloadsPath, (err) => {
            if (err) {
                global.logger.error("Failed to create user downloads directory", err);
            }
        });
    }

    let user;

    try {
        user = await queries.managed.getUser(username);
    } catch (err) {
        global.logger.error("User login lookup failed", err);
        res.send({ Success: "No" });
        return;
    }

    if (!user.row) {
        res.status(404).send({ Success: "No" });
        return;
    }

    if (bcrypt.compareSync(password, user.row.Password)) {
        res.cookie("Username", username, {
            httpOnly: true,
        });
        res.send({ Success: "Yes" });
    } else {
        res.send({ Success: "No" });
    }
}

module.exports = login;
