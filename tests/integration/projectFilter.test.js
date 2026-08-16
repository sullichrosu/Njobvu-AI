const request = require("supertest");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const app = require("../../app");
const queries = require("../../queries/queries");

describe("Project & Image Sorting / Filtering API & Page Integration Tests", () => {
    const testUsername = "testuser_filter_arch";
    const testProjectName = "filter_test_project";
    const testAdmin = "testuser_filter_arch";

    beforeAll(async () => {
        if (global.managedDbClient) {
            await global.managedDbClient.run(
                "INSERT OR IGNORE INTO Users (Username, Password, FirstName, LastName, Email) VALUES (?, ?, ?, ?, ?)",
                [testUsername, "hash", "Test", "User", "test@example.com"]
            );
            await global.managedDbClient.run(
                "INSERT OR IGNORE INTO Projects (PName, PDescription, AutoSave, Admin, Validate) VALUES (?, ?, ?, ?, ?)",
                [testProjectName, "Test Description", 0, testAdmin, 0]
            );
            await global.managedDbClient.run(
                "INSERT OR IGNORE INTO Access (Username, PName, Admin) VALUES (?, ?, ?)",
                [testUsername, testProjectName, testAdmin]
            );
        }
    });

    beforeEach(() => {
        global.managedDbClient = {
            all: jest.fn().mockImplementation((sql, params) => {
                if (sql && sql.includes("Access")) {
                    return Promise.resolve({ success: true, rows: [{ Username: testUsername, PName: testProjectName, Admin: testAdmin }] });
                }
                return Promise.resolve({ success: true, rows: [] });
            }),
            get: jest.fn().mockImplementation((sql, params) => {
                if (sql && sql.includes("Projects")) {
                    return Promise.resolve({ success: true, row: { PName: testProjectName, Admin: testAdmin, AutoSave: 0, Validate: 0 } });
                }
                return Promise.resolve({ success: true, row: null });
            }),
            run: jest.fn().mockResolvedValue({ success: true, changes: 1 }),
        };
        global.db = {
            allAsync: jest.fn().mockImplementation((sql) => {
                if (sql && sql.includes("Access")) {
                    return Promise.resolve([{ Username: testUsername, PName: testProjectName, Admin: testAdmin }]);
                }
                return Promise.resolve([]);
            }),
            getAsync: jest.fn().mockImplementation((sql) => {
                if (sql && sql.includes("Projects")) {
                    return Promise.resolve({ PName: testProjectName, Admin: testAdmin, AutoSave: 0, Validate: 0 });
                }
                return Promise.resolve(null);
            }),
            runAsync: jest.fn().mockResolvedValue(undefined),
        };
    });

    describe("GET /api/v2/projects", () => {
        it("should return 401 when no username is provided", async () => {
            const res = await request(app).get("/api/v2/projects");
            expect(res.statusCode).toBe(401);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toHaveProperty("success", false);
            expect(res.body).toHaveProperty("error");
        });

        it("should return 200 with structured JSON when authenticated via Cookie", async () => {
            const res = await request(app)
                .get("/api/v2/projects")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toMatch(/json/);
            expect(res.body).toHaveProperty("success", true);
            expect(res.body).toHaveProperty("projects");
            expect(res.body).toHaveProperty("total");
            expect(res.body).toHaveProperty("page");
            expect(res.body).toHaveProperty("perPage");
            expect(Array.isArray(res.body.projects)).toBe(true);
        });

        it("should support search filtering by project name", async () => {
            const res = await request(app)
                .get(`/api/v2/projects?search=${testProjectName}`)
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            const found = res.body.projects.some(p => p.PName === testProjectName);
            expect(found).toBe(true);
        });

        it("should filter out non-matching search queries", async () => {
            const res = await request(app)
                .get("/api/v2/projects?search=nonexistent_project_name_xyz")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.projects.length).toBe(0);
        });

        it("should support sorting by name ascending and descending", async () => {
            const resAsc = await request(app)
                .get("/api/v2/projects?sortBy=name&sortOrder=asc")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(resAsc.statusCode).toBe(200);

            const resDesc = await request(app)
                .get("/api/v2/projects?sortBy=name&sortOrder=desc")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(resDesc.statusCode).toBe(200);
        });

        it("should support filtering by needsReview status", async () => {
            const res = await request(app)
                .get("/api/v2/projects?needsReview=true")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe("GET /api/v2/projects/:IDX/images", () => {
        it("should return 401 when no username cookie is present", async () => {
            const res = await request(app).get("/api/v2/projects/0/images");
            expect(res.statusCode).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it("should return 400 when IDX is invalid or out of bounds", async () => {
            const res = await request(app)
                .get("/api/v2/projects/99999/images")
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(400);
            expect(res.body.success).toBe(false);
        });
    });

    describe("GET /home with search & filter params", () => {
        it("should render 200 HTML page with search query params", async () => {
            const res = await request(app)
                .get(`/home?search=${testProjectName}&sortBy=name&sortOrder=asc`)
                .set("Cookie", [`Username=${testUsername}`]);

            expect(res.statusCode).toBe(200);
            expect(res.headers["content-type"]).toMatch(/html/);
        }, 15000);
    });

    describe("Unit tests for filter functions in queries module", () => {
        it("queries.managed.filterProjects should correctly filter and sort project arrays", () => {
            const sampleProjects = [
                [{ PName: "BetaProject", Admin: "alice" }, 0, 0, 10, 50, 5],
                [{ PName: "AlphaProject", Admin: "bob" }, 1, 1, 5, 100, 10],
                [{ PName: "GammaProject", Admin: "charlie" }, 2, 0, 20, 10, 2],
            ];

            // Search filter
            const searched = queries.managed.filterProjects(sampleProjects, { search: "alpha" });
            expect(searched.length).toBe(1);
            expect(searched[0][0].PName).toBe("AlphaProject");

            // Needs review filter
            const reviewOnly = queries.managed.filterProjects(sampleProjects, { needsReview: "true" });
            expect(reviewOnly.length).toBe(1);
            expect(reviewOnly[0][0].PName).toBe("AlphaProject");

            // Sort by name asc
            const sortedNameAsc = queries.managed.filterProjects(sampleProjects, { sortBy: "name", sortOrder: "asc" });
            expect(sortedNameAsc[0][0].PName).toBe("AlphaProject");
            expect(sortedNameAsc[2][0].PName).toBe("GammaProject");

            // Sort by numImages desc
            const sortedImagesDesc = queries.managed.filterProjects(sampleProjects, { sortBy: "numImages", sortOrder: "desc" });
            expect(sortedImagesDesc[0][0].PName).toBe("GammaProject");
            expect(sortedImagesDesc[2][0].PName).toBe("AlphaProject");
        });

        it("queries.project.filterImages should correctly filter and sort image arrays", () => {
            const sampleImages = [
                { IName: "b_img.jpg", reviewImage: 1, validateImage: 0, numLabels: 3 },
                { IName: "a_img.jpg", reviewImage: 0, validateImage: 1, numLabels: 0 },
                { IName: "c_img.jpg", reviewImage: 0, validateImage: 0, numLabels: 10 },
            ];

            // Search filter
            const searched = queries.project.filterImages(sampleImages, { search: "a_img" });
            expect(searched.length).toBe(1);
            expect(searched[0].IName).toBe("a_img.jpg");

            // Review filter
            const reviewOnly = queries.project.filterImages(sampleImages, { review: "1" });
            expect(reviewOnly.length).toBe(1);
            expect(reviewOnly[0].IName).toBe("b_img.jpg");

            // Labeled filter
            const labeledOnly = queries.project.filterImages(sampleImages, { labeled: "labeled" });
            expect(labeledOnly.length).toBe(2);

            const unlabeledOnly = queries.project.filterImages(sampleImages, { labeled: "unlabeled" });
            expect(unlabeledOnly.length).toBe(1);
            expect(unlabeledOnly[0].IName).toBe("a_img.jpg");

            // Sort by numLabels desc
            const sortedLabelsDesc = queries.project.filterImages(sampleImages, { sortBy: "numLabels", sortOrder: "desc" });
            expect(sortedLabelsDesc[0].IName).toBe("c_img.jpg");
        });
    });
});
