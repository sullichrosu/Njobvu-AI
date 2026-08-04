const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const unzip = require('../../utils/unzipFile');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');
const config = require('../../config.json');
const pythonPath = config.default_python_path || 'python3';

const importKwCoco = async (req, res) => {
    try {
        if (!req.files || !req.files.coco_archive) {
            return res.status(400).json({ success: false, message: 'KW Coco archive file is required.' });
        }

        const projectName = req.body.project_name || req.body.projectName;
        if (!projectName) {
            return res.status(400).json({ success: false, message: 'Project name is required.' });
        }

        const username = req.cookies.Username || 'admin';

        const archiveFile = req.files.coco_archive;

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
            return res.status(500).json({ success: false, message: 'Failed to unzip KW Coco archive.' });
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

        // determine if model weights were uploaded
        let modelPathVal = '';
        if (req.files.viame_model) {
            const modelFile = req.files.viame_model;
            const tempModelPath = path.join(uploadPath, Date.now() + '-' + modelFile.name);
            await modelFile.mv(tempModelPath);
            modelPathVal = tempModelPath;
        }

        const scriptPath = path.join(__dirname, '..', '..', 'controllers', 'imports', 'import_options.py');

        const args = ['-u', scriptPath, '-i', unzippedPath, '-o', projectPath, '-d', projectName, '-r', 'coco'];
        if (modelPathVal) {
            args.push('-w', modelPathVal);
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
                console.error(`KW Coco import python script exited with code ${code}:`);
                console.error(stderr);
                return res.status(500).json({ success: false, message: stderr || 'Error parsing KW Coco archive' });
            }

            try {
                const projectDescription = "KW Coco Imported Project";
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

                // migrate DB
                await queries.project.migrateProjectDb(projectPath);

                res.json({ success: true, message: 'KW Coco Import process completed.', output: stdout });
            } catch (dbError) {
                console.error('Database update failed after import:', dbError);
                return res.status(500).json({ success: false, message: 'KW Coco Project imported but failed to update database.' });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'KW Coco import process failed' });
    }
};

module.exports = importKwCoco;
