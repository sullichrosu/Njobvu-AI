const { getPageParams } = require("./pageContext");

async function getImageSettingsPage(req, res) {
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
