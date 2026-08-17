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
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql("SELECT * FROM Access WHERE Username = ?", [user]);
            projects = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
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
