async function getCreatePage(req, res) {
    username = req.cookies.Username;
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Admin = '" + username + "'",
    );
    var PNames = [];
    for (var i = 0; i < projects.length; i++) {
        PNames.push(projects[i].PName);
    }

    res.render("create", {
        title: "create",
        user: req.cookies.Username,
        logged: req.query.logged,
        PNames: PNames,
        activePage: "default",
    });
}

module.exports = getCreatePage;
