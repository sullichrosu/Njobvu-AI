const path = require("path");
const fs = require("fs");
const probe = require("probe-image-size");
const queries = require("../../queries/queries");
const { buildS3Client, getObjectStream } = require("../../utils/s3Client");

async function getAnnotatePage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const IName = String(req.query.IName || "");
    let currClass = req.query.curr_class;
    const reviewFilter = req.query.reviewFilter || req.query.review || "all";
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        idx = 0;
        return res.redirect("/home");
    }

    if (user === undefined) {
        return res.redirect("/");
    }

    let projects, PName, admin, projectDir, relProjectPath, classNames;

    try {
        ({ rows: projects } = await queries.managed.getUserProjects(user));

        if (idx < 0 || idx >= projects.length) {
            return res.redirect("/home");
        }

        ({ PName, Admin: admin } = projects[idx]);

        const publicPath = typeof currentPath !== "undefined" ? currentPath : process.cwd();

        projectDir = path.join(publicPath, "public", "projects", `${admin}-${PName}`);
        relProjectPath = `projects/${admin}-${PName}`;

        const { rows: classRows } = await queries.project.getAllClasses(projectDir);

        classNames = classRows.map((c) => c.CName);
    } catch (err) {
        global.logger.error("Error loading annotate page:", err);

        return res.redirect(`/error?error=${encodeURIComponent(err.message)}`);
    }

    let allImages = [];
    try {
        const imgRes = await queries.project.getAllImages(projectDir);

        allImages = (imgRes && imgRes.rows) ? imgRes.rows : [];
    } catch (err) {
        global.logger.error("Error fetching images for annotate page:", err);
    }

    // Nav (prev/next scrolling + the "x/y" counter) walks navImages, which is
    // allImages filtered by reviewFilter - not the full unfiltered project.
    // Positions come from this array directly rather than a global rowid, so
    // a filter that shrinks the set can never index past its own bounds.
    let navImages = allImages;
    if (reviewFilter === "true" || reviewFilter === "1") {
        navImages = allImages.filter((img) => Number(img.reviewImage) !== 0);
    } else if (reviewFilter === "false" || reviewFilter === "0") {
        navImages = allImages.filter((img) => Number(img.reviewImage) === 0);
    }

    let labels = [];
    try {
        const labelRes = await queries.project.getLabelsForImageName(projectDir, IName);

        labels = (labelRes && labelRes.rows) ? labelRes.rows : [];
    } catch (err) {
        global.logger.error("Error querying image labels:", err);
    }

    let imageRecord = null;
    try {
        const imgDetailRes = await queries.project.getImage(projectDir, IName);

        imageRecord = (imgDetailRes && imgDetailRes.row) ? imgDetailRes.row : null;
    } catch (err) {
        global.logger.error("Error querying image record:", err);
    }

    let projRecord = null;
    try {
        const projRes = await queries.managed.sql(
            "SELECT AutoSave FROM Projects WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );

        projRecord = (projRes.rows && projRes.rows.length > 0) ? projRes.rows[0] : (projRes.row || null);
    } catch (err) {
        global.logger.error("Error querying project record:", err);
    }

    let accessUsers = [];
    try {
        const accRes = await queries.managed.sql(
            "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
            [PName, admin]
        );

        accessUsers = (accRes.rows || []).map((r) => r.Username);
    } catch (err) {
        global.logger.error("Error querying project access list:", err);
    }

    if (!currClass && classNames.length > 0) {
        currClass = classNames[0];
    }

    const fsObj = global.fs || fs;
    const probeObj = global.probe || probe;
    const absImagePath = path.join(projectDir, "images", IName);

    if (!imageRecord) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    let relImagePath;
    let imgData;
    try {
        if (fsObj.existsSync(absImagePath)) {
            const imgBuffer = fsObj.readFileSync(absImagePath);
            imgData = probeObj.sync(imgBuffer);
            relImagePath = `${relProjectPath}/images/${imageRecord.IName}`;
        } else if (imageRecord.Source === "s3" && imageRecord.SourceKey) {
            const bucketRes = await queries.managed.getBucket(PName, admin);
            const bucket = bucketRes && bucketRes.row;

            if (!bucket) {
                throw new Error("No bucket attached");
            }

            const s3Client = buildS3Client({
                region: bucket.Region,
                accessKeyId: bucket.AccessKeyId,
                secretAccessKey: bucket.SecretAccessKey,
                endpoint: bucket.Endpoint,
            });
            const { body } = await getObjectStream(
                s3Client,
                bucket.BucketName,
                imageRecord.SourceKey,
            );

            const imageBytes = await new Promise((resolve, reject) => {
                if (!body) {
                    return reject(new Error("Empty S3 response"));
                }
                if (Buffer.isBuffer(body)) {
                    return resolve(body);
                }
                if (typeof body === "string") {
                    return resolve(Buffer.from(body));
                }
                if (typeof body[Symbol.asyncIterator] !== "function" && typeof body.on !== "function") {
                    return resolve(Buffer.from(body));
                }

                const chunks = [];
                body.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                body.on("end", () => resolve(Buffer.concat(chunks)));
                body.on("error", reject);
            });

            imgData = await probeObj(imageBytes);
            relImagePath = `api/v2/projects/${admin}/${PName}/images/${imageRecord.IName}`;
        } else {
            throw new Error("Image not found");
        }
    } catch (err) {
        return res.render("404", {
            title: "404",
            user: req.cookies ? req.cookies.Username : undefined,
        });
    }

    const imgWidth = imgData.width;
    const imgHeight = imgData.height;
    const imageRatio = imgHeight / imgWidth;
    const imageDisplayWidth = imgWidth;
    const imageDisplayHeight = imageRatio * imageDisplayWidth;

    const requestedIndex = navImages.findIndex((img) => img.IName === IName);
    const currIndex = requestedIndex === -1 ? 1 : requestedIndex + 1;
    const prevIName = requestedIndex > 0 ? navImages[requestedIndex - 1].IName : -1;
    const nextIName = requestedIndex !== -1 && requestedIndex < navImages.length - 1
        ? navImages[requestedIndex + 1].IName
        : -1;

    const colors = [];
    let colorIdx = 0;
    const colorList = global.colorsJSON || [];

    while (colors.length < classNames.length) {
        if (colorIdx >= colorList.length) {
            colorIdx = 0;
        }

        colors.push(colorList[colorIdx]);
        colorIdx++;
    }

    res.render("annotate", {
        title: "annotate",
        user,
        access: accessUsers,
        image_width: imageDisplayWidth,
        image_height: imageDisplayHeight,
        image_path: relImagePath,
        image_name: imageRecord.IName,
        image_ratio: imageRatio,
        classes: classNames,
        images: navImages,
        labels: labels || [],
        colors,
        IName,
        prev_IName: prevIName,
        next_IName: nextIName,
        PName,
        Admin: admin,
        IDX: idx,
        images_length: navImages.length,
        curr_index: currIndex,
        curr_class: currClass,
        rev_image: imageRecord.reviewImage,
        list_counter: [],
        AutoSave: projRecord ? projRecord.AutoSave : 0,
        logged: req.query.logged,
        reviewFilter,
        activePage: "project",
    });
}

module.exports = getAnnotatePage;
