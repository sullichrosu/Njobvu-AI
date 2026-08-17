const path = require("path");
const fs = require("fs");

async function cleanDirectory(directory) {
    try {
        const files = await fs.promises.readdir(directory);

        for (const file of files) {
            const filePath = path.join(directory, file);
            const stats = await fs.promises.stat(filePath);

            // Process subdirectories
            if (stats.isDirectory()) {
                if (file === "__MACOSX") continue;

                // Clean subdirectory name first
                if (
                    file !== file.trim() ||
                    file.includes(" ") ||
                    file.includes("+")
                ) {
                    const newDirName = file.trim().replace(/[ +]/g, "_");
                    const newDirPath = path.join(directory, newDirName);
                    await fs.promises.rename(filePath, newDirPath);
                    await cleanDirectory(newDirPath);
                } else {
                    await cleanDirectory(filePath);
                }
                continue;
            }

            if (
                file === ".DS_Store" ||
                file === "._.DS_Store" ||
                file.startsWith("._") ||
                file === "Thumbs.db" ||
                file === "desktop.ini"
            ) {
                await fs.promises.unlink(filePath);
                //   console.log(`Removed system file: ${filePath}`);
                continue;
            }

            // Clean filename: Remove trailing/leading spaces and replace spaces and + with _
            if (
                file !== file.trim() ||
                file.includes(" ") ||
                file.includes("+")
            ) {
                const newFileName = file.trim().replace(/[ +]/g, "_");
                const newFilePath = path.join(directory, newFileName);

                await fs.promises.rename(filePath, newFilePath);
            }
        }

        //   console.log(`Directory cleaned: ${directory}`);
        return directory;
    } catch (error) {
        console.error(`Error cleaning directory ${directory}:`, error);
        throw error;
    }
}

module.exports = cleanDirectory;
