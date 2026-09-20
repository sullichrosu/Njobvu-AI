const getHelpPage = async (req, res) => {
    try {
        const user = req.cookies ? req.cookies.Username : "";

        res.render("help", {
            title: "Help & Documentation - Njobvu-AI",
            user: user,
            activePage: "help",
            IDX: req.query.IDX || null,
        });

    } catch (err) {
        global.logger.error("Error rendering help page:", err);
        res.status(500).send("Internal Server Error");
    }
};

module.exports = getHelpPage;
