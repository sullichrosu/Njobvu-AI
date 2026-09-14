async function getSignupPage(req, res) {
    var userRows = await db.allAsync("SELECT * FROM `Users`");
    var users = [];
    for (var i = 0; i < userRows.length; i++) {
        users.push(userRows[i].Username);
    }

    res.render("signup", {
        title: "signup",
        logged: req.query.logged,
        users: users,
    });
}

module.exports = getSignupPage;
