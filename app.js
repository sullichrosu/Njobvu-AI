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

app.get("/", asyncHandler(getLoginPage));
app.get("/signup", asyncHandler(getSignupPage));
app.get("/home", asyncHandler(getHomePage));
app.get("/help", asyncHandler(getHelpPage));
app.get("/create", asyncHandler(getCreatePage));
app.get("/annotate", asyncHandler(getAnnotatePage));
app.get("/review", asyncHandler(getReviewPage));
app.get("/project", asyncHandler(getProjectPage));
app.get("/config", asyncHandler(getConfigPage));
app.get("/config/projSettings", asyncHandler(getProjectSettingsPage));
app.get("/config/classSettings", asyncHandler(getClassSettingsPage));
app.get("/config/accessSettings", asyncHandler(getAccessSettingsPage));
app.get("/config/imageSettings", asyncHandler(getImageSettingsPage));
app.get("/config/mergeSettings", asyncHandler(getMergeSettingsPage));
app.get("/download", asyncHandler(getDownloadPage));
app.get("/labeling", asyncHandler(getLabelingPage));
app.get("/stats", asyncHandler(getStatsPage));
app.get("/customTraining", asyncHandler(getCustomTrainingPage));
app.get("/training", asyncHandler(getTrainingPage));
app.get("/inference", asyncHandler(getInferencePage));
app.get("/yolo", asyncHandler(getYoloPage));
app.get("/yolo/yolov3Settings", asyncHandler(getYolo3SettingsPage));
app.get("/yolo/yolovXSettings", asyncHandler(getYoloXSettingsPage));
app.get("/yolo/yolovXInferenceSettings", asyncHandler(getYoloXInferenceSettingsPage));
app.get("/yolo/yolovXTrainingSettings", asyncHandler(getYoloXTrainingSettingsPage));
app.get("/inference/inceptionSettings", asyncHandler(getInceptionSettingsPage));
app.get("/megadetector/settings", asyncHandler(getMegadetectorSettingsPage));
app.get("/user", asyncHandler(getUserPage));
app.get("/servstats", asyncHandler(getServerStatsPage));
app.get("/homeV", asyncHandler(getValidationHomePage));
app.get("/projectV", asyncHandler(getValidationProjectPage));
app.get("/labelingV", asyncHandler(getValidationLabelingPage));
app.get("/configV", asyncHandler(getValidationConfigPage));
app.get("/statsV", asyncHandler(getValidationStatsPage));
app.get("/createClassification", asyncHandler(getClassificationPage));
app.get("/api/gpuinfo");
app.get("/error", asyncHandler(getErrorPage));

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
