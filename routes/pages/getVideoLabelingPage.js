function dbAll(sql, params) {
    return new Promise((resolve, reject) => {
        global.db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function getVideoLabelingPage(req, res) {
    const username = req.cookies.Username;
    const IDX = parseInt(req.query.IDX, 10);

    if (!username) {
        return res.redirect("/");
    }
    if (Number.isNaN(IDX)) {
        return res.redirect("/home");
    }

    let projects;
    try {
        projects = await dbAll("SELECT * FROM Access WHERE Username = ?", [username]);
    } catch (err) {
        global.logger.error(err);
        return res.redirect("/home");
    }

    const project = projects && projects[IDX];
    if (!project) {
        global.logger.error("No project found for IDX:", IDX);
        return res.redirect("/home");
    }

    return res.render("videoLabeling", {
        title: "Video Labeling",
        user: username,
        PName: project.PName,
        admin: project.Admin,
        IDX,
        activePage: "Label",
    });
}

module.exports = getVideoLabelingPage;
