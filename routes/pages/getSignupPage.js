async function getSignupPage(req, res) {
    var results1 = await db.allAsync("SELECT * FROM `Users`");
    var users = [];
    for (var i = 0; i < results1.length; i++) {
        users.push(results1[i].Username);
    }

    res.render("signup", {
        title: "signup",
        logged: req.query.logged,
        users: users,
    });
}

module.exports = getSignupPage;
