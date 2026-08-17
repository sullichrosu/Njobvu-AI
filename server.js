global.logger = require('./utils/logger');
const app = require('./app');
const { Client } = require("./queries/client");

global.configFile = require("./config.json");

const port = configFile.port;
const hostname = configFile.hostname;

// global imported libraries
global.fs = require("fs");
global.unzip = require("unzip-stream");
global.StreamZip = require("node-stream-zip");
global.glob = require("glob");
global.probe = require("probe-image-size");
global.csv = require("csvtojson");
global.rimraf = require("./public/libraries/rimraf");
global.util = require("util");
global.archiver = require("archiver");
(global.sqlite3 = require("sqlite3").verbose()),
    (global.readline = require("readline")),
    (global.path = require("path"));
global.readdirAsync = util.promisify(fs.readdir);
global.removeDir = util.promisify(fs.rmdir);

global.projectDbClients = {};
global.managedDbClient = new Client(path.join(__dirname, "db", "manage.db"));

managedDbClient.migrate();

const allProjectsPath = path.join(__dirname, "public", "projects");

try {
    if (!fs.existsSync(allProjectsPath)) {
        fs.mkdirSync(allProjectsPath, { recursive: true });
        global.logger.info(`Directory '${allProjectsPath}' created.`);
    } else {
        global.logger.debug(`Directory '${allProjectsPath}' already exists.`);
    }
} catch (err) {
    global.logger.error(`Error creating directory: ${err.message}`);
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

let ssl_key_path = configFile.ssl_key_path;
let ssl_cert_path = configFile.ssl_cert_path;
let secure = false;

if (ssl_key_path && ssl_cert_path) {
    secure = true;
    var https = require("https");
    var options = {
        key: fs.readFileSync(ssl_key_path),
        cert: fs.readFileSync(ssl_cert_path),
    };
}

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
        return global.logger.error(err.message);
    }

    global.logger.info("Connected to the main database.");
});

global.db.getAsync = function(sql) {
    var that = this;
    return new Promise((resolve, reject) => {
        that.get(sql, function(err, row) {
            if (err) {
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        global.logger.error("getAsync ERROR!", { sql, error: err.message, stack: err.stack });
    });
};

global.db.allAsync = function(sql) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.all(sql, function(err, row) {
            if (err) {
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        global.logger.error("allAsync ERROR!", { sql, error: err.message, stack: err.stack });
    });
};

global.db.runAsync = function(sql) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.run(sql, function(err, row) {
            if (err) {
                reject(err);
            } else resolve(row);
        });
    }).catch((err) => {
        global.logger.error("runAsync ERROR!", { sql, error: err.message, stack: err.stack });
    });
};

global.db.execAsync = function(sql) {
    var that = this;
    return new Promise(function(resolve, reject) {
        that.exec(sql, function(err, row) {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    }).catch((err) => {
        global.logger.error("execAsync ERROR!", { sql, error: err.message, stack: err.stack });
    });
};


app.set("port", process.env.port || port);
app.set("views", __dirname + "/views");
app.set("view engine", "ejs"); // template engine

if (secure) {
    https.createServer(options, app).listen(port);
} else {
    app.listen(port, () => {
        global.logger.info(`Server started on ${hostname}:${port}`);
    });
}
