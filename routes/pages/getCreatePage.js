const queries = require("../../queries/queries");

async function getCreatePage(req, res) {
    const username = req.cookies ? req.cookies.Username : undefined;
    let PNames = [];
    if (username) {
        try {
            const projectsRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE Admin = ?",
                [username]
            );
            const rows = (projectsRes && projectsRes.rows) ? projectsRes.rows : [];
            PNames = rows.map((p) => p.PName);
        } catch (err) {
            global.logger.error("Error fetching projects for create page:", err);
        }
    }

    res.render("create", {
        title: "create",
        user: username,
        logged: req.query.logged,
        PNames,
        activePage: "default",
    });
}

module.exports = getCreatePage;
