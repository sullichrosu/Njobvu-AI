const express = require('express');
const path = require("path");
const cookieParser = require("cookie-parser")
const fileUpload = require("express-fileupload")
global.logger = require("./utils/logger");
const app = express();

const api = require("./routes/api");

const {
    getClassificationPage,
    getLoginPage,
    getSignupPage,
    getHomePage,
    getCreatePage,
    getProjectPage,
    getAnnotatePage,
    getReviewPage,
    getConfigPage,
    getDownloadPage,
    getLabelingPage,
    getStatsPage,
    getTrainingPage,
    getProcessingPage,
    getYolo3SettingsPage,
    getYoloXSettingsPage,
    getServerInfoPage,
    getYoloPage,
    getUserPage,
    getProjectSettingsPage,
    getClassSettingsPage,
    getAccessSettingsPage,
    getImageSettingsPage,
    getMergeSettingsPage,
    getServerStatsPage,
    get404Page,
    getValidationHomePage,
    getValidationProjectPage,
    getValidationLabelingPage,
    getValidationConfigPage,
    getValidationStatsPage,
    getInferencePage,
    getCustomTrainingPage,
    getYoloXInferenceSettingsPage,
    getYoloXTrainingSettingsPage,
    getInceptionSettingsPage,
    getHelpPage,
    getErrorPage,
    getMegadetectorSettingsPage,
} = require("./routes/pages");
const { getHelpApi } = require("./routes/api/help");
const asyncHandler = require("./utils/asyncHandler");

// middleware

app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(global.logger.requestMiddleware);
app.use(express.urlencoded({ extended: false }));
app.use(fileUpload());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());
app.use("/", api);

app.get("/api/v2/help", asyncHandler(getHelpApi));
app.get("/api/help", asyncHandler(getHelpApi));

// Auth & Core Page Routes
app.get("/", asyncHandler(getLoginPage));
app.get("/login", asyncHandler(getLoginPage));
app.get("/signup", asyncHandler(getSignupPage));
app.get("/home", asyncHandler(getHomePage));
app.get("/user", asyncHandler(getUserPage));
app.get("/help", asyncHandler(getHelpPage));
app.get("/error", asyncHandler(getErrorPage));

// Project Page Routes
app.get("/create", asyncHandler(getCreatePage));
app.get("/projects/create", asyncHandler(getCreatePage));
app.get("/project", asyncHandler(getProjectPage));
app.get("/projects", asyncHandler(getProjectPage));
app.get("/project/detail", asyncHandler(getProjectPage));
app.get("/projects/detail", asyncHandler(getProjectPage));

app.get("/annotate", asyncHandler(getAnnotatePage));
app.get("/project/annotate", asyncHandler(getAnnotatePage));
app.get("/projects/annotate", asyncHandler(getAnnotatePage));

app.get("/review", asyncHandler(getReviewPage));
app.get("/project/review", asyncHandler(getReviewPage));
app.get("/projects/review", asyncHandler(getReviewPage));

app.get("/labeling", asyncHandler(getLabelingPage));
app.get("/project/labeling", asyncHandler(getLabelingPage));
app.get("/projects/labeling", asyncHandler(getLabelingPage));

app.get("/stats", asyncHandler(getStatsPage));
app.get("/project/stats", asyncHandler(getStatsPage));
app.get("/projects/stats", asyncHandler(getStatsPage));

app.get("/download", asyncHandler(getDownloadPage));
app.get("/project/download", asyncHandler(getDownloadPage));
app.get("/projects/download", asyncHandler(getDownloadPage));

// Config Page Routes
app.get("/config", asyncHandler(getConfigPage));
app.get("/project/config", asyncHandler(getConfigPage));
app.get("/config/projSettings", asyncHandler(getProjectSettingsPage));
app.get("/config/project-settings", asyncHandler(getProjectSettingsPage));
app.get("/project/config/project-settings", asyncHandler(getProjectSettingsPage));

app.get("/config/classSettings", asyncHandler(getClassSettingsPage));
app.get("/config/class-settings", asyncHandler(getClassSettingsPage));
app.get("/project/config/class-settings", asyncHandler(getClassSettingsPage));

app.get("/config/accessSettings", asyncHandler(getAccessSettingsPage));
app.get("/config/access-settings", asyncHandler(getAccessSettingsPage));
app.get("/project/config/access-settings", asyncHandler(getAccessSettingsPage));

app.get("/config/imageSettings", asyncHandler(getImageSettingsPage));
app.get("/config/image-settings", asyncHandler(getImageSettingsPage));
app.get("/project/config/image-settings", asyncHandler(getImageSettingsPage));

app.get("/config/mergeSettings", asyncHandler(getMergeSettingsPage));
app.get("/config/merge-settings", asyncHandler(getMergeSettingsPage));
app.get("/project/config/merge-settings", asyncHandler(getMergeSettingsPage));

// Training & Inference Page Routes
app.get("/training", asyncHandler(getTrainingPage));
app.get("/project/training", asyncHandler(getTrainingPage));
app.get("/projects/training", asyncHandler(getTrainingPage));

app.get("/customTraining", asyncHandler(getCustomTrainingPage));
app.get("/training/custom", asyncHandler(getCustomTrainingPage));
app.get("/project/training/custom", asyncHandler(getCustomTrainingPage));

app.get("/createClassification", asyncHandler(getClassificationPage));
app.get("/training/create-classification", asyncHandler(getClassificationPage));
app.get("/project/training/create-classification", asyncHandler(getClassificationPage));

app.get("/processing", asyncHandler(getProcessingPage));
app.get("/project/processing", asyncHandler(getProcessingPage));

app.get("/inference", asyncHandler(getInferencePage));
app.get("/project/inference", asyncHandler(getInferencePage));
app.get("/projects/inference", asyncHandler(getInferencePage));

app.get("/yolo", asyncHandler(getYoloPage));
app.get("/inference/yolo", asyncHandler(getYoloPage));
app.get("/project/inference/yolo", asyncHandler(getYoloPage));

app.get("/yolo/yolov3Settings", asyncHandler(getYolo3SettingsPage));
app.get("/yolo/v3-settings", asyncHandler(getYolo3SettingsPage));
app.get("/inference/v3-settings", asyncHandler(getYolo3SettingsPage));
app.get("/project/inference/v3-settings", asyncHandler(getYolo3SettingsPage));

app.get("/yolo/yolovXSettings", asyncHandler(getYoloXSettingsPage));
app.get("/yolo/vx-settings", asyncHandler(getYoloXSettingsPage));
app.get("/inference/vx-settings", asyncHandler(getYoloXSettingsPage));
app.get("/project/inference/vx-settings", asyncHandler(getYoloXSettingsPage));

app.get("/yolo/yolovXInferenceSettings", asyncHandler(getYoloXInferenceSettingsPage));
app.get("/yolo/vx-inference-settings", asyncHandler(getYoloXInferenceSettingsPage));
app.get("/inference/vx-inference-settings", asyncHandler(getYoloXInferenceSettingsPage));
app.get("/project/inference/vx-inference-settings", asyncHandler(getYoloXInferenceSettingsPage));

app.get("/yolo/yolovXTrainingSettings", asyncHandler(getYoloXTrainingSettingsPage));
app.get("/yolo/vx-training-settings", asyncHandler(getYoloXTrainingSettingsPage));
app.get("/training/vx-training-settings", asyncHandler(getYoloXTrainingSettingsPage));
app.get("/project/training/vx-training-settings", asyncHandler(getYoloXTrainingSettingsPage));

app.get("/inference/inceptionSettings", asyncHandler(getInceptionSettingsPage));
app.get("/inference/inception-settings", asyncHandler(getInceptionSettingsPage));
app.get("/project/inference/inception-settings", asyncHandler(getInceptionSettingsPage));

app.get("/megadetector/settings", asyncHandler(getMegadetectorSettingsPage));
app.get("/inference/megadetector-settings", asyncHandler(getMegadetectorSettingsPage));
app.get("/project/inference/megadetector-settings", asyncHandler(getMegadetectorSettingsPage));

// Server Info & Stats Routes
app.get("/servstats", asyncHandler(getServerStatsPage));
app.get("/server-stats", asyncHandler(getServerStatsPage));
app.get("/project/server-stats", asyncHandler(getServerStatsPage));
app.get("/serverinfo", asyncHandler(getServerInfoPage));
app.get("/server/info", asyncHandler(getServerInfoPage));

// Validation Page Routes
app.get("/homeV", asyncHandler(getValidationHomePage));
app.get("/validation/home", asyncHandler(getValidationHomePage));
app.get("/projectV", asyncHandler(getValidationProjectPage));
app.get("/validation/project", asyncHandler(getValidationProjectPage));
app.get("/labelingV", asyncHandler(getValidationLabelingPage));
app.get("/validation/labeling", asyncHandler(getValidationLabelingPage));
app.get("/configV", asyncHandler(getValidationConfigPage));
app.get("/validation/config", asyncHandler(getValidationConfigPage));
app.get("/statsV", asyncHandler(getValidationStatsPage));
app.get("/validation/stats", asyncHandler(getValidationStatsPage));

app.get("/api/gpuinfo");

app.get("*", asyncHandler(get404Page));

app.use((err, req, res, next) => {
    global.logger.error("Unhandled route error:", { path: req.path, error: err.message, stack: err.stack });

    if (res.headersSent) {
        return next(err);
    }

    if (req.accepts(["html", "json"]) === "json") {
        return res.status(500).json({ Success: "No", error: err.message });
    }

    res.redirect(`/error?error=${encodeURIComponent(err.message || "Internal Server Error")}`);
});

module.exports = app;
