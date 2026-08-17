const queries = require("../../queries/queries");

async function getServerInfoPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    try {
        const userProjectsRes = await queries.managed.getUserProjects(user);
        projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
    } catch (err) {
        global.logger.error("Error fetching projects for server info page:", err);
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const Admin = projects[idx].Admin;

    res.render("training/serverInfo", {
        title: "serverInfo",
        user,
        IDX: idx,
        PName,
        Admin,
        logged: req.query.logged,
        activePage: "serverInfo",
    });
}

module.exports = getServerInfoPage;
