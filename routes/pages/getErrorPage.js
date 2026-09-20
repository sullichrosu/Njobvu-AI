async function getErrorPage(req, res) {
    res.render("error", {
        title: req.query.error,
        user: req.cookies.Username,
    });
}

module.exports = getErrorPage;
