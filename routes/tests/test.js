async function test(req, res) {
    let file = req.files.upload_project;

    var username = req.cookies.Username;

    try {
        await db.getAsync(
            "SELECT COUNT(*) AS THING FROM Access WHERE Username = '" +
                username +
                "'",
        );
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error running test");
    }

    res.send({ Success: "Test was successful" });
}

module.exports = test;
