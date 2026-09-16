const fs = require("fs");
const path = require("path");
const rimraf = require("../../public/libraries/rimraf");
const StreamZip = require("node-stream-zip");
const queries = require("../../queries/queries");
const flattenDirectory = require("../../utils/flattenDirectory");

async function addImages(req, res) {
    var uploadImages = req.files["upload_images"],
        projectName = req.body.PName,
        admin = req.body.Admin;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/", // $LABELING_TOOL_PATH/public/projects/
        projectPath = mainPath + admin + "-" + projectName, // $LABELING_TOOL_PATH/public/projects/projectName
        mergePath = projectPath + "/merge/",
        mergeImages = mergePath + "images/",
        imagesPath = projectPath + "/images"; // $LABELING_TOOL_PATH/public/projects/projectName/images

    if (fs.existsSync(mergePath)) {
        rimraf(mergePath, (err) => {
            if (err) {
                global.logger.error(err);
            } else {
                try {
                    fs.mkdirSync(mergePath);
                    fs.mkdirSync(mergeImages);
                } catch (err) {
                    global.logger.error(err);
                    return res.send("Could not add images");
                }
            }
        });
    } else {
        try {
            fs.mkdirSync(mergePath);
            fs.mkdirSync(mergeImages);
        } catch (err) {
            global.logger.error(err);
            return res.send("Could not add images");
        }
    }

    var newImages = [];

    var zipPath = projectPath + "/" + uploadImages.name; // $LABELING_TOOL_PATH/public/projects/{projectName}/{zip_file_name}
    await uploadImages.mv(zipPath);

    var zip = new StreamZip({ file: zipPath });

    zip.on("error", (err) => {
        global.logger.error(err);
        return res.send("ERROR! " + err);
    });

    zip.on("ready", async () => {
        zip.extract(null, mergeImages, async (err, count) => {
            console.log(
                err ? `Extract error: ${err}` : `Extracted ${count} entries`,
            );
            zip.close();
            rimraf(zipPath, (err) => {
                if (err) {
                    global.logger.error(err);
                    return res.send("ERROR! " + err);
                }
            });

            files = await readdirAsync(imagesPath);
            const newFiles = await flattenDirectory(mergeImages);

            for (var i = 0; i < newFiles.length; i++) {
                const imageName = newFiles[i];
                if (!files.includes(imageName)) {
                    try {
                        fs.renameSync(
                            path.join(mergeImages, imageName),
                            path.join(imagesPath, imageName),
                        );

                        await queries.project.addImages(
                            projectPath,
                            imageName,
                            0,
                            0,
                        );

                        newImages.push(imageName);
                    } catch (err) {
                        global.logger.error(err);
                        return res.send("Error adding images");
                    }
                }
            }

            rimraf(mergePath, (err) => {
                if (err) {
                    global.logger.error(err);
                }
            });

            return res.send("New Images Added");
        });
    });
}

module.exports = addImages;
