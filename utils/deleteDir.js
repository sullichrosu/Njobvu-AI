const fs = require("fs");

async function deleteDir(projectPath) {
    fs.rm(projectPath, { recursive: true, force: true }, (err) => {
        if (err) {
            return console.error("Error deleting dir: ", err);
        }
        return console.log("Dir deleted succesfully");
    });
}

module.exports = deleteDir;
