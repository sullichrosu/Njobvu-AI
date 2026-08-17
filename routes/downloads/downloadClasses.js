const fs = require("fs");
const queries = require("../../queries/queries");

async function downloadClasses(req, res) {
    var PName = req.body.PName;
    var admin = req.body.Admin;
    var username = req.cookies.Username;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName,
        downloadPath = mainPath + username + "_Downloads";

    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath);
    }

    let existingClasses;
    try {
        existingClasses = await queries.project.getAllClasses(projectPath);
    } catch (err) {
        global.logger.error(err);
        return res
            .status(500)
            .json({ success: false, message: "Error fetching classes" });
    }

    if (!existingClasses.rows.length) {
        return res.json({
            success: false,
            message: "No classes found for this project",
        });
    }

    var classList =
        existingClasses.rows.map((row) => row.CName).join("\n") + "\n";
    var classListFile = `${PName}_ClassList.txt`;
    var classListPath = `${downloadPath}/${classListFile}`;

    try {
        fs.writeFileSync(classListPath, classList);
    } catch (err) {
        global.logger.error(err);
        return res
            .status(500)
            .json({ success: false, message: "Error writing class list" });
    }

    return res.download(classListPath);
}

module.exports = downloadClasses;
