const fs = require("fs");
const rimraf = require("../../public/libraries/rimraf");
const queries = require("../../queries/queries");

async function deleteProject(req, res) {
    var PName = req.body.PName,
        admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/";
    projectPath = mainPath + admin + "-" + PName;

    var darknetPath = new Set();
    var tempdarknet = fs
        .readFileSync(projectPath + "/training/darknetPaths.txt", "utf-8")
        .split("\n")
        .join(",")
        .split(",");
    for (var f = 0; f < tempdarknet.length; f++) {
        if (tempdarknet[f] != "") {
            darknetPath.add(tempdarknet[f]);
        }
    }

    const darknetTemp = darknetPath.values();
    for (let i = 0; i < darknetPath.size; i++) {
        var currentDarknetPath = darknetTemp.next().value;
        var darknetFiles = readdirSync(currentDarknetPath);
        for (let j = 0; j < darknetFiles.length; j++) {
            if (darknetFiles[j] == admin + "-" + PName) {
                rimraf(currentDarknetPath + "/" + darknetFiles[j], (err) => {
                    if (err) {
                        console.error(
                            "there was an error with the user contents: ",
                            err,
                        );
                    } else {
                        console.log(
                            "Darknet user project contents successfuly deleted",
                        );
                    }
                });
            }
        }
    }

    rimraf(projectPath, function (err) {
        if (err) {
            global.logger.error(err);
        }
    });

    try {
        fs.unlinkSync(projectPath + "/" + PName + ".db");
        await queries.managed.deleteAccessFromProject(admin, PName);
        await queries.managed.deleteProject(PName, admin);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error deleting project");
    }

    return res.redirect("/home");
}

module.exports = deleteProject;
