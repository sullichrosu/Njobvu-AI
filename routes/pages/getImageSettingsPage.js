async function getImageSettingsPage(req, res) {
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

    try {
        res.render("settings/imagesSettings", {
            title: "imageSettings",
            logged: req.query.logged,
            user: user,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            activePage: "imageSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering imageSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getImageSettingsPage;
