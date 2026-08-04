async function getLoginPage(req, res) {
    try {
        const auto_save = 1;
        await db.runAsync("UPDATE Projects SET AutoSave = '" + auto_save + "'");
    } catch (err) {
        global.logger.error("AutoSave DB update failed", err);
        // Optional: set a flash message or fallback UI
    }
    // var auto_save = 1;
    // db.runAsync("UPDATE Projects SET AutoSave = '" + auto_save + "'");



    res.render("login", {
        title: "login",
        logged: req.query.logged,
    });
}

module.exports = getLoginPage;
