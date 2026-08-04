const queries = require("../../queries/queries");

async function addClasses(req, res) {
    var PName = req.body.PName,
        admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username,
        validation = req.body.validation;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName;

    let inputClasses = req.body.input_classes;
    inputClasses = inputClasses.split(",");

    var insertClasses = [];
    for (i = 0; i < inputClasses.length; i++) {
        if (inputClasses[i] != "") {
            insertClasses.push(inputClasses[i]);
        }
    }

    let existingClasses;
    try {
        existingClasses = await queries.project.getAllClasses(projectPath);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error fetching existing classes");
    }

    var currentClasses = [];
    for (var i = 0; i < existingClasses.rows.length; i++) {
        currentClasses.push(existingClasses.rows[i].CName);
    }

    for (var i = 0; i < insertClasses.length; i++) {
        if (!currentClasses.includes(insertClasses[i])) {
            currentClasses.push(insertClasses[i]);
            await queries.project.createClass(projectPath, insertClasses[i]);
        }
    }

    if (validation) return res.redirect("/configV?IDX=" + IDX);
    return res.redirect("/config/classSettings?IDX=" + IDX);
}

module.exports = addClasses;
