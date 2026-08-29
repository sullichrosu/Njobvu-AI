const path = require('path');
const fs = require('fs');
const parseKwCocoCsv = require('../../utils/parseKwCocoCsv');
const parseKwCocoJson = require('../../utils/parseKwCocoJson');
const queries = require('../../queries/queries');
const { Client } = require('../../queries/client');

async function mapKwCocoCsv(req, res) {
    try {
        const projectName = req.body.PName || req.body.project_name || req.body.projectName;
        const admin = req.body.Admin || req.cookies?.Username || 'admin';

        if (!projectName) {
            return res.status(400).json({ success: false, message: 'Project name is required.' });
        }

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ success: false, message: 'No annotation file was uploaded.' });
        }

        const uploadedFile = req.files.kwcoco_csv || req.files.kwcoco_json || req.files.csv_file
            || req.files.json_file || req.files.upload_csv || req.files.upload_json || Object.values(req.files)[0];
        if (!uploadedFile) {
            return res.status(400).json({ success: false, message: 'Invalid file upload payload.' });
        }

        const fileContent = uploadedFile.data ? uploadedFile.data.toString('utf8') : fs.readFileSync(uploadedFile.tempFilePath, 'utf8');

        const ext = path.extname(uploadedFile.name || '').toLowerCase();
        const trimmedContent = fileContent.trim();
        const isJson = ext === '.json' || (ext !== '.csv' && (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')));

        const parsedAnnotations = isJson ? parseKwCocoJson(fileContent) : parseKwCocoCsv(fileContent);
        if (parsedAnnotations.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid KW COCO annotations found in file.' });
        }

        const mainPath = path.join(__dirname, '..', '..', 'public', 'projects');
        const projectPath = path.join(mainPath, `${admin}-${projectName}`);

        if (!fs.existsSync(projectPath)) {
            return res.status(404).json({ success: false, message: `Project path not found: ${admin}-${projectName}` });
        }

        const dbPath = path.join(projectPath, `${projectName}.db`);
        if (!global.projectDbClients[projectPath]) {
            global.projectDbClients[projectPath] = new Client(dbPath);
            const client = global.projectDbClients[projectPath];
            if (typeof client.open === 'function') {
                client.open();
            }
        }

        // Migrate DB if needed
        await queries.project.migrateProjectDb(projectPath);

        // 1. Ensure all referenced classes exist in Classes table
        const existingClassResult = await queries.project.getAllClasses(projectPath);
        const existingClassRows = existingClassResult?.rows || [];
        const existingClassSet = new Set(existingClassRows.map(c => c.CName));

        const uniqueClasses = new Set(parsedAnnotations.map(a => a.className));
        let classesAdded = 0;

        for (const cname of uniqueClasses) {
            if (!existingClassSet.has(cname)) {
                await queries.project.createClass(projectPath, cname);
                existingClassSet.add(cname);
                classesAdded++;
            }
        }

        // 2. Only images that actually exist on disk can be registered/labeled —
        // otherwise the annotate/validation pages 404 on a DB row with no backing file.
        const imagesDir = path.join(projectPath, 'images');
        const existingImageResult = await queries.project.getAllImages(projectPath);
        const existingImageRows = existingImageResult?.rows || [];
        const existingImageSet = new Set(existingImageRows.map(i => i.IName));

        const uniqueImages = new Set(parsedAnnotations.map(a => a.filename));
        let imagesRegistered = 0;
        const missingImages = new Set();

        for (const iname of uniqueImages) {
            if (existingImageSet.has(iname)) {
                continue;
            }
            if (!fs.existsSync(path.join(imagesDir, iname))) {
                missingImages.add(iname);
                continue;
            }
            await queries.project.sql(projectPath, "INSERT OR IGNORE INTO Images (IName, reviewImage, validateImage) VALUES (?, 0, 0)", [iname]);
            existingImageSet.add(iname);
            imagesRegistered++;
        }

        // 3. Get current max LID in Labels table
        const maxLidResult = await queries.project.getMaxLabelId(projectPath);
        const maxLidRows = maxLidResult?.rows || [];
        let nextLid = 1;
        if (maxLidRows.length > 0 && maxLidRows[0].LID) {
            nextLid = maxLidRows[0].LID + 1;
        }

        // 4. Insert labels, skipping annotations whose image has no file on disk
        let labelsInserted = 0;
        let labelsSkipped = 0;
        for (const ann of parsedAnnotations) {
            if (missingImages.has(ann.filename)) {
                labelsSkipped++;
                continue;
            }
            await queries.project.createLabel(
                projectPath,
                nextLid++,
                ann.className,
                ann.x,
                ann.y,
                ann.w,
                ann.h,
                ann.filename
            );
            labelsInserted++;
        }

        const message = missingImages.size > 0
            ? `Mapped ${labelsInserted} KW COCO annotations. Skipped ${labelsSkipped} annotation(s) for ${missingImages.size} image(s) not found in the project's images folder — upload those images first.`
            : `Successfully mapped ${labelsInserted} KW COCO annotations.`;

        return res.json({
            success: true,
            message,
            labelsInserted,
            labelsSkipped,
            classesAdded,
            imagesRegistered,
            missingImages: Array.from(missingImages)
        });

    } catch (err) {
        console.error('Error mapping KW COCO CSV annotations:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal server error mapping KW COCO CSV.' });
    }
}

module.exports = mapKwCocoCsv;
