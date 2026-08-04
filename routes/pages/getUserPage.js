async function getUserPage(req, res) {
    var user = req.cookies.Username;
    if (user == undefined) {
        return res.redirect("/");
    }

    var userInfo = await db.getAsync(
        "SELECT * FROM Users WHERE Username = '" + user + "'",
    );
    var results1 = await db.allAsync("SELECT * FROM Users");
    var users = [];
    for (var i = 0; i < results1.length; i++) {
        users.push(results1[i].Username);
    }
    var Fname = userInfo.FirstName;
    var Lname = userInfo.LastName;
    var email = userInfo.Email;

    res.render("user", {
        title: "user",
        user: req.cookies.Username,
        Fname: Fname,
        Lname: Lname,
        email: email,
        users: users,
        logged: req.query.logged,
        activePage: "User",
        IDX: null,
    });
}

module.exports = getUserPage;
