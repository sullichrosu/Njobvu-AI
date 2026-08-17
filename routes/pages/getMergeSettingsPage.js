async function getMergeSettingsPage(req, res) {
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
    var mergeProjects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" +
            user +
            "' AND NOT PName = '" +
            PName +
            "'",
    );

    global.logger.debug("username: ", user);
    try {
        res.render("settings/mergeSettings", {
            title: "mergeSettings",
            logged: req.query.logged,
            user: user,
            PName: PName,
            Admin: admin,
            IDX: IDX,
            activePage: "mergeSettings",
            mergeProjects: mergeProjects,
        });
    } catch (error) {
        global.logger.error("Error rendering projSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getMergeSettingsPage;
