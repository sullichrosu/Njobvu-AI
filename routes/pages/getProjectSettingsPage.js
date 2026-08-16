async function getProjectSettingsPage(req, res) {
    var user = req.cookies.Username;
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    if (req.query.IDX == undefined) {
        return res.redirect("/home");
    }

    if (user == undefined) {
        return res.redirect("/");
    }

    var IDX = parseInt(req.query.IDX, 10);

    if (!Number.isInteger(IDX) || IDX < 0 || IDX >= projects.length) {
        return res.redirect("/home?error=project_not_found");
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

    if (!results1) {
        return res.redirect("/home?error=project_not_found");
    }

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
