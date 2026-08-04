const fs = require("fs");
const unzipFile = require("../../utils/unzipFile");
const deleteDir = require("../../utils/deleteDir");
const pythonScript = require("../../utils/pythonScript");
const queries = require("../../queries/queries");

async function createClassification(req, res) {
    if (!req.files || !req.files.upload_images) {
        return res.status(400).send("No file uploaded.");
    }

    if (!req.body.projectName) {
        return res.status(400).send("Project name not provided.");
    }

    if (!req.cookies.Username) {
        return res.status(400).send("Username cookie not found.");
    }

    let username = req.cookies.Username;
    let projectName = req.body.projectName;
    let dbName = projectName;

    let publicPath = __dirname.replace("routes", "").replace("training", ""),
        mainPath = publicPath + "public/projects/",
        projectPath = mainPath + username + "-" + projectName;

    try {
        if (!fs.existsSync(mainPath)) {
            fs.mkdirSync(mainPath);
        }
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath);
        }
    } catch (err) {
        global.logger.error("Error creating directories:", err);
        return res.status(500).send("Error creating directories.");
    }

    const uploadedFile = req.files.upload_images;
    const targetPath = `${projectPath}/${uploadedFile.name.trim().replace(/[ 0+]/g, "_")}`;

    try {
        await new Promise((resolve, reject) => {
            uploadedFile.mv(targetPath, (err) => {
                if (err) {
                    global.logger.error("Error moving file:", err);
                    reject(new Error("Failed to move file."));
                } else {
                    global.logger.debug("File moved to path:", targetPath);
                    resolve();
                }
            });
        });

        if (!fs.existsSync(targetPath)) {
            global.logger.error(`File not found at path: ${targetPath}`);
            return res.status(400).send("Uploaded file not found.");
        }
    } catch (error) {
        global.logger.error("Error during file move:", error);
        await deleteDir(projectPath);
        return res.status(500).send(error.message);
    }

    try {
        await unzipFile(targetPath, projectPath);
    } catch (error) {
        global.logger.error("Error during unzip process:", error);
        await deleteDir(projectPath);
        return res.status(500).send("Error unzipping file: " + error.message);
    }

    let extractedFiles;
    try {
        extractedFiles = fs.readdirSync(projectPath);
        global.logger.debug("Extracted files:", extractedFiles);
    } catch (error) {
        global.logger.error("Error reading project path:", error);
        await deleteDir(projectPath);
        return res
            .status(500)
            .send("Error reading project directory: " + error.message);
    }

    const inputDir = projectPath + "/" + extractedFiles[0];
    const runType = "class";
    global.logger.debug("Using input directory:", inputDir);

    try {
        await pythonScript(inputDir, projectPath, runType, dbName);
    } catch (error) {
        global.logger.error("Error running python script:", error);
        await deleteDir(projectPath);
        return res.status(500).send("Error processing file with python script");
    }

    try {
        await fs.promises.rm(inputDir, { recursive: true });
    } catch (err) {
        global.logger.error("Error deleting the folder:", err);
        await deleteDir(projectPath);
        return res
            .status(500)
            .send("Error deleting temporary folder: " + err.message);
    }

    try {
        await queries.managed.grantUserAccess(username, projectName, username);

        const projectDescription = "none";
        const autoSave = 1;
        await queries.managed.createProject(
            projectName,
            projectDescription,
            autoSave,
            username,
            'classification',
        );

        console.log(
            `Successfully granted access to ${username} for project ${projectName}`,
        );

        return res.status(200).json({
            success: true,
            message: "Access permission granted successfully",
        });
    } catch (error) {
        global.logger.error("Database error while granting access:", error);
        await deleteDir(projectPath);
        if (
            error.message &&
            error.message.includes("UNIQUE constraint failed")
        ) {
            return res.status(409).json({
                success: false,
                message: "User already has access to this project",
                error: error.message,
            });
        } else {
            await deleteDir(projectPath);
            return res.status(500).json({
                success: false,
                message: "Failed to grant project access",
                error: error.message,
            });
        }
    }
}

module.exports = createClassification;
