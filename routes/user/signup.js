const fs = require("fs");
const bcrypt = require("bcryptjs");
const queries = require("../../queries/queries");

async function signup(req, res) {
    var firstName = req.body.Fname,
        lastName = req.body.Lname,
        email = req.body.email,
        username = req.body.username,
        password = req.body.password;

    try {
        const userExists = await queries.managed.checkUserExists(username);

        if (userExists.row.ExistingUsers > 0) {
            return res.status(409).send("User with that username already exists");
        }

        // Hash password and create user
        const hash = await new Promise((resolve, reject) => {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) reject(err);
                else resolve(hash);
            });
        });

        await queries.managed.createUser(
            username,
            hash,
            firstName,
            lastName,
            email,
        );

        // Create user directory
        var publicPath = global.currentPath;
        var mainPath = publicPath + "public/projects/",
            downloadsPath = mainPath + username + "_Downloads";

        if (!fs.existsSync(downloadsPath)) {
            fs.mkdirSync(downloadsPath, { recursive: true });
        }

        return res.redirect("/");

    } catch (err) {
        global.logger.error(err);
        res.status(500).send("Error signing up");
        return;
    }
}

module.exports = signup;
