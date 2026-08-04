async function getAccessSettingsPage(req, res) {
    var user = req.cookies.Username;
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    var IDX = req.query.IDX;

    var DAdmin = [];
    for (var i = 0; i < projects.length; i++) {
        DAdmin.push(projects[i].Admin);
    }

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

    var results3 = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName= '" +
            PName +
            "' AND Admin = '" +
            admin +
            "' AND Username != '" +
            user +
            "'",
    );

    var access = [];
    for (var i = 0; i < results3.length; i++) {
        access.push(results3[i].Username);
    }

    try {
        res.render("settings/accessSettings", {
            title: "accessSettings",
            logged: req.query.logged,
            user: user,
            IDX: IDX,
            DAdmin: DAdmin,
            access: access,
            Admin: admin,
            PName: PName,
            activePage: "accessSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering accessSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getAccessSettingsPage;
