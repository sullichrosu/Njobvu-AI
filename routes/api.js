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
const asyncHandler = require("../utils/asyncHandler");

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
const { getFilteredProjectsApi, getFilteredImagesApi } = require("./api/projectsFilter");
const {
    attachS3Bucket,
    getS3Bucket,
    deleteS3Bucket,
    syncS3Bucket,
} = require("./api/v2/s3Buckets");

const updateLabels = require("./labelling/updateLabels");
const deleteLabels = require("./labelling/deleteLabels");
const switchLabels = require("./labelling/switchLabels");

const downloadDataset = require("./downloads/downloadDataset");
const downloadProject = require("./downloads/downloadProject");
const downloadScript = require("./downloads/downloadScript");
const downloadWeights = require("./downloads/downloadWeights");
const downloadRun = require("./downloads/downloadRun");
const downloadClasses = require("./downloads/downloadClasses");

const test = require("./tests/test");
const mergeTest = require("./tests/mergeTest");

const changeValidation = require("./validation/changeValidation");
const deleteLabelValidation = require("./validation/deleteValidation");
const batchChangeClass = require("./validation/batchClass");
const changeClass = require("./validation/changeClass");

const bootstrapController = require("./bootstrap/bootstrapController");

const ollamaChat = require("./chat/ollamaChat");
const { getChatConfig, updateChatConfig, getOllamaModels } = require("./chat/chatConfig");

const yoloInference = require("./inference/yoloInference");
const getRunImages = require("./inference/getRunImages");
const uploadInferenceFile = require("./inference/uploadInferenceFile");
const inceptionInference = require("./inference/inceptionInference");
const addYoloInferenceToDataset = require("./inference/addYoloInferenceToDataset");
const megadetectorInference = require("./inference/megadetectorInference");

const { executePythonSandbox, handleRunSummary, handleListRuns, handleRunDocumentContext, handlePersistCustomSummary } = require("../controllers/sandboxController");

// CHAT HARNESS ROUTES
api.post("/api/chat", asyncHandler(ollamaChat));
api.get("/api/chat/config", asyncHandler(getChatConfig));
api.post("/api/chat/config", asyncHandler(updateChatConfig));
api.get("/api/chat/models", asyncHandler(getOllamaModels));

// SANDBOX & RUN SUMMARY ROUTES
api.post("/api/sandbox/python", asyncHandler(executePythonSandbox));
api.post("/api/runs/summary", asyncHandler(handleRunSummary));
api.get("/api/runs/list", asyncHandler(handleListRuns));
api.post("/api/runs/list", asyncHandler(handleListRuns));
api.get("/api/runs/context", asyncHandler(handleRunDocumentContext));
api.post("/api/runs/context", asyncHandler(handleRunDocumentContext));
api.post("/api/runs/persist-summary", asyncHandler(handlePersistCustomSummary));

// INFERENCE ROUTES
api.post("/yolo-inf", asyncHandler(yoloInference));
api.post("/api/inference/yolo", asyncHandler(yoloInference));
api.post("/inception-inf", asyncHandler(inceptionInference));
api.post("/api/inference/inception", asyncHandler(inceptionInference));
api.post("/megadetector-inf", asyncHandler(megadetectorInference));
api.post("/api/inference/megadetector", asyncHandler(megadetectorInference));
api.post("/upload_inference_file", asyncHandler(uploadInferenceFile));
api.post("/uploadInferenceFile", asyncHandler(uploadInferenceFile));
api.post("/api/inference/upload-file", asyncHandler(uploadInferenceFile));
api.get("/runs/:runId/images", asyncHandler(getRunImages));
api.post("/inference/add-inference-run-to-dataset", asyncHandler(addYoloInferenceToDataset));

// USER ROUTES
api.post("/logout", asyncHandler(logout));
api.post("/login", asyncHandler(login));
api.post("/signup", asyncHandler(signup));
api.post("/addUser", asyncHandler(addUser));
api.post("/deleteUser", asyncHandler(deleteUser));
api.post("/changeUname", asyncHandler(changeUserName));
api.post("/changeUserName", asyncHandler(changeUserName));
api.post("/api/user/change-username", asyncHandler(changeUserName));
api.post("/changePassword", asyncHandler(changePassword));

api.post("/changeFname", asyncHandler(changeFname));
api.post("/changeLname", asyncHandler(changeLname));
api.post("/changeEmail", asyncHandler(changeEmail));

// TRAINING ROUTES
api.post("/api/createC", asyncHandler(createClassification));
api.post("/api/training/create-classification", asyncHandler(createClassification));
api.post("/addClasses", asyncHandler(addClasses));
api.post("/upload_weights", asyncHandler(uploadWeights));
api.post("/uploadWeights", asyncHandler(uploadWeights));
api.post("/yolovx", asyncHandler(yolovx));
api.post("/upload_pre_weights", asyncHandler(uploadPreWeights));
api.post("/uploadPreWeights", asyncHandler(uploadPreWeights));
api.post("/yolo-run", asyncHandler(yoloRun));
api.post("/deleteRun", asyncHandler(deleteRun));
api.post("/python", asyncHandler(python));
api.post("/darknet", asyncHandler(darknet));
api.post("/remove_path", asyncHandler(removePath));
api.post("/removePath", asyncHandler(removePath));
api.post("/remove_darknet_path", asyncHandler(removeDarknetPath));
api.post("/removeDarknetPath", asyncHandler(removeDarknetPath));
api.post("/remove_weights", asyncHandler(removeWeights));
api.post("/removeWeights", asyncHandler(removeWeights));
api.post("/remove_script", asyncHandler(removeScript));
api.post("/removeScript", asyncHandler(removeScript));
api.post("/run", asyncHandler(run));
api.post("/updateClass", asyncHandler(updateClass));
api.post("/deleteClass", asyncHandler(deleteClass));

// PROJECT ROUTES
api.post("/createP", asyncHandler(createProject));
api.post("/api/projects/create", asyncHandler(createProject));
api.post("/updateProject", asyncHandler(updateProject));
api.post("/deleteProject", asyncHandler(deleteProject));
api.post("/addImages", asyncHandler(addImages));
api.post("/deleteImage", asyncHandler(deleteImage));
api.post("/import", asyncHandler(importProject));
api.post("/api/projects/import-dataset", asyncHandler(importDataset));
api.post("/api/projects/import-yolo", asyncHandler(importYolo));
api.post("/api/projects/import-kwcoco", asyncHandler(importKwCoco));
api.post("/api/projects/import-ifcb", asyncHandler(importIfcb));
api.post("/mergeLocal", asyncHandler(mergeLocal));
api.post("/removeAccess", asyncHandler(removeAccess));
api.post("/transferAdmin", asyncHandler(transferAdmin));
api.post("/script", asyncHandler(script));
api.post("/deleteImagesWithoutLabel", asyncHandler(deleteImagesWithoutLabel));
api.get("/api/v2/projects", asyncHandler(getFilteredProjectsApi));
api.get("/api/v2/projects/:IDX/images", asyncHandler(getFilteredImagesApi));
api.get("/api/projects/filter", asyncHandler(getFilteredProjectsApi));
api.get("/api/projects/filter-images", asyncHandler(getFilteredImagesApi));

// S3 BUCKET ROUTES (strangler-fig v2, mounts an S3 bucket as a project's image volume)
api.post("/api/v2/projects/:admin/:projectName/s3-bucket", asyncHandler(attachS3Bucket));
api.get("/api/v2/projects/:admin/:projectName/s3-bucket", asyncHandler(getS3Bucket));
api.delete("/api/v2/projects/:admin/:projectName/s3-bucket", asyncHandler(deleteS3Bucket));
api.post("/api/v2/projects/:admin/:projectName/s3-bucket/sync", asyncHandler(syncS3Bucket));

// LABELLING ROUTES
api.post("/updateLabels", asyncHandler(updateLabels));
api.post("/project/updateLabels", asyncHandler(updateLabels));
api.post("/api/labels/update", asyncHandler(updateLabels));
api.delete("/deleteBadLabels/:Admin/:PName/:Lid", asyncHandler(deleteLabels));
api.put("/api/switchLabels", asyncHandler(switchLabels));

// DOWNLOAD ROUTES
api.post("/downloadDataset", asyncHandler(downloadDataset));
api.post("/downloadProject", asyncHandler(downloadProject));
api.post("/downloadScript", asyncHandler(downloadScript));
api.post("/downloadWeights", asyncHandler(downloadWeights));
api.post("/downloadRun", asyncHandler(downloadRun));
api.post("/downloadClasses", asyncHandler(downloadClasses));

// VALIDATION ROUTES
api.post("/changeValidation", asyncHandler(changeValidation));
api.post("/deleteLabelValidation", asyncHandler(deleteLabelValidation));
api.post("/batch-change-class", asyncHandler(batchChangeClass));
api.post("/solo-change-class", asyncHandler(changeClass));

// TEST ROUTES
api.post("/test", asyncHandler(test));
api.post("/mergeTest", asyncHandler(mergeTest));

// BOOTSTRAP ROUTES
api.post("/bootstrap", asyncHandler(bootstrapController));

module.exports = api;
