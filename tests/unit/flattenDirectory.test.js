const path = require("path");
const fs = require("fs");
const flattenDirectory = require("../../utils/flattenDirectory");

describe("flattenDirectory utility", () => {
    const testDir = path.join(__dirname, "tmp_flatten_test");

    beforeEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it("should flatten images in nested subfolders and remove empty subdirectories", async () => {
        // Setup folder structure:
        // testDir/
        //   ├── root_img.jpg
        //   ├── folderA/
        //   │   ├── sub1.png
        //   │   └── nested/
        //   │       └── sub2.jpeg
        //   └── __MACOSX/
        //       └── ._junk
        const folderA = path.join(testDir, "folderA");
        const nested = path.join(folderA, "nested");
        const macos = path.join(testDir, "__MACOSX");

        fs.mkdirSync(nested, { recursive: true });
        fs.mkdirSync(macos, { recursive: true });

        fs.writeFileSync(path.join(testDir, "root_img.jpg"), "fake jpg");
        fs.writeFileSync(path.join(folderA, "sub 1.png"), "fake png");
        fs.writeFileSync(path.join(nested, "sub2.jpeg"), "fake jpeg");
        fs.writeFileSync(path.join(macos, "._junk"), "macos junk");
        fs.writeFileSync(path.join(folderA, ".DS_Store"), "ds store");

        const result = await flattenDirectory(testDir);

        expect(result.sort()).toEqual(["root_img.jpg", "sub_1.png", "sub2.jpeg"].sort());
        expect(fs.existsSync(path.join(testDir, "root_img.jpg"))).toBe(true);
        expect(fs.existsSync(path.join(testDir, "sub_1.png"))).toBe(true);
        expect(fs.existsSync(path.join(testDir, "sub2.jpeg"))).toBe(true);

        // Subdirectories should be removed
        expect(fs.existsSync(folderA)).toBe(false);
        expect(fs.existsSync(macos)).toBe(false);
    });

    it("should handle filename collisions when images in different subfolders have the same name", async () => {
        const folder1 = path.join(testDir, "sub1");
        const folder2 = path.join(testDir, "sub2");

        fs.mkdirSync(folder1, { recursive: true });
        fs.mkdirSync(folder2, { recursive: true });

        fs.writeFileSync(path.join(folder1, "image.jpg"), "content 1");
        fs.writeFileSync(path.join(folder2, "image.jpg"), "content 2");

        const result = await flattenDirectory(testDir);

        expect(result.length).toBe(2);
        expect(result).toContain("image.jpg");
        expect(fs.existsSync(path.join(testDir, "image.jpg"))).toBe(true);

        // Subdirectories should be cleaned up
        expect(fs.existsSync(folder1)).toBe(false);
        expect(fs.existsSync(folder2)).toBe(false);
    });

    it("should remove non-image files inside subfolders", async () => {
        const sub = path.join(testDir, "sub");
        fs.mkdirSync(sub, { recursive: true });

        fs.writeFileSync(path.join(sub, "valid.png"), "valid image");
        fs.writeFileSync(path.join(sub, "readme.txt"), "text file");

        const result = await flattenDirectory(testDir);

        expect(result).toEqual(["valid.png"]);
        expect(fs.existsSync(path.join(testDir, "valid.png"))).toBe(true);
        expect(fs.existsSync(path.join(testDir, "readme.txt"))).toBe(false);
    });
});
