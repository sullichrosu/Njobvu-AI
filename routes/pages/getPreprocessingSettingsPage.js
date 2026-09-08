async function getPreprocessingSettingsPage(req, res) {
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

    try {
        res.render("settings/preprocessingSettings", {
            title: "preprocessingSettings",
            logged: req.query.logged,
            user: user,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            activePage: "preprocessingSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering preprocessingSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getPreprocessingSettingsPage;
