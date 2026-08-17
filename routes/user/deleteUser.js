const queries = require("../../queries/queries");

async function deleteUser(req, res) {
    var user = req.cookies.Username;

    var publicPath = __dirname.replace("routes", "").replace("user", ""),
        mainPath = publicPath + "public/projects/";

    var darknetPath = new Set();

    var filesInFolder = readdirSync(mainPath);

    for (var i = 0; i < filesInFolder.length; i++) {
        if (
            filesInFolder[i].split("_")[0] == user ||
            filesInFolder[i].split("-")[0] == user
        ) {
            if (filesInFolder[i].split("-")[0] == user) {
                var tempdarknet = fs
                    .readFileSync(
                        mainPath +
                            filesInFolder[i] +
                            "/training/darknetPaths.txt",
                        "utf-8",
                    )
                    .split("\n")
                    .join(",")
                    .split(",");
                for (var f = 0; f < tempdarknet.length; f++) {
                    if (tempdarknet[f] != "") {
                        darknetPath.add(tempdarknet[f]);
                    }
                }
            }

            rimraf(mainPath + filesInFolder[i], (err) => {
                if (err) {
                    console.error(
                        "there was an error with the user contents: ",
                        err,
                    );
                } else {
                }
            });
        }
    }

    const darknetTemp = darknetPath.values();
    for (var i = 0; i < darknetPath.size; i++) {
        var currentDarknetPath = darknetTemp.next().value;
        var darknetFiles = readdirSync(currentDarknetPath);
        for (var i = 0; i < darknetFiles.length; i++) {
            if (darknetFiles[i].split("-")[0] == user) {
                rimraf(currentDarknetPath + "/" + darknetFiles[i], (err) => {
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

    try {
        await queries.managed.deleteAllUserAccess(user);
        await queries.managed.deleteAllAdminAccess(user);
        await queries.managed.deleteAllProjectsForAdmin(user);
        await queries.managed.deleteUser(user);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error deleting user");
    }

    res.clearCookie("Username");
    return res.send({ Success: "Yes" });
}

module.exports = deleteUser;
