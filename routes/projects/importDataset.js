const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const unzip = require('../../utils/unzipFile');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');
const config = require('../../config.json');
const pythonPath = config.default_python_path;

const importDataset = async (req, res) => {
    try {
        if (!req.files || !req.files.dataset) {
            return res.status(400).json({ success: false, message: 'Dataset file is required.' });
        }

        const importType = req.body['import-type'];
        const projectName = req.body.projectName;
        const dbName = req.body.dbName || projectName;
        const classificationDir = req.body.classificationDir;
        const username = req.cookies.Username;

        const datasetFile = req.files.dataset;
        const uploadPath = path.join(__dirname, '..', '..', 'tmp', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        const datasetPath = path.join(uploadPath, Date.now() + '-' + datasetFile.name);
        await datasetFile.mv(datasetPath);

        const unzippedPath = path.join(path.dirname(datasetPath), path.basename(datasetPath, '.zip'));

        try {
            await unzip(datasetPath, unzippedPath);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Failed to unzip dataset.' });
        }

        const mainPath = path.join(__dirname, '..', '..', 'public', 'projects');
        const projectPath = path.join(mainPath, `${username}-${projectName}`);

        if (fs.existsSync(projectPath)) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }

        const imagesPath = path.join(projectPath, 'images');
        const bootstrapPath = path.join(projectPath, 'bootstrap');
        const trainingPath = path.join(projectPath, 'training');
        const logsPath = path.join(trainingPath, 'logs');
        const weightsPath = path.join(trainingPath, 'weights');
        const pythonPathDir = path.join(trainingPath, 'python');
        const pythonPathFile = path.join(trainingPath, 'Paths.txt');
        const darknetPathFile = path.join(trainingPath, 'darknetPaths.txt');

        // project directory structure
        fs.mkdirSync(projectPath, { recursive: true });
        fs.mkdirSync(imagesPath);
        fs.mkdirSync(bootstrapPath);
        fs.mkdirSync(trainingPath);
        fs.mkdirSync(weightsPath);
        fs.mkdirSync(logsPath);
        fs.mkdirSync(pythonPathDir);
        fs.writeFileSync(pythonPathFile, "");
        fs.writeFileSync(darknetPathFile, "");

        const scriptPath = path.join(__dirname, '..', '..', 'controllers', 'imports', 'import_options.py');
        const args = ['-u', scriptPath, '-i', unzippedPath, '-o', projectPath];

        if (importType === 'classification') {
            if (!dbName) {
                return res.status(400).json({ success: false, message: 'Database name is required for classification import.' });
            }

            args.push('-d', projectName, '-r', 'class');
        } else if (importType === 'yolo' || importType === 'kwcoco') {
            if (req.files && req.files.weights) {
                const weightsFile = req.files.weights;
                const weightsPath = path.join(uploadPath, Date.now() + '-' + weightsFile.name);
                await weightsFile.mv(weightsPath);
                args.push('-w', weightsPath);
            }

            args.push('-d', projectName, '-r', importType === 'yolo' ? 'yolo' : 'coco');
        } else if (importType === 'inference' || importType === 'inference-classification') {
            if (!req.files.weights) {
                return res.status(400).json({ success: false, message: 'Weights file is required for inference.' });
            }

            const weightsFile = req.files.weights;
            const weightsPath = path.join(uploadPath, Date.now() + '-' + weightsFile.name);
            await weightsFile.mv(weightsPath);
            args.push('-w', weightsPath);

            if (importType === 'inference-classification') {
                const classificationTempDir = path.join(uploadPath, Date.now() + '-classified');
                fs.mkdirSync(classificationTempDir, { recursive: true });
                args.push('-c', classificationTempDir, '-r', 'ci', '-d', projectName);
            } else {
                args.push('-r', 'inf', '-d', projectName);
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid import type.' });
        }

        const pythonProcess = spawn(`${pythonPath}`, args);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            const log_data = data.toString();
            global.logger.debug('Python Script:', log_data);
            stdout += log_data;
        });

        pythonProcess.stderr.on('data', (data) => {
            const log_data = data.toString();
            global.logger.error('Python Script Error:', log_data);
            stderr += log_data;
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                global.logger.error(`python script exited with code ${code}:`);
                global.logger.error(stderr);
                return res.status(500).json({ success: false, message: stderr });
            }

            try {
                const projectDescription = "Imported Project";
                const autoSave = 1;

                await queries.managed.createProject(
                    projectName,
                    projectDescription,
                    autoSave,
                    username,
                );

                await queries.managed.grantUserAccess(username, projectName, username);

                // add the new project's database client to the global pool of active clients
                if (!global.projectDbClients) {
                    global.projectDbClients = {};
                }
                const newDbPath = path.join(projectPath, `${projectName}.db`);
                global.projectDbClients[projectPath] = new Client(newDbPath);

                // you might need to explicitly open the new connection if the Client class doesn't do it automatically.
                // regardless, the open function is idempotent and therefore safe to call even if it occurs in the constructor
                const newClient = global.projectDbClients[projectPath];
                if (newClient && typeof newClient.open === 'function') {
                    newClient.open();
                }

                res.json({ success: true, message: 'Import process completed.', output: stdout });
            } catch (dbError) {
                global.logger.error('Database update failed after import:', dbError);

                return res.status(500).json({ success: false, message: 'Project imported but failed to update main database.' });
            }
        });
    } catch (err) {
        global.logger.error(err);
        res.status(500).json({ success: false, message: 'File upload failed' });
    }
};

module.exports = importDataset; 
