jest.mock('probe-image-size', () => ({
    sync: jest.fn().mockReturnValue({ width: 640, height: 480 }),
}));

jest.mock('sharp', () => {
    const sharpMock = jest.fn(() => ({
        extract: () => ({ toFile: jest.fn().mockResolvedValue() }),
        metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
    }));
    return sharpMock;
});

jest.mock('../../queries/queries', () => ({
    project: {
        getAllImages: jest.fn(),
        getAllClasses: jest.fn(),
        getLabelsForImageName: jest.fn(),
    },
}));

jest.mock('../../utils/jitTrainingImages', () => ({
    ensureTrainingImagesLocal: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../utils/config', () => ({
    default_python_path: 'python3',
}));

const fs = require('fs');
const queries = require('../../queries/queries');
const config = require('../../utils/config');
const { ensureTrainingImagesLocal } = require('../../utils/jitTrainingImages');
const { prepareYoloTrainingSubmission } = require('../../utils/slurmYoloTrainingJob');

function buildReq(overrides = {}) {
    return {
        body: {
            PName: 'testproj',
            Admin: 'testuser',
            yolovx_path: '/usr/local/bin/yolo',
            yolo_task: 'detect',
            yolo_mode: 'train',
            weights: 'yolov8n.pt',
            batch: 16,
            subdiv: 8,
            width: 640,
            height: 640,
            yolo_version: '8',
            TrainingPercent: 70,
            epochs: 50,
            imgsz: 640,
            device: 'cpu',
            options: 'EMPTY',
            ...overrides,
        },
    };
}

describe('utils/slurmYoloTrainingJob', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.logger = { error: jest.fn(), debug: jest.fn() };

        queries.project.getAllImages.mockResolvedValue({
            rows: [
                { IName: 'img1.jpg' },
                { IName: 'img2.jpg' },
                { IName: 'img3.jpg' },
                { IName: 'img4.jpg' },
            ],
        });

        queries.project.getAllClasses.mockResolvedValue({
            rows: [{ CName: 'person' }, { CName: 'car' }],
        });

        queries.project.getLabelsForImageName.mockResolvedValue({
            rows: [{ LID: 1, CName: 'person', X: 10, Y: 20, W: 30, H: 40 }],
        });

        jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake image content'));
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
        jest.spyOn(fs.promises, 'symlink').mockResolvedValue();
        jest.spyOn(fs.promises, 'mkdir').mockResolvedValue();
    });

    it('rejects a request missing required params', async () => {
        await expect(prepareYoloTrainingSubmission(buildReq({ PName: '' })))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejects a yolo_mode other than "train"', async () => {
        await expect(prepareYoloTrainingSubmission(buildReq({ yolo_mode: 'inference' })))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('builds a flag-based detect command and does not exec it', async () => {
        const submission = await prepareYoloTrainingSubmission(buildReq());

        expect(submission.command).toContain('python3');
        expect(submission.command).toContain('-d ');
        expect(submission.command).toContain('-t detect');
        expect(submission.command).toContain('-m train');
        expect(submission.command).toContain('-f /usr/local/bin/yolo');
        expect(submission.command).toContain('-w ');
        expect(submission.command).toContain('-b 16');
        expect(submission.command).toContain('-s 8');
        expect(submission.command).toContain('-x 640');
        expect(submission.command).toContain('-y 640');
        expect(submission.command).toContain('-v 8');
        expect(submission.command).toContain('-e 50');
        expect(submission.command).toContain('-I 640');
        expect(submission.command).toContain('-D cpu');
        expect(submission.command).toContain('-o "EMPTY"');

        expect(submission.jobName).toMatch(/^train_yolo_testproj_\d+$/);
        expect(submission.PName).toBe('testproj');
        expect(submission.Admin).toBe('testuser');
        expect(submission.runPath).toContain('/training/logs/');

        expect(ensureTrainingImagesLocal).toHaveBeenCalledWith('testproj', 'testuser', expect.any(String), expect.any(Array));
    });

    it('uses slurm_python_path over default_python_path when set', async () => {
        config.slurm_python_path = '/opt/hpc-envs/njobvu/bin/python3';

        try {
            const submission = await prepareYoloTrainingSubmission(buildReq());

            expect(submission.command.startsWith('/opt/hpc-envs/njobvu/bin/python3 ')).toBe(true);
        } finally {
            delete config.slurm_python_path;
        }
    });

    it('derives yolo_task from a -seg weight name, overriding yolo_task', async () => {
        const submission = await prepareYoloTrainingSubmission(buildReq({ weights: 'yolov8n-seg.pt', yolo_task: 'detect' }));

        expect(submission.command).toContain('-t segment');
    });

    it('derives yolo_task from a -cls weight name and runs the classification dataset path', async () => {
        const submission = await prepareYoloTrainingSubmission(buildReq({ weights: 'yolov8n-cls.pt', yolo_task: 'detect' }));

        expect(submission.command).toContain('-t classify');
        expect(fs.promises.mkdir).toHaveBeenCalled();
    });

    it('writes symlinks for the detect/segment/obb dataset split', async () => {
        await prepareYoloTrainingSubmission(buildReq());

        expect(fs.promises.symlink).toHaveBeenCalled();
    });
});
