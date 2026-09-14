const { getPageParams } = require("./pageContext");

async function getProjectSettingsPage(req, res) {
    const { projectIndex: IDX, username: user } = getPageParams(req);
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    if (req.query.IDX == undefined) {
        return res.redirect("/home");
    }

    if (user == undefined) {
        return res.redirect("/");
    }

    if (!Number.isInteger(IDX) || IDX < 0 || IDX >= projects.length) {
        return res.redirect("/home?error=project_not_found");
    }

    var PName = projects[IDX].PName;
    var admin = projects[IDX].Admin;

    var projectInfo = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
            PName +
            "' AND Admin = '" +
            admin +
            "'",
    );

    if (!projectInfo) {
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
            PDescription: projectInfo.PDescription,
            IDX: IDX,
            activePage: "projSettings",
        });
    } catch (error) {
        global.logger.error("Error rendering projSettings:", error);
        res.status(500).send("Error loading page");
    }
}

module.exports = getProjectSettingsPage;
