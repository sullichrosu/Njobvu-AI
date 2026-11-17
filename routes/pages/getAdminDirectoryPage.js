const queries = require("../../queries/queries");

// Admin-only page directory page
async function getAdminPartitionsPage(req, res) {
    const user = req.cookies.Username;

    if (!user) {
        return res.redirect("/");
    }

    const config = global.configFile || {};

    if (!config.admin || user !== config.admin) {
        return res.redirect("/home");
    }

    const usersResult = await queries.managed.getAllUsers();
    const users = ((usersResult && usersResult.rows) || []).map(
        (row) => row.Username,
    );

    res.render("admin/directory", {
        title: "adminDirectory",
        user: user,
        users: users,
        isAdmin: true
    });
}

module.exports = getAdminPartitionsPage;
