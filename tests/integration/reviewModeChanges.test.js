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
    it("should update reviewImage for all images in project and return Success: Yes", async () => {
      const sqlSpy = jest.spyOn(queries.project, "sql").mockImplementation((path, sql, params) => {
        if (sql.includes("SELECT COUNT")) {
          return Promise.resolve({ rows: [{ count: 2 }] });
        }
        return Promise.resolve({ row: { success: true } });
      });

      const res = await request(app)
        .post("/toggleAllReview")
        .send({
          PName: "test-project",
          Admin: "testuser",
        })
        .set("Cookie", ["Username=testuser"]);

      expect(res.statusCode).toBe(200);
      expect(res.body.Success).toBe("Yes");
      expect(sqlSpy).toHaveBeenCalledWith(
        expect.stringContaining("test-project"),
        "UPDATE Images SET reviewImage = ?",
        [1]
      );
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
      expect(res.text).toContain('/review?IDX=0&IName=image1.jpg');
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
});
