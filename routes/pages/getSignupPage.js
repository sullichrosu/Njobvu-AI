const queries = require("../../queries/queries");

async function getSignupPage(req, res) {
    let users = [];
    try {
        const usersRes = await queries.managed.sql("SELECT * FROM Users", []);
        const rows = (usersRes && usersRes.rows) ? usersRes.rows : [];
        users = rows.map((u) => u.Username);
    } catch (err) {
        global.logger.error("Error fetching users for signup page:", err);
    }

    res.render("signup", {
        title: "signup",
        logged: req.query.logged,
        users,
    });
}

module.exports = getSignupPage;
