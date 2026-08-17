const queries = require("../../queries/queries");
const express = require("express");
const fs = require("fs");
const path = require("path");

function getImagesForRun(runPath) {
    const imageExtensions = new Set([
        ".jpg", ".jpeg", ".png", ".gif",
        ".webp", ".bmp", ".tiff", ".tif",
        ".svg", ".avif"
    ]);

    const results = [];

    function collect(dir) {
        if (!fs.existsSync(dir)) {
            return;
        }

        for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            const stat = fs.statSync(full);

            if (!stat.isFile()) {
                continue;
            }

            const ext = path.extname(file).toLowerCase();

            if (!imageExtensions.has(ext)) {
                continue;
            }

            results.push(path.relative(runPath, full).replace(/\\/g, "/"));
        }
    }

    // older output formats still have images in the root directory
    // but new runs have their images moved into the `images/` directory. 
    // such, we collect both
    collect(runPath);
    collect(path.join(runPath, "images"));

    return results;
}

/**
 * @param {Request} req the request
 * @param {Response} res the response
*/
async function getRunImages(req, res) {
    try {
        const { Admin, PName } = req.query;
        const runId = req.params.runId;

        if (!Admin || !PName || !runId) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const safeRegex = /^[a-zA-Z0-9._-]+$/; // prevent path escapes

        if (
            !safeRegex.test(Admin) ||
            !safeRegex.test(PName) ||
            !safeRegex.test(runId)
        ) {
            return res.status(400).json({ error: "Invalid identifier" });
        }

        const baseProjectsPath = path.join(process.cwd(), "public", "projects");

        const projectPath = path.join(
            baseProjectsPath,
            `${Admin}-${PName}`
        );

        const runPath = path.join(
            projectPath,
            "inference",
            "logs",
            runId
        );

        // ensure path does not escape logs folder
        const normalizedRunPath = path.normalize(runPath);

        const normalizedBase = path.normalize(
            path.join(projectPath, "inference", "logs")
        );

        if (!normalizedRunPath.startsWith(normalizedBase)) {
            return res.status(400).json({ error: "Invalid path" });
        }

        if (!fs.existsSync(normalizedRunPath)) {
            return res.status(404).json({ error: "Run not found" });
        }

        const images = getImagesForRun(runPath);

        return res.status(200).send({ images });
    } catch (error) {
        global.logger.error(err);
        return res.status(500).send("Error fetching run images");
    }
}

module.exports = getRunImages;
