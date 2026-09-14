const { getPageParams } = require("./pageContext");

async function getClassificationPage(req, res) {
    const { username } = getPageParams(req);
    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Admin = '" + username + "'",
    );
    var PNames = [];
    for (var i = 0; i < projects.length; i++) {
        PNames.push(projects[i].PName);
    }
    res.render("createClassification", {
        title: "createClassification",
        user: username,
        logged: req.query.logged,
        PNames: PNames,
        activePage: "Classification",
    });
}

module.exports = getClassificationPage;
