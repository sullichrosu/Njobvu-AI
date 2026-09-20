const queries = require("../../queries/queries");

async function getUserPage(req, res) {
    const user = req.cookies ? req.cookies.Username : undefined;
    if (user === undefined) {
        return res.redirect("/");
    }

    let userInfo = null;
    try {
        const userRes = await queries.managed.getUser(user);
        userInfo = userRes.row || null;
    } catch (err) {
        global.logger.error("Error querying user record:", err);
    }

    let allUsers = [];
    try {
        const usersRes = await queries.managed.sql("SELECT * FROM Users", []);
        allUsers = (usersRes.rows || []).map((u) => u.Username);
    } catch (err) {
        global.logger.error("Error querying users list:", err);
    }

    const Fname = userInfo ? userInfo.FirstName : "";
    const Lname = userInfo ? userInfo.LastName : "";
    const email = userInfo ? userInfo.Email : "";

    res.render("user", {
        title: "user",
        user,
        Fname,
        Lname,
        email,
        users: allUsers,
        logged: req.query.logged,
        activePage: "User",
        IDX: null,
    });
}

module.exports = getUserPage;
