const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const unzip = require('../../utils/unzipFile');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');
const config = require('../../config.json');
const pythonPath = config.default_python_path || 'python3';

const importYolo = async (req, res) => {
    try {
        if (!req.files || !req.files.yolo_archive) {
            return res.status(400).json({ success: false, message: 'YOLO archive file is required.' });
        }

        const projectName = req.body.project_name || req.body.projectName;
        if (!projectName) {
            return res.status(400).json({ success: false, message: 'Project name is required.' });
        }

        const taskType = req.body.task_type || 'detect';
        const username = req.cookies.Username || 'admin';

        const archiveFile = req.files.yolo_archive;
        const uploadPath = path.join(__dirname, '..', '..', 'tmp', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        const archivePath = path.join(uploadPath, Date.now() + '-' + archiveFile.name);
        await archiveFile.mv(archivePath);

        const unzippedPath = path.join(path.dirname(archivePath), path.basename(archivePath, '.zip'));

        try {
            await unzip(archivePath, unzippedPath);
        } catch (error) {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }

        const mainPath = path.join(__dirname, '..', '..', 'public', 'projects');
        const projectPath = path.join(mainPath, `${username}-${projectName}`);

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

        // directory structure
        fs.mkdirSync(projectPath, { recursive: true });
        fs.mkdirSync(imagesPath);
        fs.mkdirSync(bootstrapPath);
        fs.mkdirSync(trainingPath);
        fs.mkdirSync(weightsPath);
        fs.mkdirSync(logsPath);
        fs.mkdirSync(pythonPathDir);
        fs.writeFileSync(pythonPathFile, "");
        fs.writeFileSync(darknetPathFile, "");

        // determine if weights were uploaded
        let weightsPathVal = '';
        if (req.files.yolo_weights) {
            const weightsFile = req.files.yolo_weights;
            const tempWeightsPath = path.join(uploadPath, Date.now() + '-' + weightsFile.name);
            await weightsFile.mv(tempWeightsPath);
            weightsPathVal = tempWeightsPath;
        }

        const scriptPath = path.join(__dirname, '..', '..', 'controllers', 'imports', 'import_options.py');

        const args = ['-u', scriptPath, '-i', unzippedPath, '-o', projectPath, '-d', projectName, '-r', 'yolo'];
        if (weightsPathVal) {
            args.push('-w', weightsPathVal);
        }

        const pythonProcess = spawn(`${pythonPath}`, args);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`YOLO import python script exited with code ${code}:`);
                console.error(stderr);
                return res.status(500).json({ success: false, message: stderr || 'Error parsing YOLO archive' });
            }

            try {
                const projectDescription = "YOLO Imported Project";
                const autoSave = 1;

                await queries.managed.createProject(
                    projectName,
                    projectDescription,
                    autoSave,
                    username,
                );

                await queries.managed.grantUserAccess(username, projectName, username);

                // add the new project's database client to the pool of active clients
                const newDbPath = path.join(projectPath, `${projectName}.db`);
                global.projectDbClients[projectPath] = new Client(newDbPath);

                const newClient = global.projectDbClients[projectPath];
                if (newClient && typeof newClient.open === 'function') {
                    newClient.open();
                }

                await queries.project.migrateProjectDb(projectPath);

                res.json({ success: true, message: 'YOLO Import process completed.', output: stdout });
            } catch (dbError) {
                console.error('Database update failed after import:', dbError);
                return res.status(500).json({ success: false, message: 'YOLO Project imported but failed to update database.' });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'YOLO import process failed' });
    }
};

module.exports = importYolo;
