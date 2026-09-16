const path = require("path");
const fs = require("fs");

const IMAGE_EXTENSIONS = new Set([
    ".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".gif", ".webp"
]);

const JUNK_FILES = new Set([
    ".DS_Store", "._.DS_Store", "Thumbs.db", "desktop.ini", "blob"
]);

/**
 * Recursively flattens subdirectories in `directory`.
 * All valid image files found in subdirectories are moved to the root of `directory`.
 * System junk and macOS metadata files are removed.
 * Filenames are sanitized (trimmed, spaces & '+' replaced with '_').
 * Filename collisions are resolved by prepending relative directory names or numeric suffixes.
 * Empty subdirectories are removed.
 * Returns an array of relative image filenames located in root of `directory`.
 */
async function flattenDirectory(directory) {
    if (!directory || !fs.existsSync(directory)) {
        return [];
    }

    // Helper to recursively collect all file paths
    async function getFilesRecursively(dir) {
        let results = [];
        try {
            const list = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of list) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === "__MACOSX" || entry.name.startsWith("._")) {
                        await fs.promises.rm(fullPath, { recursive: true, force: true }).catch(() => {});
                    } else {
                        const subFiles = await getFilesRecursively(fullPath);
                        results = results.concat(subFiles);
                    }
                } else if (entry.isFile()) {
                    results.push(fullPath);
                }
            }
        } catch (err) {
            // Ignore errors reading missing dirs
        }
        return results;
    }

    const allFiles = await getFilesRecursively(directory);

    for (const filePath of allFiles) {
        const fileName = path.basename(filePath);
        const relPath = path.relative(directory, filePath);
        const ext = path.extname(fileName).toLowerCase();

        // Remove junk files, hidden system files, or archive files inside the target dir
        if (
            JUNK_FILES.has(fileName) ||
            fileName.startsWith("._") ||
            ext === ".zip" ||
            ext === ".7z"
        ) {
            await fs.promises.unlink(filePath).catch(() => {});
            continue;
        }

        const isImage = IMAGE_EXTENSIONS.has(ext);
        if (!isImage) {
            // If it's a non-image file inside a subdirectory, remove it
            if (relPath !== fileName) {
                await fs.promises.unlink(filePath).catch(() => {});
            }
            continue;
        }

        // Clean filename: remove leading/trailing spaces and replace spaces and '+' with '_'
        let cleanName = fileName.trim().replace(/[ +]/g, "_");

        const targetPath = path.join(directory, cleanName);

        if (filePath === targetPath) {
            // File is already in directory root with clean name
            continue;
        }

        // Handle filename collisions if target file already exists and is a different file
        let finalTargetName = cleanName;
        let finalTargetPath = targetPath;

        if (fs.existsSync(finalTargetPath) && finalTargetPath !== filePath) {
            const relDir = path.dirname(relPath).replace(/[\\/ +]/g, "_").trim();
            const extName = path.extname(cleanName);
            const baseName = path.basename(cleanName, extName);
            finalTargetName = `${relDir}_${baseName}${extName}`;
            finalTargetPath = path.join(directory, finalTargetName);

            let counter = 1;
            while (fs.existsSync(finalTargetPath) && finalTargetPath !== filePath) {
                finalTargetName = `${relDir}_${baseName}_${counter}${extName}`;
                finalTargetPath = path.join(directory, finalTargetName);
                counter++;
            }
        }

        await fs.promises.rename(filePath, finalTargetPath).catch(() => {});
    }

    // Clean up empty subdirectories
    async function removeEmptyDirs(dir) {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const subDir = path.join(dir, entry.name);
                    await removeEmptyDirs(subDir);
                    const subEntries = await fs.promises.readdir(subDir).catch(() => []);
                    if (subEntries.length === 0) {
                        await fs.promises.rmdir(subDir).catch(() => {});
                    }
                }
            }
        } catch (err) {}
    }

    await removeEmptyDirs(directory);

    // Return list of image files in root directory
    let rootEntries = [];
    try {
        rootEntries = await fs.promises.readdir(directory);
    } catch (err) {
        return [];
    }

    const resultFiles = [];
    for (const entry of rootEntries) {
        const full = path.join(directory, entry);
        const stat = await fs.promises.stat(full).catch(() => null);
        if (stat && stat.isFile()) {
            const ext = path.extname(entry).toLowerCase();
            if (IMAGE_EXTENSIONS.has(ext)) {
                resultFiles.push(entry);
            }
        }
    }

    return resultFiles;
}

module.exports = flattenDirectory;
