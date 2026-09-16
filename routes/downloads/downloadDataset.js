const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const queries = require("../../queries/queries");
const { buildS3Client, getObjectStream } = require("../../utils/s3Client");

// Buffers a Readable fully into memory - only used for the S3-streamed image
// case below, one image at a time, never for a whole batch (see readExportImage).
function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

// Resolves image bytes for export, mirroring how routes/api/v2/s3Buckets.js#getProjectImage
// serves a single image: a locally-present file (local import, or "download"-mode S3
// sync - the common case) is read straight from disk; an image registered from S3 but
// never materialized locally ("stream" mode) is fetched from the bucket live, for this
// export only, and buffered in memory just long enough to be probed/zipped. s3BucketCache
// avoids re-fetching bucket credentials for every S3-streamed image in the dataset.
async function readExportImage(imagesPath, PName, admin, image, s3BucketCache) {
    const localPath = path.join(imagesPath, image.IName);

    if (fs.existsSync(localPath)) {
        return { buffer: fs.readFileSync(localPath), isLocal: true };
    }

    if (image.Source !== "s3" || !image.SourceKey) {
        throw new Error(
            `Image "${image.IName}" was not found locally and has no S3 source`,
        );
    }

    if (s3BucketCache.bucket === undefined) {
        const bucketResult = await queries.managed.getBucket(PName, admin);
        s3BucketCache.bucket = (bucketResult && bucketResult.row) || null;
        if (s3BucketCache.bucket) {
            s3BucketCache.client = buildS3Client({
                region: s3BucketCache.bucket.Region,
                accessKeyId: s3BucketCache.bucket.AccessKeyId,
                secretAccessKey: s3BucketCache.bucket.SecretAccessKey,
                endpoint: s3BucketCache.bucket.Endpoint,
            });
        }
    }

    if (!s3BucketCache.bucket) {
        throw new Error(
            `Image "${image.IName}" has no local file and no S3 bucket is attached to this project`,
        );
    }

    const { body } = await getObjectStream(
        s3BucketCache.client,
        s3BucketCache.bucket.BucketName,
        image.SourceKey,
    );

    return { buffer: await streamToBuffer(body), isLocal: false };
}

async function downloadDataset(req, res) {
    var PName = req.body.PName,
        admin = req.body.Admin,
        IDX = parseInt(req.body.IDX),
        user = req.cookies.Username;

    var publicPath = currentPath,
        mainPath = path.join(publicPath, "public", "projects"), // $LABELING_TOOL_PATH/public/projects/
        projectPath = path.join(mainPath, admin + "-" + PName), // $LABELING_TOOL_PATH/public/projects/project_name
        mergePath = path.join(projectPath, "merge"),
        mergeImages = path.join(mergePath, "images"),
        imagesPath = path.join(projectPath, "images"), // $LABELING_TOOL_PATH/public/projects/project_name/images
        downloadsPath = path.join(mainPath, user + "_Downloads");
    bootstrapPath = path.join(projectPath, "bootstrap");

    if (!fs.existsSync(downloadsPath)) {
        fs.mkdirSync(downloadsPath);
    }

    var downloadFormat = parseInt(req.body.download_format);

    var cnames = [];

    let existingClasses;
    let existingImages;

    try {
        existingClasses = await queries.project.getAllClasses(projectPath);
        existingImages = await queries.project.getAllImages(projectPath);
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error fetching existing resources");
    }

    for (var i = 0; i < existingClasses.rows.length; i++) {
        cnames.push(existingClasses.rows[i].CName);
    }

    if (downloadFormat == 6) {
        const cropImage = async (
            sourcePath,
            targetPath,
            x,
            y,
            width,
            height,
        ) => {
            try {
                const cropOptions = {
                    left: Math.floor(x), // Ensure x is an integer
                    top: Math.floor(y), // Ensure y is an integer
                    width: Math.floor(width), // Ensure width is an integer
                    height: Math.floor(height), // Ensure height is an integer
                };
                await sharp(sourcePath)
                    .extract(cropOptions) // Crop with x, y, w, h
                    .toFile(targetPath); // Save to the target path

                global.logger.debug(`Image cropped successfully: ${targetPath}`);
            } catch (err) {
                global.logger.error(`error cropping image: ${err.message}`);
            }
        };

        folderName = downloadsPath + "/dataset";
        folderTrain = folderName + "/train";
        folderVal = folderName + "/val";

        try {
            if (!fs.existsSync(folderName)) {
                fs.mkdirSync(folderName);
            }

            if (!fs.existsSync(folderTrain)) {
                fs.mkdirSync(folderTrain);
            }

            if (!fs.existsSync(folderVal)) {
                fs.mkdirSync(folderVal);
            }
        } catch (err) {
            global.logger.error(err);
        }

        let imageClassMapping;

        try {
            imageClassMapping =
                await queries.project.getImageClassMapping(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Error getting image class mapping");
        }

        const processedImages = {};
        const croppingPromises = [];

        imageClassMapping.rows.forEach((indivdualClass) => {
            classFolderTrain = folderTrain + "/" + indivdualClass.CName;
            classFolderVal = folderVal + "/" + indivdualClass.CName;

            try {
                if (!fs.existsSync(classFolderTrain)) {
                    fs.mkdirSync(classFolderTrain);
                }
            } catch (err) {
                global.logger.error(err);
            }
            try {
                if (!fs.existsSync(classFolderVal)) {
                    fs.mkdirSync(classFolderVal);
                }
            } catch (err) {
                global.logger.error(err);
            }

            const isValidation = Math.random() < 0.2;
            let targetFolder = isValidation ? classFolderVal : classFolderTrain;
            let sourceImagePath = imagesPath + "/" + indivdualClass.IName;

            if (!processedImages[indivdualClass.IName]) {
                processedImages[indivdualClass.IName] = 0;
            }

            processedImages[indivdualClass.IName]++;

            let targetImagePath =
                targetFolder +
                "/" +
                path.parse(indivdualClass.IName).name +
                "_crop" +
                processedImages[indivdualClass.IName] +
                path.extname(indivdualClass.IName);

            const x = indivdualClass.X;
            const y = indivdualClass.Y;
            const w = indivdualClass.W;
            const h = indivdualClass.H;

            croppingPromises.push(
                cropImage(
                    sourceImagePath,
                    targetImagePath,
                    indivdualClass.X,
                    indivdualClass.Y,
                    indivdualClass.W,
                    indivdualClass.H,
                ),
            );
        });

        await Promise.all(croppingPromises);

        const folderZip = downloadsPath + "/dataset.zip";
        const output = fs.createWriteStream(folderZip);

        const archive = archiver("zip", {
            zlib: { level: 9 },
        });

        output.on("close", () => {
            global.logger.debug(`${archive.pointer()} total bytes`);
            console.log(
                "archiver has been finalized and the output file descriptor has closed.",
            );
            dddb.close((err) => {
                if (err) {
                    global.logger.error(err);
                } else {
                }
            });
            res.download(folderZip, (err) => {
                if (err) {
                    global.logger.error("Error downloading the file:", err);
                } else {
                    fs.unlink(folderZip, (err) => {
                        if (err) {
                            global.logger.error("Error deleting the zip file:", err);
                        } else {
                        }
                    });

                    fs.rm(folderName, { recursive: true }, (err) => {
                        if (err) {
                            global.logger.error("Error deleting the folder:", err);
                        } else {
                        }
                    });
                }
            });
        });

        archive.on("warning", (err) => {
            if (err.code === "ENOENT") {
                console.warn(err);
            } else {
                throw err;
            }
        });

        archive.on("error", (err) => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(folderName, false);
        archive.finalize();
    }

    // YOLO
    if (downloadFormat == 0) {
        var dictImagesLabels = {};
        var skippedImages = [];
        var s3ImageBuffers = {};
        var s3BucketCache = {};
        for (var i = 0; i < existingImages.rows.length; i++) {
            let imgW, imgH;
            try {
                const { buffer, isLocal } = await readExportImage(
                    imagesPath,
                    PName,
                    admin,
                    existingImages.rows[i],
                    s3BucketCache,
                );
                const imgData = probe.sync(buffer);
                imgW = imgData.width;
                imgH = imgData.height;
                if (!isLocal) {
                    s3ImageBuffers[existingImages.rows[i].IName] = buffer;
                }
            } catch (err) {
                global.logger.error(err);
                skippedImages.push(existingImages.rows[i].IName);
                continue;
            }

            const imageLabels = await queries.project.getLabelsForImageName(
                projectPath,
                existingImages.rows[i].IName,
            );

            for (var j = 0; j < imageLabels.rows.length; j++) {
                // x, y, w, h
                var centerX =
                    (imageLabels.rows[j].X + imageLabels.rows[j].W / 2) / imgW;
                var centerY =
                    (imageLabels.rows[j].Y + imageLabels.rows[j].H / 2) / imgH;

                toStringValue =
                    cnames.indexOf(imageLabels.rows[j].CName) +
                    " " +
                    centerX +
                    " " +
                    centerY +
                    " " +
                    imageLabels.rows[j].W / imgW +
                    " " +
                    imageLabels.rows[j].H / imgH +
                    "\n";

                if (
                    dictImagesLabels[existingImages.rows[i].IName] == undefined
                ) {
                    dictImagesLabels[existingImages.rows[i].IName] =
                        toStringValue;
                } else {
                    dictImagesLabels[existingImages.rows[i].IName] +=
                        toStringValue;
                }
            }
            if (imageLabels.rows.length == 0) {
                dictImagesLabels[existingImages.rows[i].IName] = "";
            }
        }

        var output = fs.createWriteStream(`${downloadsPath}/yolo.zip`);
        var archive = archiver("zip");

        output.on("close", function () {
            res.download(`${downloadsPath}/yolo.zip`);
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);

        for (var key in dictImagesLabels) {
            removeDotExt = key.split(".")[0];
            fs.writeFileSync(
                `${downloadsPath}/${removeDotExt}.txt`,
                dictImagesLabels[key],
            );

            archive.file(`${downloadsPath}/${removeDotExt}.txt`, {
                name: removeDotExt + ".txt",
            });
        }

        var classes = "";
        for (var i = 0; i < existingClasses.rows.length; i++) {
            classes = classes + existingClasses.rows[i].CName + "\n";
        }

        classes = classes.substring(0, classes.length - 1);

        fs.writeFileSync(downloadsPath + "/" + PName + "_Classes.txt", classes);

        await archive.file(downloadsPath + "/" + PName + "_Classes.txt", {
            name: PName + "_Classes.txt",
        });

        if (skippedImages.length > 0) {
            archive.append(
                JSON.stringify({ skipped_images: skippedImages }, null, 2),
                { name: "skipped_images.json" },
            );
        }

        archive.directory(imagesPath, false);
        for (var imageName in s3ImageBuffers) {
            archive.append(s3ImageBuffers[imageName], { name: imageName });
        }
        archive.finalize();
    }

    // Tensorflow format
    else if (downloadFormat == 1) {
        let labels;
        try {
            labels = await queries.project.getAllLabels(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Could not fetch labels");
        }

        labels = labels.rows;

        var imageByName = {};
        for (var i = 0; i < existingImages.rows.length; i++) {
            imageByName[existingImages.rows[i].IName] = existingImages.rows[i];
        }
        var s3BucketCache = {};

        var xmin = 0;
        var xmax = 0;
        var ymin = 0;
        var ymax = 0;
        var data = "filename,width,height,class,xmin,ymin,xmax,ymax\n";

        for (var i = 0; i < labels.length; i++) {
            xmin = labels[i].X;
            xmax = xmin + labels[i].W;
            ymin = labels[i].Y;
            ymax = ymin + labels[i].H;

            var imgW, imgH;
            try {
                const { buffer } = await readExportImage(
                    imagesPath,
                    PName,
                    admin,
                    imageByName[labels[i].IName] || { IName: labels[i].IName },
                    s3BucketCache,
                );
                var imgData = probe.sync(buffer);
                imgW = imgData.width;
                imgH = imgData.height;
            } catch (err) {
                global.logger.error(err);
                continue;
            }

            data =
                data +
                labels[i].IName +
                "," +
                imgW +
                "," +
                imgH +
                "," +
                labels[i].CName +
                "," +
                xmin +
                "," +
                ymin +
                "," +
                xmax +
                "," +
                ymax +
                "\n";
        }

        fs.writeFileSync(downloadsPath + "/" + PName + "_dataset.csv", data);

        var output = fs.createWriteStream(downloadsPath + "/tensorflow.zip");

        var archive = archiver("zip");

        output.on("close", function () {
            res.download(downloadsPath + "/tensorflow.zip");
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);

        archive.file(downloadsPath + "/" + PName + "_dataset.csv", {
            name: PName + "_dataset.csv",
        });

        archive.finalize();
    }
    // COCO
    else if (downloadFormat == 2) {
        let labels;
        try {
            labels = await queries.project.getAllLabels(projectPath);
        } catch (err) {
            global.logger.error(err);
            return res.status(500).send("Could not fetch labels");
        }

        labels = labels.rows;

        let images = [];

        var xmin = 0;
        var xmax = 0;
        var ymin = 0;
        var ymax = 0;
        var rows = [];
        var imageNames = [];
        var skippedImages = [];
        var s3ImageBuffers = {};
        var s3BucketCache = {};

        for (var i = 0; i < labels.length; i++) {
            data = [];
            xmin = labels[i].X;
            xmax = xmin + labels[i].W;
            ymin = labels[i].Y;
            ymax = ymin + labels[i].Y;

            data.push(labels[i].IName);
            data.push(labels[i].CName);
            data.push(labels[i].W);
            data.push(labels[i].H);
            data.push(xmin);
            data.push(xmax);
            data.push(ymin);
            data.push(ymax);
            data.push(labels[i].LID);

            rows.push(data);
        }
        var coco = {};
        var categories = [];
        var annotations = [];

        function im(pic, id, buffer) {
            var image = {};
            var imgData = probe.sync(buffer);

            image["height"] = imgData.height;
            image["width"] = imgData.width;
            image["id"] = id;
            image["file_name"] = pic;
            return image;
        }

        function category(cname) {
            var cat = {};
            cat["supercategory"] = "None";
            cat["id"] = cnames.indexOf(cname);
            cat["name"] = cname;
            return cat;
        }

        function annotation(row) {
            var anno = {};
            var area = row[2] * row[3];
            anno["segmentation"] = [];
            anno["iscrowd"] = 0;
            anno["area"] = area;
            anno["image_id"] = imageNames.indexOf(row[0]);
            anno["bbox"] = [row[4], row[6], row[2], row[3]];
            anno["category_id"] = cnames.indexOf(row[1]);
            anno["id"] = row[8];

            return anno;
        }
        for (var i = 0; i < existingImages.rows.length; i++) {
            var imageRow = existingImages.rows[i];
            try {
                var { buffer, isLocal } = await readExportImage(
                    imagesPath,
                    PName,
                    admin,
                    imageRow,
                    s3BucketCache,
                );
                var id = imageNames.length;
                imageNames.push(imageRow.IName);
                images.push(im(imageRow.IName, id, buffer));
                if (!isLocal) {
                    s3ImageBuffers[imageRow.IName] = buffer;
                }
            } catch (err) {
                global.logger.error(err);
                skippedImages.push(imageRow.IName);
            }
        }
        for (var i = 0; i < rows.length; i++) {
            if (skippedImages.includes(rows[i][0])) continue;
            annotations.push(annotation(rows[i]));
        }
        for (var i = 0; i < cnames.length; i++) {
            categories.push(category(cnames[i]));
        }

        coco["images"] = images;
        coco["categories"] = categories;
        coco["annotations"] = annotations;
        if (skippedImages.length > 0) {
            coco["skipped_images"] = skippedImages;
        }

        var cocoData = JSON.stringify(coco);

        fs.writeFileSync(downloadsPath + "/" + PName + "_coco.json", cocoData);

        var output = fs.createWriteStream(downloadsPath + "/coco.zip");
        var archive = archiver("zip");

        output.on("close", function () {
            res.download(downloadsPath + "/coco.zip");
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);

        archive.file(downloadsPath + "/" + PName + "_coco.json", {
            name: PName + "_coco.json",
        });

        for (var i = 0; i < imageNames.length; i++) {
            var imageName = imageNames[i];
            if (s3ImageBuffers[imageName]) {
                archive.append(s3ImageBuffers[imageName], { name: imageName });
            } else {
                archive.file(
                    publicPath +
                        "/public/projects/" +
                        admin +
                        "-" +
                        PName +
                        "/images/" +
                        imageName,
                    { name: imageName },
                );
            }
        }

        archive.finalize();
    }
    // KitWare COCO
    else if (downloadFormat == 7) {
        let labels;
        try {
            labels = await queries.project.getAllLabels(projectPath);
        } catch (err) {
            console.error(err);
            return res.status(500).send("Could not fetch labels");
        }

        labels = labels.rows;

        let images = [];

        var xmin = 0;
        var xmax = 0;
        var ymin = 0;
        var ymax = 0;
        var rows = [];
        var imageNames = [];
        var skippedImages = [];
        var s3ImageBuffers = {};
        var s3BucketCache = {};

        for (var i = 0; i < labels.length; i++) {
            data = [];
            xmin = parseFloat(labels[i].X);
            xmax = xmin + parseFloat(labels[i].W);
            ymin = parseFloat(labels[i].Y);
            ymax = ymin + parseFloat(labels[i].H);

            data.push(labels[i].IName);
            data.push(labels[i].CName);
            data.push(parseFloat(labels[i].W));
            data.push(parseFloat(labels[i].H));
            data.push(xmin);
            data.push(xmax);
            data.push(ymin);
            data.push(ymax);
            data.push(labels[i].LID);

            rows.push(data);
        }
        var coco = {};
        var categories = [];
        var annotations = [];

        function im(pic, id, buffer) {
            var image = {};
            var imgData = probe.sync(buffer);

            image["height"] = imgData.height;
            image["width"] = imgData.width;
            image["id"] = id;
            image["file_name"] = pic;
            return image;
        }

        function category(cname) {
            var cat = {};
            cat["supercategory"] = "None";
            cat["id"] = cnames.indexOf(cname);
            cat["name"] = cname;
            return cat;
        }

        function annotation(row) {
            var anno = {};
            var area = row[2] * row[3];
            anno["segmentation"] = [];
            anno["iscrowd"] = 0;
            anno["area"] = area;
            anno["image_id"] = imageNames.indexOf(row[0]);
            anno["bbox"] = [row[4], row[6], row[2], row[3]];
            anno["category_id"] = cnames.indexOf(row[1]);
            anno["id"] = row[8];

            return anno;
        }
        for (var i = 0; i < existingImages.rows.length; i++) {
            var imageRow = existingImages.rows[i];
            try {
                var { buffer, isLocal } = await readExportImage(
                    imagesPath,
                    PName,
                    admin,
                    imageRow,
                    s3BucketCache,
                );
                var id = imageNames.length;
                imageNames.push(imageRow.IName);
                images.push(im(imageRow.IName, id, buffer));
                if (!isLocal) {
                    s3ImageBuffers[imageRow.IName] = buffer;
                }
            } catch (err) {
                global.logger.error(err);
                skippedImages.push(imageRow.IName);
            }
        }
        for (var i = 0; i < rows.length; i++) {
            if (skippedImages.includes(rows[i][0])) continue;
            annotations.push(annotation(rows[i]));
        }
        for (var i = 0; i < cnames.length; i++) {
            categories.push(category(cnames[i]));
        }

        coco["info"] = {
            "description": "KitWare COCO export of project " + PName,
            "version": "1.0",
            "date_created": new Date().toISOString()
        };
        coco["videos"] = [];
        coco["images"] = images;
        coco["categories"] = categories;
        coco["annotations"] = annotations;
        if (skippedImages.length > 0) {
            coco["skipped_images"] = skippedImages;
        }

        var cocoData = JSON.stringify(coco);

        fs.writeFileSync(downloadsPath + "/" + PName + "_kwcoco.json", cocoData);

        var output = fs.createWriteStream(downloadsPath + "/kwcoco.zip");
        var archive = archiver("zip");

        output.on("close", function () {
            res.download(downloadsPath + "/kwcoco.zip");
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);

        archive.file(downloadsPath + "/" + PName + "_kwcoco.json", {
            name: PName + "_kwcoco.json",
        });

        for (var i = 0; i < imageNames.length; i++) {
            var imageName = imageNames[i];
            if (s3ImageBuffers[imageName]) {
                archive.append(s3ImageBuffers[imageName], { name: imageName });
            } else {
                archive.file(
                    publicPath +
                        "/public/projects/" +
                        admin +
                        "-" +
                        PName +
                        "/images/" +
                        imageName,
                    { name: imageName },
                );
            }
        }

        archive.finalize();
    }
    //Pascal VOC
    else if (downloadFormat == 3) {
        var output = fs.createWriteStream(downloadsPath + "/VOC.zip");
        var archive = archiver("zip");

        output.on("close", function () {
            res.download(downloadsPath + "/VOC.zip");
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);

        var skippedImages = [];
        var s3ImageBuffers = {};
        var s3BucketCache = {};

        for (var i = 0; i < existingImages.rows.length; i++) {
            var imgName = existingImages.rows[i].IName;
            var imgPath = `${imagesPath}/${imgName}`;
            var imgW, imgH;
            try {
                var { buffer, isLocal } = await readExportImage(
                    imagesPath,
                    PName,
                    admin,
                    existingImages.rows[i],
                    s3BucketCache,
                );
                var imgData = probe.sync(buffer);
                imgW = imgData.width;
                imgH = imgData.height;
                if (!isLocal) {
                    s3ImageBuffers[imgName] = buffer;
                }
            } catch (err) {
                global.logger.error(err);
                skippedImages.push(imgName);
                continue;
            }

            var data = "<annotation>\n";
            data += "\t<folder>images</folder>\n";
            data += `\t<filename>${imgName}</filename>\n`;
            data += `\t<path>${imgPath}</path>\n`;
            data += `\t<soruce>\n`;
            data += `\t\t<database>${PName}.db</database>\n`;
            data += `\t</soruce>\n`;
            data += `\t<size>\n`;
            data += `\t\t<width>${imgW}</width>\n`;
            data += `\t\t<height>${imgH}</height>\n`;
            data += `\t\t<depth>3</depth>\n`;
            data += `\t</size>\n`;
            data += `\t<segmented>0</segmented>\n`;

            let labels;
            try {
                labels = await queries.project.getLabelsForImageName(
                    projectPath,
                    imgName,
                );
            } catch (err) {
                global.logger.error(err);
                return res.status(500).send("Error fetching images");
            }

            labels = labels.rows;

            for (var j = 0; j < labels.length; j++) {
                var className = labels[j].CName;
                var xmin = labels[j].X;
                var xmax = xmin + labels[j].W;
                var ymin = labels[j].Y;
                var ymax = ymin + labels[j].Y;

                data += `\t<object>\n`;
                data += `\t\t<name>${className}</name>\n`;
                data += `\t\t<pose>Unspecified</pose>\n`;
                data += `\t\t<truncated>0</truncated>\n`;
                data += `\t\t<difficult>0</difficult>\n`;

                data += `\t\t<bndbox>\n`;
                data += `\t\t\t<xmin>${xmin}</xmin>\n`;
                data += `\t\t\t<ymin>${ymin}</ymin>\n`;
                data += `\t\t\t<xmax>${xmax}</xmax>\n`;
                data += `\t\t\t<ymax>${ymax}</ymax>\n`;
                data += `\t\t</bndbox>\n`;
                data += `\t</object>\n`;
            }
            data += "</annotation>";

            var xmlname = imgName.split(".")[0] + ".xml";
            fs.writeFile(downloadsPath + "/" + xmlname, data, (err) => {
                if (err) throw err;
            });
            archive.file(downloadsPath + "/" + xmlname, { name: xmlname });
        }

        if (skippedImages.length > 0) {
            archive.append(
                JSON.stringify({ skipped_images: skippedImages }, null, 2),
                { name: "skipped_images.json" },
            );
        }

        for (var i = 0; i < existingImages.rows.length; i++) {
            var imageName = existingImages.rows[i].IName;
            if (skippedImages.includes(imageName)) {
                continue;
            }
            if (s3ImageBuffers[imageName]) {
                archive.append(s3ImageBuffers[imageName], { name: imageName });
            } else {
                archive.file(
                    publicPath +
                        "/public/projects/" +
                        admin +
                        "-" +
                        PName +
                        "/images/" +
                        imageName,
                    { name: imageName },
                );
            }
        }

        archive.finalize();
    }
    // Summary file
    else if (downloadFormat == 4) {
        var output = fs.createWriteStream(downloadsPath + "/summary.zip");
        var archive = archiver("zip");

        output.on("close", function () {
            res.download(downloadsPath + "/summary.zip");
        });

        archive.on("error", function (err) {
            throw err;
        });

        archive.pipe(output);
        var data = "";

        for (var i = 0; i < existingImages.rows.length; i++) {
            data = data + existingImages.rows[i].IName + "\t";

            let className;
            try {
                className = await queries.project.getClassNameForLabel(
                    projectPath,
                    existingImages.rows[i].IName,
                );
            } catch (err) {
                global.logger.error(err);
                return res
                    .status(500)
                    .send("Error fetching class name for image");
            }

            className = className.rows;

            for (var j = 0; j < className.length; j++) {
                let filteredLabels;

                try {
                    filteredLabels =
                        await queries.project.getLabelsForImageNameAndClassName(
                            projectPath,
                            existingImages.rows[i].IName,
                            className[j].CName,
                        );
                } catch (err) {
                    global.logger.error(err);
                    return res
                        .status(500)
                        .send(
                            "Error fetching labels for image name and class name",
                        );
                }

                filteredLabels = filteredLabels.rows;

                data =
                    data +
                    filteredLabels.length +
                    ": " +
                    className[j].CName +
                    "\t";
            }

            let image;
            try {
                image = await queries.project.getImage(
                    projectPath,
                    existingImages.rows[i].IName,
                );
            } catch (err) {
                global.logger.error(err);
                return res.status(500).send("Error fetching image");
            }

            image = image.row;

            data = data + image.reviewImage + "\t" + "\n";
        }

        fs.writeFile(
            downloadsPath + "/" + PName + "_Summary.txt",
            data,
            (err) => {
                if (err) throw err;
                archive.file(downloadsPath + "/" + PName + "_Summary.txt", {
                    name: PName + "_Summary.txt",
                });

                archive.finalize();
            },
        );
    } else if (downloadFormat == 5) {
        if (fs.existsSync(bootstrapPath + "/out.json")) {
            var output = fs.createWriteStream(
                downloadsPath + "/initialClassification.zip",
            );
            var archive = archiver("zip");
            output.on("close", function () {
                res.download(downloadsPath + "/initialClassification.zip");
            });

            archive.on("error", function (err) {
                throw err;
            });

            archive.pipe(output);
            var rawLabelBootstrapData = fs.readFileSync(
                bootstrapPath + "/out.json",
            );

            fs.writeFile(
                downloadsPath + "/out.json",
                rawLabelBootstrapData,
                (err) => {
                    if (err) throw err;
                    archive.file(downloadsPath + "/out.json", {
                        name: "out.json",
                    });

                    archive.finalize();
                },
            );
        }
    }
}

module.exports = downloadDataset;
