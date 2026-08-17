const fs = require("fs");
const rimraf = require("../../public/libraries/rimraf");
const StreamZip = require("node-stream-zip");
const queries = require("../../queries/queries");

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
            newFiles = await readdirAsync(mergeImages);

            for (var i = 0; i < newFiles.length; i++) {
                var temp = mergeImages + "/" + newFiles[i];
                newFiles[i] = newFiles[i].trim();
                newFiles[i] = newFiles[i].split(" ").join("_");
                newFiles[i] = newFiles[i].split("+").join("_");

                fs.rename(temp, mergeImages + "/" + newFiles[i], () => {});

                if (newFiles[i] == "__MACOSX") {
                    continue;
                } else if (!files.includes(newFiles[i])) {
                    fs.rename(
                        mergeImages + "/" + newFiles[i],
                        imagesPath + "/" + newFiles[i],
                        function (err) {
                            if (err) {
                                global.logger.error(err);
                                return res.send("ERROR! " + err);
                            }
                        },
                    );

                    try {
                        await queries.project.addImages(
                            projectPath,
                            newFiles[i],
                            0,
                            0,
                        );
                    } catch (err) {
                        global.logger.error(err);
                        return res.send("Error adding images");
                    }

                    newImages.push(newFiles[i]);
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
