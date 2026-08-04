const queries = require("../../queries/queries");

async function deleteImage(req, res) {
    var IDX = parseInt(req.body.IDX),
        PName = req.body.PName,
        admin = req.body.Admin,
        user = req.cookies.Username,
        images = req.body.ImageArray;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + admin + "-" + PName,
        imagesPath = projectPath + "/images/";

    images = images.split(",");

    for (let i in images) {
        try {
            await queries.project.deleteImage(projectPath, images[i]);
            await queries.project.deleteLabel(projectPath, images[i]);
            await queries.project.deleteValidation(projectPath, images[i]);
        } catch (err) {
            global.logger.error(err);
            await res
                .status(500)
                .send("There was an error deleting the image.");
        }
    }

    for (const image of images) {
        const imagePath = `${imagesPath}/${image}`;
        fs.unlinkSync(imagePath);
    }

    res.status(200).send("Successfully deleted images.");
}

module.exports = deleteImage;
