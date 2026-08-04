async function getProjectSettingsPage(req, res) {
    var user = req.cookies.Username;
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    var IDX = req.query.IDX;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }

    if (user == undefined) {
        return res.redirect("/");
    }

    if (IDX >= projects.length) {
        valid = 1;
        return res.redirect("/home");
    }

    var PName = projects[IDX].PName;
    var admin = projects[IDX].Admin;

    var results1 = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );

    global.logger.debug("username: ", user);
    try {
        res.render("settings/projSettings", {
            title: "projSettings",
            logged: req.query.logged,
            user: user,
            PName: PName,
            Admin: admin,
            PDescription: results1.PDescription,
            IDX: IDX,
            activePage: "projSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering projSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getProjectSettingsPage;
