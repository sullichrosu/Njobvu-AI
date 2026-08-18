const fs = require('fs');
const path = require('path');
const uploadInferenceFile = require('../../routes/inference/uploadInferenceFile');

describe('uploadInferenceFile Controller', () => {
    const testDir = path.join(__dirname, '../tmp_upload_test');

    beforeAll(() => {
        global.currentPath = testDir + '/';
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    function mockReqRes(fileName) {
        const req = {
            body: { PName: 'test-project', Admin: 'testuser' },
            cookies: { Username: 'testuser' },
            files: {
                upload_inference: {
                    name: fileName,
                    mv: jest.fn().mockImplementation((dest, cb) => {
                        if (typeof cb === 'function') cb(null);
                        return Promise.resolve();
                    }),
                },
            },
        };
        const res = {
            send: jest.fn(),
        };
        return { req, res };
    }

    it('accepts .zip files for inference dataset', async () => {
        const { req, res } = mockReqRes('images_archive.zip');
        await uploadInferenceFile(req, res);

        expect(res.send).toHaveBeenCalledWith({
            Success: 'Your inference file has been uploaded and saved',
        });
        expect(req.files.upload_inference.mv).toHaveBeenCalled();
    });

    it('accepts valid image/video file extensions (.jpg, .mp4, .mov)', async () => {
        const { req, res } = mockReqRes('video_sample.mp4');
        await uploadInferenceFile(req, res);

        expect(res.send).toHaveBeenCalledWith({
            Success: 'Your inference file has been uploaded and saved',
        });
        expect(req.files.upload_inference.mv).toHaveBeenCalled();
    });

    it('rejects unsupported file extensions (.exe, .txt)', async () => {
        const { req, res } = mockReqRes('malicious.exe');
        await uploadInferenceFile(req, res);

        expect(res.send).toHaveBeenCalledWith({
            Success: 'ERROR: Wrong filetype. Must be type .png, .jpg, .jpeg, .tif, .gif, .mp4, .mov, or .zip',
        });
        expect(req.files.upload_inference.mv).not.toHaveBeenCalled();
    });
});
