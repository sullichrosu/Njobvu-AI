const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const unzip = require('../../utils/unzipFile');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');
const config = require('../../config.json');
const pythonPath = config.default_python_path || 'python3';

const findFiles = (dir, ext) => {
    let results = [];

    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);

    list.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
            results = results.concat(findFiles(filePath, ext));
        } else if (file.toLowerCase().endsWith(ext.toLowerCase())) {
            results.push(filePath);
        }
    });

    return results;
};

const normalizeKey = (str) => {
    if (!str) return "";
    let s = str.replace(/\.[^/.]+$/, ""); // remove extension
    // replace D2_ with D20 or I_ with I20
    s = s.replace(/^([a-zA-Z])2?_/, "$120");
    // replace all remaining underscores with zeros
    s = s.replace(/_/g, "0");
    // remove all non-alphanumeric characters and lowercase it
    s = s.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return s;
};

const importIfcb = async (req, res) => {
    let projectPath = '';
    const importStartTime = Date.now();

    try {
        if (!req.files || !req.files.ifcb_archive) {
            return res.status(400).json({ success: false, message: 'IFCB archive file is required.' });
        }

        const projectName = req.body.project_name || req.body.projectName;

        if (!projectName) {
            return res.status(400).json({ success: false, message: 'Project name is required.' });
        }

        const username = req.cookies.Username || 'admin';
        const archiveFile = req.files.ifcb_archive;
        const uploadPath = path.join(__dirname, '..', '..', 'tmp', 'uploads');

        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        const archivePath = path.join(uploadPath, Date.now() + '-' + archiveFile.name);
        await archiveFile.mv(archivePath);

        const unzippedPath = path.join(path.dirname(archivePath), path.parse(archivePath).name);

        const unzipStartTime = Date.now();
        try {
            await unzip(archivePath, unzippedPath);
            global.logger.debug(`successfully extracted IFCB archive in ${Date.now() - unzipStartTime}ms`);
        } catch (error) {
            global.logger.error('failed to unzip IFCB archive: ' + error);
            return res.status(500).json({ success: false, message: 'Failed to unzip IFCB archive.' });
        }

        const mainPath = path.join(__dirname, '..', '..', 'public', 'projects');
        projectPath = path.join(mainPath, `${username}-${projectName}`);

        if (fs.existsSync(projectPath)) {
            return res.status(400).json({ success: false, message: 'A project already exists with that name!' });
        }

        const imagesPath = path.join(projectPath, 'images');
        const bootstrapPath = path.join(projectPath, 'bootstrap');
        const trainingPath = path.join(projectPath, 'training');
        const logsPath = path.join(trainingPath, 'logs');
        const weightsPath = path.join(trainingPath, 'weights');
        const pythonPathDir = path.join(trainingPath, 'python');
        const pythonPathFile = path.join(trainingPath, 'Paths.txt');
        const darknetPathFile = path.join(trainingPath, 'darknetPaths.txt');

        // create directory structure
        fs.mkdirSync(projectPath, { recursive: true });
        fs.mkdirSync(imagesPath);
        fs.mkdirSync(bootstrapPath);
        fs.mkdirSync(trainingPath);
        fs.mkdirSync(weightsPath);
        fs.mkdirSync(logsPath);
        fs.mkdirSync(pythonPathDir);
        fs.writeFileSync(pythonPathFile, "");
        fs.writeFileSync(darknetPathFile, "");

        // find .roi files
        const roiFiles = findFiles(unzippedPath, '.roi');
        if (roiFiles.length === 0) {
            fs.rmSync(projectPath, { recursive: true, force: true });
            fs.rmSync(unzippedPath, { recursive: true, force: true });

            return res.status(400).json({ success: false, message: 'No .roi files found in the archive.' });
        }

        const scriptPath = path.join(__dirname, '..', '..', 'controllers', 'imports', 'get_images_fromROI.py');
        const args = [scriptPath, unzippedPath, '-o', imagesPath];

        const pythonStartTime = Date.now();
        global.logger.debug(`starting IFCB python script: ${pythonPath} ${args}`);

        await new Promise((resolve, reject) => {
            const pythonProcess = spawn(pythonPath, args);

            let stderr = '';
            pythonProcess.stdout.on('data', (data) => {
                global.logger.debug(`IFCB python script stdout: ${data.toString().trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                global.logger.debug(`IFCB python script finished in ${Date.now() - pythonStartTime}ms`);
                if (code !== 0) {
                    global.logger.error(`IFCB python script exited with code ${code}: ` + stderr);

                    reject(new Error(stderr || `Python process failed with exit code ${code}`));
                } else {
                    resolve();
                }
            });
        });

        // add extracted images to project database
        const dbStartTime = Date.now();
        const files = fs.readdirSync(imagesPath);
        let imageCount = 0;

        // initialize project database client
        await queries.managed.createProject(
            projectName,
            "IFCB Imported Project",
            1,
            username,
        );

        await queries.managed.grantUserAccess(username, projectName, username);

        const newDbPath = path.join(projectPath, `${projectName}.db`);
        global.projectDbClients[projectPath] = new Client(newDbPath);

        const newClient = global.projectDbClients[projectPath];
        if (newClient && typeof newClient.open === 'function') {
            newClient.open();
        }

        await queries.project.migrateProjectDb(projectPath);

        // find if there is a CSV annotation file
        const csvFiles = findFiles(unzippedPath, '.csv');
        const annotationMap = new Map();
        const classSet = new Set();

        if (csvFiles.length > 0) {
            try {
                const csvContent = fs.readFileSync(csvFiles[0], 'utf-8');
                const lines = csvContent.split(/\r?\n/);

                if (lines.length === 0) {
                    throw new Error("Empty CSV");
                }

                const header = lines[0].split(',').map(c => c.replace(/^["']|["']$/g, '').trim().toLowerCase());
                const roiColIdx = header.findIndex(col => col.includes('roi') || col.includes('image') || col.includes('file'));
                const classColIdx = header.findIndex(col => col.includes('class') || col.includes('label'));

                if (roiColIdx === -1 && classColIdx === -1) {
                    throw new Error("Required columns missing");
                }

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();

                    if (!line) continue;

                    const cols = line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());

                    if (cols.length > Math.max(roiColIdx, classColIdx)) {
                        const roiName = cols[roiColIdx];
                        const className = cols[classColIdx];

                        if (!roiName || !className) {
                            continue;
                        }

                        annotationMap.set(normalizeKey(roiName), className);
                        classSet.add(className.replaceAll(" ", "_"));
                    }
                }

                global.logger.debug(`Found ${annotationMap.size} annotations in ${csvFiles[0]}`);
            } catch (csvErr) {
                global.logger.error(`Failed to parse CSV annotation file: ${csvErr}`);
            }
        }

        // insert unique classes
        for (const className of classSet) {
            try {
                if (queries.project && typeof queries.project.sql === 'function') {
                    await queries.project.sql(projectPath, "INSERT OR IGNORE INTO Classes (CName) VALUES (?)", [className]);
                } else if (newClient && typeof newClient.run === 'function') {
                    await newClient.run("INSERT OR IGNORE INTO Classes (CName) VALUES (?)", [className]);
                }
            } catch (classErr) {
                global.logger.error(`Failed to insert class ${className}: ${classErr}`);
            }
        }

        // start transaction for fast batch inserting
        if (newClient && typeof newClient.run === 'function') {
            await newClient.run("BEGIN TRANSACTION", []);
        }

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file === "__MACOSX" || file === "blob" || file.endsWith(".zip")) {
                    continue;
                }

                const temp = path.join(imagesPath, file);
                let cleanedName = file.trim().replace(/\s+/g, '_').replace(/\+/g, '_');

                if (cleanedName !== file) {
                    fs.renameSync(temp, path.join(imagesPath, cleanedName));
                }

                await queries.project.addImages(projectPath, cleanedName, 0, 0);
                imageCount++;

                // if an annotation exists for this image, add a label spanning the whole image
                const normFilenameKey = normalizeKey(cleanedName);
                if (annotationMap.has(normFilenameKey)) {
                    const className = annotationMap.get(normFilenameKey);

                    // probe dimensions using partial file read
                    let imgWidth = 0;
                    let imgHeight = 0;

                    try {
                        const filePath = path.join(imagesPath, cleanedName);
                        const file = fs.openSync(filePath, 'r');
                        const buffer = Buffer.alloc(128);

                        fs.readSync(file, buffer, 0, 128, 0);
                        fs.closeSync(file);

                        const imgData = global.probe.sync(buffer);

                        if (imgData) {
                            imgWidth = imgData.width;
                            imgHeight = imgData.height;
                        }
                    } catch (probeErr) {
                        global.logger.warn(`Failed to probe image dimensions for ${cleanedName}: ${probeErr}`);
                    }

                    if (queries.project && typeof queries.project.sql === 'function') {
                        await queries.project.sql(
                            projectPath,
                            "INSERT INTO Labels (CName, X, Y, W, H, IName) VALUES (?, ?, ?, ?, ?, ?)",
                            [className, "0", "0", imgWidth, imgHeight, cleanedName]
                        );
                    } else if (newClient && typeof newClient.run === 'function') {
                        await newClient.run(
                            "INSERT INTO Labels (CName, X, Y, W, H, IName) VALUES (?, ?, ?, ?, ?, ?)",
                            [className, "0", "0", imgWidth, imgHeight, cleanedName]
                        );
                    }
                }

                if (imageCount % 10000 === 0) {
                    global.logger.debug(`IFCB DB inserting progress: ${imageCount}/${files.length} images added`);
                }
            }

            if (newClient && typeof newClient.run === 'function') {
                await newClient.run("COMMIT", []);
            }
        } catch (dbErr) {
            if (newClient && typeof newClient.run === 'function') {
                await newClient.run("ROLLBACK", []).catch(() => { });
            }

            throw dbErr;
        }

        global.logger.debug(`IFCB DB population and project setup took ${Date.now() - dbStartTime}ms`);

        // clean up unzipped folder
        fs.rmSync(unzippedPath, { recursive: true, force: true });

        global.logger.debug(`IFCB total import process took ${Date.now() - importStartTime}ms`);

        res.json({ success: true, message: `IFCB Import completed. Extracted ${imageCount} images.` });
    } catch (err) {
        global.logger.error('IFCB import failed: ' + err);
        if (projectPath && fs.existsSync(projectPath)) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }

        res.status(500).json({ success: false, message: err.message || 'IFCB import process failed' });
    }
};

module.exports = importIfcb;
