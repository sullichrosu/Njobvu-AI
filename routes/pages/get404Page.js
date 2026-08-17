async function get404Page(req, res) {
    res.render("404", {
        title: "404",
        user: req.cookies.Username,
    });
}

module.exports = get404Page;
