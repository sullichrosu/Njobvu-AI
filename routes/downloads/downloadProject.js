const { spawn } = require("child_process");
const queries = require("../../queries/queries");

async function downloadProject(req, res) {
    var PName = req.body.PName;
    var admin = req.body.Admin;
    var username = req.cookies.Username;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName,
        downloadPath = mainPath + username + "_Downloads";
    (imagesPath = projectPath + "/images/"),
        (bootstrapPath = projectPath + "/bootstrap"),
        (trainingPath = projectPath + "/training"),
        (pythonPath = trainingPath + "/python"),
        (logsPath = trainingPath + "/logs"),
        (projectDb = `${projectPath}/${PName}.db`),
        (dumpFile = `${PName}.dump`),
        (dumpPath = `${projectPath}/${dumpFile}`);

    if (!fs.existsSync(downloadPath)) {
        fs.mkdir(downloadPath, (err) => {
            if (err) {
                global.logger.error(err);
            }
        });
    }

    let tableExists;
    try {
        tableExists = await queries.project.checkTableExists(projectPath, 'Labels');
    } catch (err) {
        global.logger.debug("Error checking table existence:", err);
        return res.json({ success: false, message: "Database error occurred" });
    }
    if (tableExists.rows[0].count == 0) {
        return res.json({ success: false, message: "No Labels table found" });
    } else {
        var output = fs.createWriteStream(downloadPath + "/" + PName + ".zip");

        var archive = archiver("zip");

        output.on("close", function () {
            return res.download(downloadPath + "/" + PName + ".zip", (err) => {
                if (err) {
                    global.logger.debug("Download error:", err);
                    return res.json({ success: false, message: "Download failed" });
                }
            });
        });

        archive.on("error", function (err) {
            global.logger.error(err);
            return res.json({ success: false, message: "Archive creation failed" });
        });

        archive.pipe(output);

        archive.directory(projectPath, false);

        archive.finalize();
    }
}

module.exports = downloadProject;
