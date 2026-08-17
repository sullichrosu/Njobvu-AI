const queries = require("../../queries/queries");

async function getUserPage(req, res) {
    const user = req.cookies ? req.cookies.Username : undefined;
    if (user === undefined) {
        return res.redirect("/");
    }

    let userInfo = null;
    let allUsers = [];

    if (global.db && typeof global.db.getAsync === "function") {
        try {
            userInfo = await global.db.getAsync("SELECT * FROM Users WHERE Username = '" + user + "'");
        } catch (err) {}
    }
    if (!userInfo && queries.managed && typeof queries.managed.getUser === "function") {
        try {
            const userRes = await queries.managed.getUser(user);
            userInfo = (userRes && userRes.row) ? userRes.row : null;
        } catch (err) {}
    }

    if (global.db && typeof global.db.allAsync === "function") {
        try {
            const rows = await global.db.allAsync("SELECT * FROM Users");
            allUsers = (rows || []).map((u) => u.Username);
        } catch (err) {}
    }
    if ((!allUsers || allUsers.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const usersRes = await queries.managed.sql("SELECT * FROM Users", []);
            const rows = (usersRes && usersRes.rows) ? usersRes.rows : [];
            allUsers = rows.map((u) => u.Username);
        } catch (err) {}
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
