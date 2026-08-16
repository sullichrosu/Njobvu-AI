const path = require("path");
const cleanDirectory = require("./cleanDirectory");
const { spawn } = require("child_process");
const fs = require("fs");
const rimraf = require("../public/libraries/rimraf");
const configFile = require("../config.json");
const StreamZip = require("node-stream-zip");
const logger = global.logger || require("./logger");

async function unzipFile(zipFilePath, outputDir) {
    return new Promise(async (resolve, reject) => {
        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const extension = zipFilePath.split(".").at(-1).toLowerCase();

            switch (extension) {
                case "zip": {
                    const zip = new StreamZip.async({ file: zipFilePath });
                    await zip.extract(null, outputDir);
                    await zip.close();

                    await finalizeExtraction();
                    resolve();
                    break;
                }

                case "7z": {
                    const absoluteOutputDir = path.resolve(outputDir);

                    (global.logger || logger).debug(`Extracting ${zipFilePath} to ${absoluteOutputDir}`);

                    if (!fs.existsSync(absoluteOutputDir)) {
                        fs.mkdirSync(absoluteOutputDir, { recursive: true });
                    }

                    const args = ['x', zipFilePath, `-o${absoluteOutputDir}`, '-y'];
                    const child = spawn(configFile["default_7z_path"] || "/usr/bin/7z", args);

                    let stderr = '';
                    child.stderr.on('data', (data) => { stderr += data; });

                    child.on('close', async (code) => {
                        try {
                            if (code === 0) {
                                (global.logger || logger).debug("7zip archive successfully extracted");
                                await finalizeExtraction();
                                resolve();
                            } else {
                                (global.logger || logger).debug(`7z process failed with code: ${code}`);
                                (global.logger || logger).debug(`Stderr: ${stderr}`);
                                reject(new Error("There was an error extracting the 7zip archive"));
                            }
                        } catch (err) {
                            reject(err);
                        }
                    });
                    break;
                }

                default:
                    reject(new Error("There was a problem processing the archive: unsupported file extension"));
                    break;
            }
        } catch (err) {
            reject(err);
        }

        async function finalizeExtraction() {
            const macosxPath = path.join(outputDir, "__MACOSX");
            if (fs.existsSync(macosxPath)) {
                await new Promise((res) => rimraf(macosxPath, res));
            }

            await cleanDirectory(outputDir);

            if (fs.existsSync(zipFilePath)) {
                fs.unlinkSync(zipFilePath);
                (global.logger || logger).debug("Zip file deleted successfully");
            }
        }
    });
}

module.exports = unzipFile;