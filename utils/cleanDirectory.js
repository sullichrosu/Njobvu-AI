const path = require("path");
const fs = require("fs");
const flattenDirectory = require("./flattenDirectory");

async function cleanDirectory(directory) {
    try {
        await flattenDirectory(directory);
        return directory;
    } catch (error) {
        console.error(`Error cleaning directory ${directory}:`, error);
        throw error;
    }
}

module.exports = cleanDirectory;
