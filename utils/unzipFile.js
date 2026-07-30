const cleanDirectory = require("./cleanDirectory");
const { spawn } = require("child_process");
const fs = require("fs");
const rimraf = require("../public/libraries/rimraf");
const configFile = require("../config.json");
const StreamZip = require("node-stream-zip");

async function unzipFile(zipFilePath, outputDir) {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        switch (zipFilePath.split(".").at(-1)) {
            case "zip":
                const zip = new StreamZip.async({ file: zipFilePath });
                await zip.extract(null, outputDir);
                await zip.close();

                await finalizeExtraction();

                break;

            case "7z":
                const absoluteOutputDir = path.resolve(outputDir);

                global.logger.debug(`Extracting ${zipFilePath} to ${absoluteOutputDir}`);

                if (!fs.existsSync(absoluteOutputDir)) {
                    global.logger.error("DEBUG: Directory still does not exist before spawn!");
                }

                const args = ['x', zipFilePath, `-o${absoluteOutputDir}`, '-y'];

                const child = spawn(configFile["default_7z_path"] || "/usr/bin/7z", args);

                let stderr = '';
                child.stderr.on('data', (data) => { stderr += data });

                child.on('close', async (code) => {
                    if (code == 0) {
                        global.logger.debug("7zip archive successfully extracted");
                        await finalizeExtraction();
                        resolve();
                    } else {
                        global.logger.debug(`7z process failed with code: ${code}`);
                        global.logger.debug(`Stderr: ${stderr}`);

                        reject("There was an error extracting the 7zip archive");
                    }
                })

                break;

            default:
                reject("There was a problem processing the archive");

                break;
        }

        async function finalizeExtraction() {
            const macosxPath = path.join(outputDir, "__MACOSX");
            if (fs.existsSync(macosxPath)) {
                await new Promise((res) => rimraf(macosxPath, res));
            }

            await cleanDirectory(outputDir);

            if (fs.existsSync(zipFilePath)) {
                fs.unlinkSync(zipFilePath);
                global.logger.debug("Zip file deleted successfully");
            }
        }
    });
}

module.exports = unzipFile;
