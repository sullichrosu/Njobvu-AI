const fs = require("fs");
const path = require("path");
const queries = require("../../../queries/queries");

const AUTHOR_TYPES = new Set(["user", "model"]);

function getProjectPath(admin, projectName) {
    const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();
    return path.join(publicPath, "public", "projects", `${admin}-${projectName}`);
}

async function hasProjectAccess(username, admin, projectName) {
    if (!username) return false;
    if (username === admin) return true;
    if (!(global.managedDbClient && global.managedDbClient.all)) return false;

    const result = await global.managedDbClient.all(
        "SELECT * FROM Access WHERE Username = ? AND PName = ? AND Admin = ?",
        [username, projectName, admin],
    );
    const rows = (result && result.rows) || [];

    return rows.length > 0;
}

function fail(res, status, code, message) {
    return res.status(status).json({ success: false, code, message });
}

function errorMessage(err, fallback) {
    return err?.message || err?.error?.message || fallback;
}

function toNumber(value, fieldName) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
        throw new Error(`Field "${fieldName}" must be a number.`);
    }
    return num;
}

// A label is unchanged only if every stored field matches the incoming one;
// any difference (including just a reclassification) counts as an edit.
function labelFieldsEqual(existing, incoming) {
    return (
        String(existing.CName) === String(incoming.className) &&
        Number(existing.X) === incoming.x &&
        Number(existing.Y) === incoming.y &&
        Number(existing.W) === incoming.w &&
        Number(existing.H) === incoming.h
    );
}

function parseIncomingLabels(rawLabels) {
    return rawLabels.map((label, index) => {
        if (!label || !label.className) {
            throw new Error(`Label at index ${index} is missing className.`);
        }
        return {
            lid: label.lid != null && label.lid !== "" ? Number(label.lid) : null,
            className: String(label.className),
            x: toNumber(label.x, "x"),
            y: toNumber(label.y, "y"),
            w: toNumber(label.w, "w"),
            h: toNumber(label.h, "h"),
        };
    });
}

/**
 * POST /api/v2/projects/:admin/:projectName/images/:imageName/labels
 *
 * Strangler-fig v2 replacement for saving an image's annotations that adds
 * author tracking. The legacy /updateLabels handler deletes and recreates
 * every label for the image on each save, which loses label identity and
 * makes "did a human actually touch this annotation" unanswerable. This
 * route instead matches incoming annotations to existing ones by LID, so
 * only labels whose class or geometry actually changed have their author
 * bumped; annotations that are re-saved unchanged keep their original
 * author. authorType covers both `user` and bootstrapped `model` authors.
 */
async function saveImageLabels(req, res) {
    try {
        const { admin, projectName, imageName } = req.params;
        const username = req.cookies?.Username;
        const authorId = req.body.authorId || username;
        const authorType = AUTHOR_TYPES.has(req.body.authorType) ? req.body.authorType : "user";
        const rawLabels = Array.isArray(req.body.labels) ? req.body.labels : [];

        if (!(await hasProjectAccess(username, admin, projectName))) {
            return fail(res, 403, "FORBIDDEN", "You do not have access to this project.");
        }
        if (!authorId) {
            return fail(res, 400, "MISSING_AUTHOR", "An author id is required.");
        }

        const projectPath = getProjectPath(admin, projectName);
        if (!fs.existsSync(projectPath)) {
            return fail(res, 404, "PROJECT_NOT_FOUND", `Project path not found: ${admin}-${projectName}`);
        }

        let incoming;
        try {
            incoming = parseIncomingLabels(rawLabels);
        } catch (err) {
            return fail(res, 400, "INVALID_LABEL", err.message);
        }

        await queries.project.migrateProjectDb(projectPath);

        const existingRows = (await queries.project.getLabelsForImageName(projectPath, imageName))?.rows || [];
        const existingByLid = new Map(existingRows.map((row) => [Number(row.LID), row]));
        const incomingLids = new Set(incoming.filter((label) => label.lid != null).map((label) => label.lid));

        const maxLidRows = (await queries.project.getMaxLabelId(projectPath))?.rows || [];
        let nextLid = maxLidRows.length > 0 && maxLidRows[0].LID ? maxLidRows[0].LID + 1 : 1;

        const summary = { created: 0, updated: 0, unchanged: 0, deleted: 0 };
        const savedLabels = [];

        for (const label of incoming) {
            const existing = label.lid != null ? existingByLid.get(label.lid) : undefined;

            if (existing) {
                if (labelFieldsEqual(existing, label)) {
                    summary.unchanged++;
                    savedLabels.push({
                        lid: label.lid,
                        className: label.className,
                        x: label.x,
                        y: label.y,
                        w: label.w,
                        h: label.h,
                        authorId: existing.AuthorId,
                        authorType: existing.AuthorType,
                    });
                    continue;
                }

                await queries.project.updateLabelFieldsAndAuthor(projectPath, label.lid, {
                    className: label.className,
                    x: label.x,
                    y: label.y,
                    w: label.w,
                    h: label.h,
                    authorId,
                    authorType,
                });
                summary.updated++;
                savedLabels.push({ ...label, lid: label.lid, authorId, authorType });
                continue;
            }

            const lid = nextLid++;
            await queries.project.createLabelWithAuthor(projectPath, {
                lid,
                className: label.className,
                x: label.x,
                y: label.y,
                w: label.w,
                h: label.h,
                imageName,
                authorId,
                authorType,
            });
            summary.created++;
            savedLabels.push({ ...label, lid, authorId, authorType });
        }

        for (const existing of existingRows) {
            const lid = Number(existing.LID);
            if (!incomingLids.has(lid)) {
                await queries.project.deleteLabelById(projectPath, lid);
                summary.deleted++;
            }
        }

        return res.status(200).json({ success: true, ...summary, labels: savedLabels });
    } catch (err) {
        global.logger.error(err);
        return fail(res, 500, "INTERNAL_ERROR", errorMessage(err, "Internal server error saving labels."));
    }
}

module.exports = { saveImageLabels };
