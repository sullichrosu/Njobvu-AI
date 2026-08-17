const queries = require("../../queries/queries");

async function getLoginPage(req, res) {
    try {
        const auto_save = 1;
        if (global.db && typeof global.db.runAsync === "function") {
            await global.db.runAsync("UPDATE Projects SET AutoSave = '" + auto_save + "'");
        } else {
            await queries.managed.sql("UPDATE Projects SET AutoSave = ?", [auto_save]);
        }
    } catch (err) {
        global.logger.error("AutoSave DB update failed", err);
    }

    res.render("login", {
        title: "login",
        logged: req.query.logged,
    });
}

module.exports = getLoginPage;
