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
} = require("./routes/pages");

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


app.get("/", getLoginPage);
app.get("/signup", getSignupPage);
app.get("/home", getHomePage);
app.get("/create", getCreatePage);
app.get("/annotate", getAnnotatePage);
app.get("/review", getReviewPage);
app.get("/project", getProjectPage);
app.get("/config", getConfigPage);
app.get("/config/projSettings", getProjectSettingsPage);
app.get("/config/classSettings", getClassSettingsPage);
app.get("/config/accessSettings", getAccessSettingsPage);
app.get("/config/imageSettings", getImageSettingsPage);
app.get("/config/mergeSettings", getMergeSettingsPage);
app.get("/download", getDownloadPage);
app.get("/labeling", getLabelingPage);
app.get("/stats", getStatsPage);
app.get("/customTraining", getCustomTrainingPage);
app.get("/training", getTrainingPage);
app.get("/inference", getInferencePage);
app.get("/yolo", getYoloPage);
app.get("/yolo/yolov3Settings", getYolo3SettingsPage);
app.get("/yolo/yolovXSettings", getYoloXSettingsPage);
app.get("/yolo/yolovXInferenceSettings", getYoloXInferenceSettingsPage);
app.get("/yolo/yolovXTrainingSettings", getYoloXTrainingSettingsPage);
app.get("/inference/inceptionSettings", getInceptionSettingsPage);
app.get("/user", getUserPage);
app.get("/servstats", getServerStatsPage);
app.get("/homeV", getValidationHomePage);
app.get("/projectV", getValidationProjectPage);
app.get("/labelingV", getValidationLabelingPage);
app.get("/configV", getValidationConfigPage);
app.get("/statsV", getValidationStatsPage);
app.get("/createClassification", getClassificationPage);
app.get("/api/gpuinfo");

app.get("*", get404Page);

module.exports = app;
