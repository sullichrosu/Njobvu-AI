const path = require("path");
const request = require("supertest");
const app = require("../../app");
const queries = require("../../queries/queries");

jest.mock("decompress-zip", () => jest.fn());
jest.mock("decompress-zip/lib/extractors", () => ({
  folder: jest.fn(),
}));
jest.mock("ffmpeg", () => jest.fn());
jest.mock("sharp", () => jest.fn());
jest.mock("unzipper", () => jest.fn());
jest.mock("child_process", () => ({
  exec: jest.fn(),
}));
jest.mock("node-fetch", () => jest.fn());

jest.mock("fs", () => {
  const actualFs = jest.requireActual("fs");
  return {
    ...actualFs,
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn((filePath, options) => {
      if (typeof filePath === "string" && (filePath.endsWith(".jpg") || filePath.endsWith(".png"))) {
        return Buffer.from("dummy image content");
      }
      return actualFs.readFileSync(filePath, options);
    }),
  };
});

jest.mock("probe-image-size", () => ({
  sync: jest.fn(() => ({ width: 800, height: 600 })),
}));

describe("Review Mode Changes & Preservation Integration Tests", () => {
  beforeAll(() => {
    global.db = {
      runAsync: jest.fn().mockResolvedValue(undefined),
      allAsync: jest.fn().mockResolvedValue([
        {
          PName: "test-project",
          Admin: "testuser",
          Username: "testuser",
          Validate: 0,
        },
      ]),
      getAsync: jest.fn().mockResolvedValue({
        PName: "test-project",
        Admin: "testuser",
        AutoSave: 0,
        Validate: 0,
      }),
    };
    global.managedDbClient = {
      all: jest.fn().mockResolvedValue({
        rows: [
          {
            PName: "test-project",
            Admin: "testuser",
            Username: "testuser",
            Validate: 0,
          },
        ],
      }),
      get: jest.fn().mockResolvedValue({
        row: {
          PName: "test-project",
          Admin: "testuser",
          AutoSave: 0,
          Validate: 0,
        },
      }),
      run: jest.fn().mockResolvedValue({ lastID: 1, changes: 1 }),
    };
    global.currentPath = process.cwd() + "/";
    global.colorsJSON = ["#FF0000", "#00FF00"];
    global.probe = {
      sync: jest.fn(() => ({ width: 800, height: 600 })),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /changeValidation state preservation", () => {
    it("should toggle project Validate state without modifying individual image reviewImage records", async () => {
      const sqlSpy = jest.spyOn(queries.managed, "sql").mockResolvedValue({ row: { success: true } });
      const projSqlSpy = jest.spyOn(queries.project, "sql").mockResolvedValue({ row: { success: true } });

      const res = await request(app)
        .post("/changeValidation")
        .send({
          PName: "test-project",
          Admin: "testuser",
          validMode: 0,
        })
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ Success: "Yes" });

      expect(sqlSpy).toHaveBeenCalledWith(
        "UPDATE Projects SET Validate = ? WHERE PName = ? AND Admin = ?",
        [1, "test-project", "testuser"]
      );

      expect(projSqlSpy).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("UPDATE Images SET reviewImage")
      );
    });
  });

  describe("POST /toggleAllReview", () => {
    beforeEach(() => {
      // An earlier test in this file leaves queries.project.sql permanently
      // mocked (jest.clearAllMocks() clears call history but not spy
      // implementations), which would otherwise silently swallow the real
      // UPDATE call below. Restore it so these tests exercise the real code path.
      if (queries.project.sql.mockRestore) {
        queries.project.sql.mockRestore();
      }
    });

    it("should update reviewImage for all images in project and return Success: Yes", async () => {
      // getDbClient reads live rows via db.all (unlike queries.project.sql, which
      // always calls db.run and never returns rows) — mock at that layer so the
      // real "any images still unreviewed?" count logic in the route is exercised.
      const projectPath = path.join(process.cwd(), "public", "projects", "testuser-test-project");
      const mockDb = {
        all: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }),
        run: jest.fn().mockResolvedValue({ success: true, changes: 2 }),
      };
      global.projectDbClients = { [projectPath]: mockDb };

      const res = await request(app)
        .post("/toggleAllReview")
        .send({
          PName: "test-project",
          Admin: "testuser",
        })
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ Success: "Yes", newState: 1 });
      expect(mockDb.all).toHaveBeenCalledWith("SELECT COUNT(*) as count FROM Images WHERE reviewImage = 0");
      expect(mockDb.run).toHaveBeenCalledWith("UPDATE Images SET reviewImage = ?", [1]);

      delete global.projectDbClients;
    });

    it("should turn review off when no images are unreviewed (regression: count query must read real rows)", async () => {
      const projectPath = path.join(process.cwd(), "public", "projects", "testuser-test-project");
      const mockDb = {
        all: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }),
        run: jest.fn().mockResolvedValue({ success: true, changes: 2 }),
      };
      global.projectDbClients = { [projectPath]: mockDb };

      const res = await request(app)
        .post("/toggleAllReview")
        .send({
          PName: "test-project",
          Admin: "testuser",
        })
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ Success: "Yes", newState: 0 });
      expect(mockDb.run).toHaveBeenCalledWith("UPDATE Images SET reviewImage = ?", [0]);

      delete global.projectDbClients;
    });

    it("should accept explicit state parameter", async () => {
      const sqlSpy = jest.spyOn(queries.project, "sql").mockResolvedValue({ row: { success: true } });

      const res = await request(app)
        .post("/api/projects/toggleAllReview")
        .send({
          PName: "test-project",
          Admin: "testuser",
          state: 0,
        })
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ Success: "Yes", newState: 0 });
      expect(sqlSpy).toHaveBeenCalledWith(
        expect.stringContaining("test-project"),
        "UPDATE Images SET reviewImage = ?",
        [0]
      );
    });
  });

  describe("GET /project with Review buttons", () => {
    it("should render Review button for images flagged with reviewImage", async () => {
      const sqlite3 = require("sqlite3");
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          if (sql.includes("FROM Images")) {
            if (callback) callback(null, [
              { IName: "image1.jpg", reviewImage: 1, validateImage: 0, numLabels: 2 },
              { IName: "image2.jpg", reviewImage: 0, validateImage: 0, numLabels: 0 },
            ]);
          } else {
            if (callback) callback(null, []);
          }
        }),
        close: jest.fn((cb) => cb && cb(null)),
      };
      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });

      const res = await request(app)
        .get("/project?IDX=0")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain("Toggle Review All");
      // Review button must jump straight into the validation labeling page for
      // that image, not the class-based review page (which shows the whole class).
      expect(res.text).toContain('/labelingV?IDX=0&IName=image1.jpg');
      expect(res.text).not.toContain('/review?IDX=0&IName=image1.jpg');
      expect(res.text).toContain("Review");
    });
  });

  describe("GET /annotate with reviewFilter scrolling", () => {
    it("should filter navigation images to only those needing review when reviewFilter=true", async () => {
      const sqlite3 = require("sqlite3");
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          const s = String(sql);
          if (s.includes("reviewImage != 0")) {
            if (callback) callback(null, [
              { IName: "image1.jpg", reviewImage: 1 },
              { IName: "image3.jpg", reviewImage: 1 },
            ]);
          } else if (s.includes("Classes")) {
            if (callback) callback(null, [{ CName: "class1" }]);
          } else if (s.includes("IName =") && s.includes("Images")) {
            if (callback) callback(null, [{ IName: "image1.jpg", reviewImage: 1 }]);
          } else if (s.includes("Labels")) {
            if (callback) callback(null, []);
          } else {
            if (callback) callback(null, [
              { IName: "image1.jpg", reviewImage: 1 },
              { IName: "image2.jpg", reviewImage: 0 },
              { IName: "image3.jpg", reviewImage: 1 },
            ]);
          }
        }),
        get: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          if (callback) callback(null, { AutoSave: 0 });
        }),
        close: jest.fn((cb) => cb && cb(null)),
      };

      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });

      const res = await request(app)
        .get("/annotate?IDX=0&IName=image1.jpg&reviewFilter=true")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain("IName=image3.jpg");
      expect(res.text).toContain("reviewFilter=true");
    });
  });

  describe("GET /review image rendering", () => {
    function mockReviewDb(overrides) {
      const sqlite3 = require("sqlite3");
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          const s = String(sql);
          if (!callback) return;

          if (s.includes("NOT IN (SELECT IName FROM Labels)")) {
            return callback(null, overrides.unlabeled || []);
          }
          if (s.includes("INNER JOIN Labels")) {
            return callback(null, overrides.labeledImages || []);
          }
          if (s.includes("SELECT CName FROM Labels WHERE IName")) {
            return callback(null, overrides.classForIName || []);
          }
          if (s.includes("SELECT CName FROM Classes")) {
            return callback(null, overrides.defaultClass || []);
          }
          if (s.includes("SELECT * FROM Labels WHERE IName")) {
            return callback(null, overrides.imageLabels || []);
          }
          if (s.includes("Classes")) {
            return callback(null, overrides.classes || []);
          }
          return callback(null, []);
        }),
        close: jest.fn((cb) => cb && cb(null)),
      };
      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });
      return dbMock;
    }

    it("routes labeled images through the TIFF/SCN-aware crop-canvas loader instead of a plain <img>", async () => {
      mockReviewDb({
        labeledImages: [{ IName: "img1.tif" }],
        imageLabels: [{ LID: 1, CName: "cat", X: "0", Y: "0", W: 50, H: 50, IName: "img1.tif" }],
        classes: [{ CName: "cat" }],
      });

      const res = await request(app)
        .get("/review?class=cat&IDX=0")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain("libraries/tiffjs/tiff.min.js");
      expect(res.text).toContain("loadImageSmart");
      expect(res.text).toContain('class="cropCanvas"');
    });

    it("routes unlabeled images through the same crop-canvas pipeline (not the old plain <img> path) so TIFF/SCN can decode", async () => {
      mockReviewDb({
        classForIName: [],
        unlabeled: [{ IName: "img2.tif" }],
        classes: [{ CName: "cat" }],
      });

      const res = await request(app)
        .get("/review?IDX=0&IName=img2.tif")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).not.toContain('class="UnlabeledImage"');
      expect(res.text).toContain('class="cropCanvas"');
    });
  });

  describe("footer.ejs canvas-image script loading", () => {
    // getValidationLabelingPage (labelingV.ejs) and getLabelingPage (labeling.ejs,
    // an unrelated class-summary page with no canvas) used to both pass
    // title: "labeling", and footer.ejs only loaded flabeling.js/tiff.js for
    // title === "annotate" — so labelingV's fabric canvas never got the script
    // that sets its background image, and images never rendered. Fixed by giving
    // the validation labeling page its own "labelingV" title.
    const ejs = require("ejs");
    const footerPath = path.join(__dirname, "../../views/includes/footer.ejs");

    it("loads the TIFF/fabric canvas scripts for the validation labeling page (labelingV)", async () => {
      const html = await ejs.renderFile(footerPath, { title: "labelingV" });
      expect(html).toContain("libraries/tiffjs/tiff.min.js");
      expect(html).toContain("js/flabeling.js");
    });

    it("still loads them for the annotate page", async () => {
      const html = await ejs.renderFile(footerPath, { title: "annotate" });
      expect(html).toContain("libraries/tiffjs/tiff.min.js");
      expect(html).toContain("js/flabeling.js");
    });

    it("does not load them for the unrelated class-summary labeling page (no canvas)", async () => {
      const html = await ejs.renderFile(footerPath, { title: "labeling" });
      expect(html).not.toContain("libraries/tiffjs/tiff.min.js");
      expect(html).not.toContain("js/flabeling.js");
    });
  });

  describe("GET /labelingV filtered prev/next navigation", () => {
    // curr_index used to come from a ROW_NUMBER() query over the *entire*
    // unfiltered Images table, while prev/next indexed into results2 (a
    // filtered/sorted subset, e.g. sort=needs_review). Once a filter shrank
    // results2 below the image's global row number, results2[curr_index - 2]
    // or results2[curr_index] went out of bounds and the whole process crashed
    // with an uncaught TypeError. Regression covers a 6-image project where
    // the "needs review" image under test is the 4th row globally, but only
    // the 2nd of 3 in the filtered set.
    function mockLabelingVDb() {
      const sqlite3 = require("sqlite3");
      // getValidationLabelingPage.js references the bare `sqlite3`/`fs`
      // globals (set by server.js in production) rather than local requires.
      global.sqlite3 = sqlite3;
      global.fs = require("fs");
      const allImages = [
        { IName: "c1.png", reviewImage: 0, validateImage: 0 },
        { IName: "c2.png", reviewImage: 1, validateImage: 0 },
        { IName: "c3.png", reviewImage: 0, validateImage: 0 },
        { IName: "c4.png", reviewImage: 1, validateImage: 0 },
        { IName: "c5.png", reviewImage: 0, validateImage: 0 },
        { IName: "c6.png", reviewImage: 1, validateImage: 0 },
      ];
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          const s = String(sql);
          if (!callback) return;

          if (s.includes("FROM `Classes`")) return callback(null, [{ CName: "cat" }]);
          if (s.includes("WHERE reviewImage=1")) return callback(null, allImages.filter((img) => img.reviewImage === 1));
          if (s.includes("UPDATE Images SET reviewImage")) return callback(null, []);
          if (s.includes("FROM `Labels` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images` WHERE IName")) {
            const match = s.match(/IName = '([^']+)'/);
            const img = allImages.find((i) => i.IName === (match && match[1]));
            return callback(null, img ? [img] : []);
          }
          if (s.includes("FROM `Validation` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images`")) return callback(null, allImages);
          return callback(null, []);
        }),
        get: jest.fn((sql, cb) => cb && cb(null, {})),
        close: jest.fn((cb) => cb && cb(null)),
      };
      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });
      return dbMock;
    }

    it("does not crash and returns the correct filtered neighbors for a middle needs_review image", async () => {
      const mockDb = mockLabelingVDb();

      const res = await request(app)
        .get("/labelingV?IDX=0&IName=c4.png&sort=needs_review")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('name="prev_IName" value="c2.png"');
      expect(res.text).toContain('name="next_IName" value="c6.png"');
      expect(res.text).toContain('id="prev"');
      expect(res.text).toContain('id="next"');
      expect(res.text).toContain('sort=needs_review');
      // Assert GET request does NOT issue DB update to clear reviewImage
      expect(mockDb.all).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE Images SET reviewImage"));
    });

    it("still resolves correct neighbors with no filter active", async () => {
      mockLabelingVDb();

      const res = await request(app)
        .get("/labelingV?IDX=0&IName=c3.png")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.text).toContain('name="prev_IName" value="c2.png"');
      expect(res.text).toContain('name="next_IName" value="c4.png"');
    });

    it("redirects to projectV when requested image is not in filtered results2 set and results2 is empty", async () => {
      const sqlite3 = require("sqlite3");
      global.sqlite3 = sqlite3;
      global.fs = require("fs");
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          const s = String(sql);
          if (!callback) return;

          if (s.includes("FROM `Classes`")) return callback(null, [{ CName: "cat" }]);
          if (s.includes("WHERE reviewImage=1")) return callback(null, []); // No review images left!
          if (s.includes("UPDATE Images SET reviewImage")) return callback(null, []);
          if (s.includes("FROM `Labels` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images` WHERE IName")) {
            return callback(null, [{ IName: "c1.png", reviewImage: 0, validateImage: 0 }]);
          }
          if (s.includes("FROM `Validation` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images`")) return callback(null, []);
          return callback(null, []);
        }),
        get: jest.fn((sql, cb) => cb && cb(null, {})),
        close: jest.fn((cb) => cb && cb(null)),
      };
      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });

      const res = await request(app)
        .get("/labelingV?IDX=0&IName=c1.png&sort=needs_review")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/projectV?IDX=0&page=1&perPage=10&sort=needs_review");
    });

    it("redirects to next available filtered image when requested image does not match active filter but other images exist", async () => {
      const sqlite3 = require("sqlite3");
      global.sqlite3 = sqlite3;
      global.fs = require("fs");
      const dbMock = {
        all: jest.fn((sql, params, cb) => {
          const callback = typeof params === "function" ? params : (typeof cb === "function" ? cb : null);
          const s = String(sql);
          if (!callback) return;

          if (s.includes("FROM `Classes`")) return callback(null, [{ CName: "cat" }]);
          if (s.includes("WHERE reviewImage=1")) return callback(null, [{ IName: "c2.png", reviewImage: 1 }]);
          if (s.includes("UPDATE Images SET reviewImage")) return callback(null, []);
          if (s.includes("FROM `Labels` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images` WHERE IName")) {
            return callback(null, [{ IName: "c1.png", reviewImage: 0, validateImage: 0 }]);
          }
          if (s.includes("FROM `Validation` WHERE IName")) return callback(null, []);
          if (s.includes("FROM `Images`")) return callback(null, []);
          return callback(null, []);
        }),
        get: jest.fn((sql, cb) => cb && cb(null, {})),
        close: jest.fn((cb) => cb && cb(null)),
      };
      jest.spyOn(sqlite3, "Database").mockImplementation((dbPath, cb) => {
        if (cb) cb(null);
        return dbMock;
      });

      const res = await request(app)
        .get("/labelingV?IDX=0&IName=c1.png&sort=needs_review")
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain("/labelingV?IDX=0&IName=c2.png&curr_class=cat&sort=needs_review");
    });
  });
});
