////////////////////////////////////////////////////////
// Set up:
////////////////////////////////////////////////////////
const app = require('./app'); 
const { Client } = require("./queries/client");
global.configFile = require("./config.json");
const port = configFile.port;
const hostname = configFile.hostname;

// global imported libraries
global.fs = require("fs");
global.unzip = require("unzip-stream");
global.StreamZip = require("node-stream-zip");
//global.DecompressZip = require('decompress-zip');
global.glob = require("glob");
global.probe = require("probe-image-size");
global.csv = require("csvtojson");
global.rimraf = require("./public/libraries/rimraf");
global.util = require("util");
global.archiver = require("archiver");
(global.sqlite3 = require("sqlite3").verbose()),
    (global.readline = require("readline")),
    (global.path = require("path"));
// global.bcrypt = require("bcryptjs");
global.readdirAsync = util.promisify(fs.readdir);
global.removeDir = util.promisify(fs.rmdir);

global.projectDbClients = {};
global.managedDbClient = new Client(path.join(__dirname, "db", "manage.db"));

managedDbClient.migrate();

const allProjectsPath = path.join(__dirname, "public", "projects");

try {
  if (!fs.existsSync(allProjectsPath)) {
    fs.mkdirSync(allProjectsPath, { recursive: true }); // recursive: true creates parent directories if they don't exist
    console.log(`Directory '${allProjectsPath}' created.`);
  } else {
    console.log(`Directory '${allProjectsPath}' already exists.`);
  }
} catch (err) {
  console.error(`Error creating directory: ${err.message}`);
}

for (const project of fs.readdirSync(allProjectsPath)) {
    const projectPath = path.join(allProjectsPath, project);

    for (const file of fs.readdirSync(projectPath)) {
        if (file.endsWith(".db")) {
            const dbFile = path.join(projectPath, file);

            global.projectDbClients[projectPath] = new Client(dbFile);
        }
    }
}

var ssl_key_path = configFile.ssl_key_path;
var ssl_cert_path = configFile.ssl_cert_path;

var secure = false;
if (ssl_key_path && ssl_cert_path) {
    secure = true;
    var https = require("https");
    var options = {
        key: fs.readFileSync(ssl_key_path),
        cert: fs.readFileSync(ssl_cert_path),
    };
}

// const express = require("express"),
    sys = require("util"),
    // cookieParser = require("cookie-parser"),
    // upload = require("express-fileupload"),
    // app = express();

global.currentPath = process.cwd() + "/";
global.dataFolder = currentPath + "/data/";

global.colorsJSON = JSON.parse(
    fs.readFileSync(dataFolder + "colors.json", "utf8"),
);

global.db = new sqlite3.Database("./db/manage.db", (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log("Connected to the main database.");
});

global.db.getAsync = function (sql) {
    var that = this;
    return new Promise((resolve, reject) => {
        that.get(sql, function (err, row) {
            if (err) {
                console.log("getAsync ERROR! ", err);
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        console.error(err);
    });
};

global.db.allAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.all(sql, function (err, row) {
            if (err) {
                console.log("allAsync ERROR! ", err);
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        console.error(err);
    });
};

global.db.runAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.run(sql, function (err, row) {
            if (err) {
                console.log("runAsync ERROR! ", err);
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        console.error("runAsync error: ", err);
    });
};

global.db.execAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.exec(sql, function (err, row) {
            if (err) {
                console.log("execAsync ERROR! ", err);
                reject(err);
            } else {
                resolve(row);
            }
        });
    }).catch((err) => {
        console.error(err);
    });
};
const fileUpload = require("express-fileupload");

const api = require("./routes/api");

// const {
//     getClassificationPage,
//     getLoginPage,
//     getSignupPage,
//     getHomePage,
//     getCreatePage,
//     getProjectPage,
//     getAnnotatePage,
//     getReviewPage,
//     getConfigPage,
//     getDownloadPage,
//     getLabelingPage,
//     getStatsPage,
//     getTrainingPage,
//     getProcessingPage,
//     getYolo3SettingsPage,
//     getYoloXSettingsPage,
//     getServerInfoPage,
//     getYoloPage,
//     getUserPage,
//     getProjectSettingsPage,
//     getClassSettingsPage,
//     getAccessSettingsPage,
//     getImageSettingsPage,
//     getMergeSettingsPage,
//     getServerStatsPage,
//     get404Page,
//     getValidationHomePage,
//     getValidationProjectPage,
//     getValidationLabelingPage,
//     getValidationConfigPage,
//     getValidationStatsPage,
//     getInferencePage,
//     getCustomTrainingPage,
//     getYoloXInferenceSettingsPage,
//     getYoloXTrainingSettingsPage,
// } = require("./routes/pages");

// configure middlewares
// set
app.set("port", process.env.port || port); // set express to use this port
app.set("views", __dirname + "/views"); // set express to look in this folder to render our view
app.set("view engine", "ejs"); // configure template engine

// // use
// app.use(express.urlencoded({ extended: false }));
// app.use(fileUpload());
// app.use(express.json()); // parse form data client
// app.use(express.static(path.join(__dirname, "public"))); // configure express to use public folder
// app.use(cookieParser());
// //app.use(session({secret:"Secret Code Don't Tell Anyone", cookie: { maxAge: 30 * 1000 }})); // configure fileupload
// app.use("/", api);

////////////////////////////////////////////////////////
// Routes for the App:
////////////////////////////////////////////////////////

// // get

// app.get("/", getLoginPage);
// app.get("/signup", getSignupPage);
// app.get("/home", getHomePage);
// app.get("/create", getCreatePage);
// app.get("/annotate", getAnnotatePage);
// app.get("/review", getReviewPage);
// app.get("/project", getProjectPage);
// app.get("/config", getConfigPage);
// app.get("/config/projSettings", getProjectSettingsPage);
// app.get("/config/classSettings", getClassSettingsPage);
// app.get("/config/accessSettings", getAccessSettingsPage);
// app.get("/config/imageSettings", getImageSettingsPage);
// app.get("/config/mergeSettings", getMergeSettingsPage);
// app.get("/download", getDownloadPage);
// app.get("/labeling", getLabelingPage);
// app.get("/stats", getStatsPage);
// app.get("/customTraining", getCustomTrainingPage);
// app.get("/training", getTrainingPage);
// // app.get("/processing", getProcessingPage);
// app.get("/inference", getInferencePage);
// app.get("/yolo", getYoloPage);
// app.get("/yolo/yolov3Settings", getYolo3SettingsPage);
// app.get("/yolo/yolovXSettings", getYoloXSettingsPage);
// app.get("/yolo/yolovXInferenceSettings", getYoloXInferenceSettingsPage);
// app.get("/yolo/yolovXTrainingSettings", getYoloXTrainingSettingsPage);
// app.get("/user", getUserPage);
// app.get("/servstats", getServerStatsPage);
// app.get("/homeV", getValidationHomePage);
// app.get("/projectV", getValidationProjectPage);
// app.get("/labelingV", getValidationLabelingPage);
// app.get("/configV", getValidationConfigPage);
// app.get("/statsV", getValidationStatsPage);
// app.get("/createClassification", getClassificationPage);
// app.get("/api/gpuinfo");
// // everything else -> 404
// app.get("*", get404Page);

////////////////////////////////////////////////////////
// Start Server:
////////////////////////////////////////////////////////
if (secure) {
    https.createServer(options, app).listen(port);
} else {
    var server = app.listen(port, () => {
        console.log(hostname + ":" + port);
    });
}
////////////////////////////////////////////////////////
// Web-socket:
////////////////////////////////////////////////////////
//var io = require('socket.io').listen(server);

// web-socket
//require("./controllers/training/main")(io);
