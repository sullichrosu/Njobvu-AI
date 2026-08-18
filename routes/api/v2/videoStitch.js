const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const queries = require("../../../queries/queries");

const MIN_FRAMES = 2;
const MAX_FRAMES = 12;
const ALLOWED_LAYOUTS = new Set(["horizontal", "vertical", "grid"]);
const DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/;

function isOwner(req, admin) {
    return req.cookies && req.cookies.Username === admin;
}

function getProjectPath(admin, projectName) {
    return path.join(currentPath, "public", "projects", `${admin}-${projectName}`);
}

function decodeFrame(dataUrl) {
    const match = typeof dataUrl === "string" && dataUrl.match(DATA_URL_PATTERN);
    return match ? Buffer.from(match[2], "base64") : null;
}

function sanitizeStitchFileName(name) {
    if (!name || typeof name !== "string") return null;
    const base = name.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
    return base ? (base.toLowerCase().endsWith(".png") ? base : `${base}.png`) : null;
}

// Lays frame buffers out side by side (horizontal/vertical) or in a square-ish
// grid, resizing each frame to a shared dimension so the seams line up.
async function buildStitchLayout(buffers, layout) {
    const metas = await Promise.all(buffers.map((buf) => sharp(buf).metadata()));

    if (layout === "vertical") {
        const width = Math.max(...metas.map((m) => m.width));
        const resized = await Promise.all(buffers.map((buf) => sharp(buf).resize({ width }).toBuffer()));
        const resizedMetas = await Promise.all(resized.map((buf) => sharp(buf).metadata()));

        let top = 0;
        const composite = resized.map((input, i) => {
            const entry = { input, top, left: 0 };
            top += resizedMetas[i].height;
            return entry;
        });

        return { width, height: top, composite };
    }

    if (layout === "grid") {
        const columns = Math.ceil(Math.sqrt(buffers.length));
        const rows = Math.ceil(buffers.length / columns);
        const cellWidth = Math.max(...metas.map((m) => m.width));
        const cellHeight = Math.max(...metas.map((m) => m.height));

        const resized = await Promise.all(
            buffers.map((buf) =>
                sharp(buf)
                    .resize({
                        width: cellWidth,
                        height: cellHeight,
                        fit: "contain",
                        background: { r: 0, g: 0, b: 0, alpha: 1 },
                    })
                    .toBuffer(),
            ),
        );

        const composite = resized.map((input, i) => ({
            input,
            left: (i % columns) * cellWidth,
            top: Math.floor(i / columns) * cellHeight,
        }));

        return { width: cellWidth * columns, height: cellHeight * rows, composite };
    }

    // default: horizontal
    const height = Math.max(...metas.map((m) => m.height));
    const resized = await Promise.all(buffers.map((buf) => sharp(buf).resize({ height }).toBuffer()));
    const resizedMetas = await Promise.all(resized.map((buf) => sharp(buf).metadata()));

    let left = 0;
    const composite = resized.map((input, i) => {
        const entry = { input, top: 0, left };
        left += resizedMetas[i].width;
        return entry;
    });

    return { width: left, height, composite };
}

async function stitchFrames(req, res) {
    const { admin, projectName } = req.params;
    const { frames, layout = "horizontal", fileName } = req.body || {};

    if (!isOwner(req, admin)) {
        return res.status(403).json({ success: false, error: "Not authorized for this project" });
    }

    if (!Array.isArray(frames) || frames.length < MIN_FRAMES) {
        return res.status(400).json({ success: false, error: `Select at least ${MIN_FRAMES} frames to stitch` });
    }

    if (frames.length > MAX_FRAMES) {
        return res.status(400).json({ success: false, error: `Select at most ${MAX_FRAMES} frames to stitch` });
    }

    if (!ALLOWED_LAYOUTS.has(layout)) {
        return res.status(400).json({
            success: false,
            error: `layout must be one of: ${[...ALLOWED_LAYOUTS].join(", ")}`,
        });
    }

    const projectPath = getProjectPath(admin, projectName);
    const imagesPath = path.join(projectPath, "images");

    if (!fs.existsSync(imagesPath)) {
        return res.status(404).json({ success: false, error: "Project not found" });
    }

    const buffers = frames.map((frame) => decodeFrame(frame && frame.dataUrl));
    if (buffers.some((buf) => !buf)) {
        return res.status(400).json({
            success: false,
            error: "Each frame needs a valid image data URL (png/jpeg/webp)",
        });
    }

    try {
        const { width, height, composite } = await buildStitchLayout(buffers, layout);
        const outFileName = sanitizeStitchFileName(fileName) || `stitch-${Date.now()}.png`;
        const outPath = path.join(imagesPath, outFileName);

        await sharp({
            create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        })
            .composite(composite)
            .png()
            .toFile(outPath);

        await queries.project.addImages(projectPath, outFileName, 0, 0);

        return res.status(200).json({
            success: true,
            fileName: outFileName,
            width,
            height,
            frameCount: buffers.length,
        });
    } catch (err) {
        global.logger.error(err);
        return res.status(500).json({ success: false, error: "Error stitching frames" });
    }
}

module.exports = { stitchFrames };
