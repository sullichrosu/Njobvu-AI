const cleanDirectory = require("./cleanDirectory");
const StreamZip = require("node-stream-zip");
const fs = require("fs");
const rimraf = require("../public/libraries/rimraf");

async function unzipFile(zipFilePath, outputDir) {
    try {
        const zip = new StreamZip.async({ file: zipFilePath });

        // node-stream-zip's extract() only creates directories it finds
        // referenced in entry paths; a fully flat archive (no subfolders,
        // e.g. the KW Coco export) has none, so it never creates outputDir
        // itself and the first file write fails with ENOENT.
        fs.mkdirSync(outputDir, { recursive: true });

        await zip.extract(null, outputDir);

        await zip.close();

        const macosxPath = `${outputDir}/__MACOSX`;
        if (fs.existsSync(macosxPath)) {
            console.log("Removing __MACOSX folder");
            await new Promise((resolve, reject) => {
                rimraf(macosxPath, (err) => {
                    if (err) {
                        console.error("Error removing __MACOSX folder:", err);
                        reject(err);
                    } else {
                        console.log("__MACOSX folder removed successfully");
                        resolve();
                    }
                });
            });
        }

        await cleanDirectory(outputDir);

        console.log("Deleting original zip file:", zipFilePath);
        // Convert fs.unlink to a promise and await it
        await new Promise((resolve, reject) => {
            fs.unlink(zipFilePath, (err) => {
                if (err) {
                    console.error("Error deleting zip file:", err);
                    reject(err);
                } else {
                    console.log("Zip file deleted successfully");
                    resolve();
                }
            });
        });

        console.log("All unzip operations completed successfully");
    } catch (error) {
        console.error("Error in unzipFile:", error);
        throw error;
    }
}

module.exports = unzipFile;
