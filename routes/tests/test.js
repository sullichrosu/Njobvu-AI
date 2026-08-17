async function test(req, res) {
    let file = req.files.upload_project;

    var username = req.cookies.Username;

    var Numprojects = await db.getAsync(
        "SELECT COUNT(*) AS THING FROM Access WHERE Username = '" +
            username +
            "'",
    );

    res.send({ Success: "Test was successful" });
}

module.exports = test;
