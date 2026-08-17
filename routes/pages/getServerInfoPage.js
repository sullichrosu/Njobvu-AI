async function getServerInfoPage(req, res) {
    var IDX = parseInt(req.query.IDX),
        user = req.cookies.Username;

    var IDX = parseInt(req.query.IDX),
        user = req.cookies.Username;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }
    if (user == undefined) {
        return res.redirect("/");
    }

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    var num = IDX;

    if (num >= projects.length) {
        valid = 1;
        return res.redirect("/home");
    }
    var PName = projects[num].PName;
    var Admin = projects[num].Admin;

    res.render("training/serverInfo", {
        title: "serverInfo",
        user: req.cookies.Username,
        IDX: IDX,
        PName: PName,
        Admin: Admin,
        logged: req.query.logged,
        activePage: "serverInfo",
    });
}

module.exports = getServerInfoPage;
