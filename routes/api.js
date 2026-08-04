const { error, time } = require("console");
const { SSL_OP_EPHEMERAL_RSA } = require("constants");
const DecompressZip = require("decompress-zip");
const express = require("express");
const { existsSync, readdirSync } = require("fs");
const { async } = require("node-stream-zip");
const StreamZip = require("node-stream-zip");
const { protocol } = require("socket.io-client");
const { OPEN_CREATE } = require("sqlite3");
const rimraf = require("../public/libraries/rimraf");
const ffmpeg = require("ffmpeg");
const { folder } = require("decompress-zip/lib/extractors");
const { exec } = require("child_process");
const path = require("path");
const { stdout } = require("process");
const sharp = require("sharp");
const api = express.Router();
const newFilePath = require("path");
const unzipper = require("unzipper");

const unzipFile = require("../utils/unzipFile");
const pythonScript = require("../utils/pythonScript");

const logout = require("./user/logout");
const login = require("./user/login");
const signup = require("./user/signup");
const addUser = require("./user/addUser");
const deleteUser = require("./user/deleteUser");
const changeUserName = require("./user/changeUserName");
const changePassword = require("./user/changePassword");
const changeFname = require("./user/changeFname");
const changeLname = require("./user/changeLname");
const changeEmail = require("./user/changeEmail");

const createClassification = require("./training/createClassification");
const addClasses = require("./training/addClasses");
const uploadWeights = require("./training/uploadWeights");
const yolovx = require("./training/yolovx");
const uploadPreWeights = require("./training/uploadPreWeights");
const yoloRun = require("./training/yoloRun");
const deleteRun = require("./training/deleteRun");
const python = require("./training/python");
const darknet = require("./training/darknet");
const removePath = require("./training/removePath");
const removeDarknetPath = require("./training/removeDarknetPath");
const removeWeights = require("./training/removeWeights");
const removeScript = require("./training/removeScript");
const run = require("./training/run");
const updateClass = require("./training/updateClass");
const deleteClass = require("./training/deleteClass");

const createProject = require("./projects/createProject");
const updateProject = require("./projects/updateProject");
const deleteProject = require("./projects/deleteProject");
const addImages = require("./projects/addImages");
const deleteImage = require("./projects/deleteImage");
const importProject = require("./projects/importProject");
const importDataset = require("./projects/importDataset");
const importYolo = require("./projects/importYolo");
const importKwCoco = require("./projects/importKwCoco");
const importIfcb = require("./projects/importIfcb");
const mergeLocal = require("./projects/mergeLocal");
const removeAccess = require("./projects/removeAccess");
const transferAdmin = require("./projects/transferAdmin");
const script = require("./projects/script");
const deleteImagesWithoutLabel = require("./projects/deleteImagesWithoutLabel");

const updateLabels = require("./labelling/updateLabels");
const deleteLabels = require("./labelling/deleteLabels");
const switchLabels = require("./labelling/switchLabels");

const downloadDataset = require("./downloads/downloadDataset");
const downloadProject = require("./downloads/downloadProject");
const downloadScript = require("./downloads/downloadScript");
const downloadWeights = require("./downloads/downloadWeights");
const downloadRun = require("./downloads/downloadRun");

const test = require("./tests/test");
const mergeTest = require("./tests/mergeTest");

const changeValidation = require("./validation/changeValidation");
const deleteLabelValidation = require("./validation/deleteValidation");
const batchChangeClass = require("./validation/batchClass");
const changeClass = require("./validation/changeClass");

const bootstrapController = require("./bootstrap/bootstrapController");

const yoloInference = require("./inference/yoloInference");
const getRunImages = require("./inference/getRunImages");
const uploadInferenceFile = require("./inference/uploadInferenceFile");
const inceptionInference = require("./inference/inceptionInference");
const addYoloInferenceToDataset = require("./inference/addYoloInferenceToDataset");

// INFERENCE ROUTES
api.post("/yolo-inf", yoloInference);
api.post("/inception-inf", inceptionInference);
api.post("/upload_inference_file", uploadInferenceFile);
api.get("/runs/:runId/images", getRunImages);
api.post("/inference/add-inference-run-to-dataset", addYoloInferenceToDataset);

// USER ROUTES
api.post("/logout", logout);
api.post("/login", login);
api.post("/signup", signup);
api.post("/addUser", addUser);
api.post("/deleteUser", deleteUser);
api.post("/changeUname", changeUserName);
api.post("/changePassword", changePassword);

api.post("/changeFname", changeFname);
api.post("/changeLname", changeLname);
api.post("/changeEmail", changeEmail);

// TRAINING ROUTES
api.post("/api/createC", createClassification);
api.post("/addClasses", addClasses);
api.post("/upload_weights", uploadWeights);
api.post("/yolovx", yolovx);
api.post("/upload_pre_weights", uploadPreWeights);
api.post("/yolo-run", yoloRun);
api.post("/deleteRun", deleteRun);
api.post("/python", python);
api.post("/darknet", darknet);
api.post("/remove_path", removePath);
api.post("/remove_darknet_path", removeDarknetPath);
api.post("/remove_weights", removeWeights);
api.post("/remove_script", removeScript);
api.post("/run", run);
api.post("/updateClass", updateClass);
api.post("/deleteClass", deleteClass);

// PROJECT ROUTES
api.post("/createP", createProject);
api.post("/updateProject", updateProject);
api.post("/deleteProject", deleteProject);
api.post("/addImages", addImages);
api.post("/deleteImage", deleteImage);
api.post("/import", importProject);
api.post("/api/projects/import-dataset", importDataset);
api.post("/api/projects/import-yolo", importYolo);
api.post("/api/projects/import-kwcoco", importKwCoco);
api.post("/api/projects/import-ifcb", importIfcb);
api.post("/mergeLocal", mergeLocal);
api.post("/removeAccess", removeAccess);
api.post("/transferAdmin", transferAdmin);
api.post("/script", script);
api.post("/deleteImagesWithoutLabel", deleteImagesWithoutLabel);

// LABELLING ROUTES
api.post("/updateLabels", updateLabels);
api.delete("/deleteBadLabels/:Admin/:PName/:Lid", deleteLabels);
api.put("/api/switchLabels", switchLabels);

// DOWNLOAD ROUTES
api.post("/downloadDataset", downloadDataset);
api.post("/downloadProject", downloadProject);
api.post("/downloadScript", downloadScript);
api.post("/downloadWeights", downloadWeights);
api.post("/downloadRun", downloadRun);

// VALIDATION ROUTES
api.post("/changeValidation", changeValidation);
api.post("/deleteLabelValidation", deleteLabelValidation);
api.post("/batch-change-class", batchChangeClass);
api.post("/solo-change-class", changeClass);

// TEST ROUTES
api.post("/test", test);
api.post("/mergeTest", mergeTest);

// BOOTSTRAP ROUTES
api.post("/bootstrap", bootstrapController);

module.exports = api;
