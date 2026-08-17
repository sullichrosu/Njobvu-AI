const { readdirSync } = require("fs");
const queries = require("../../queries/queries");

async function changeUserName(req, res) {
    var user = req.cookies.Username,
        UName = req.body.UName;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        downloadPath = mainPath + user + "_Downloads",
        newDownloadPath = mainPath + UName + "_Downloads";

    try {
        await queries.managed.updateUser(user, UName, null, null, null, null);
        await queries.managed.changeAllAccessForUsername(user, UName);
        await queries.managed.changeAllAccessAdminForUsername(user, UName);
        await queries.managed.updateAllProjectsForAdmin(user, UName);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating user");
    }

    fs.rename(downloadPath, newDownloadPath, () => {});

    var projectFiles = readdirSync(mainPath);

    for (var f = 0; f < projectFiles.length; f++) {
        if (projectFiles[f].split("-")[0] == user) {
            fs.rename(
                mainPath + projectFiles[f],
                mainPath + UName + "-" + projectFiles[f].split("-")[1],
                () => {},
            );
        }
    }

    res.clearCookie("Username");
    res.cookie("Username", UName, {
        httpOnly: true,
    });
    return res.send({ Success: "Yes" });
}

module.exports = changeUserName;
