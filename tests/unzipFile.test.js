const path = require("path");
const fs = require("fs");
const unzipFile = require("../utils/unzipFile");
const StreamZip = require("node-stream-zip");

describe("unzipFile utility", () => {
  const tmpDir = path.join(__dirname, "tmp_unzip_test");
  const outputDir = path.join(tmpDir, "extracted");
  const zipFilePath = path.join(tmpDir, "test.zip");

  beforeAll(async () => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("should extract zip archive and resolve promise", async () => {
    // Create a dummy zip file using node-stream-zip or mock StreamZip async
    // Since node-stream-zip is used inside unzipFile, we can test that unzipFile resolves cleanly
    const mockExtract = jest.fn().mockResolvedValue(undefined);
    const mockClose = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(StreamZip, "async").mockImplementation(() => ({
      extract: mockExtract,
      close: mockClose,
    }));

    // Create empty zip file for fs.existsSync checks
    fs.writeFileSync(zipFilePath, "dummy zip content");

    await expect(unzipFile(zipFilePath, outputDir)).resolves.toBeUndefined();

    expect(mockExtract).toHaveBeenCalledWith(null, outputDir);
    expect(mockClose).toHaveBeenCalled();
  });
});
