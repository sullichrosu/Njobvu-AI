async function logout(req, res) {
    res.clearCookie("Username");
    res.redirect("/");
}

module.exports = logout;
