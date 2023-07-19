////////////////////////////////////////////////////////
// Set up:
////////////////////////////////////////////////////////

//Read in config
global.configFile = require('./controllers/training/config.json');
//console.log(configFile)
//console.log("default_python_Path: ", configFile.default_python_path);
//console.log("ssl_key_path: ", configFile.ssl_key_path);
//console.log("ssl_cert_path: ", configFile.ssl_cert_path);

// set port number and hostname
const port = configFile.port,
      hostname = configFile.hostname; // change to ip address when on server
//const port = 8080,
//      hostname = "http://localhost"; // change to ip address when on server



// global imported libraries
global.fs = require('fs');
global.unzip = require('unzip-stream');
global.StreamZip = require('node-stream-zip');
//global.DecompressZip = require('decompress-zip');
global.glob = require("glob");
global.probe = require('probe-image-size');
global.csv = require('csvtojson');
global.rimraf = require('./public/libraries/rimraf');
global.util = require('util');
global.archiver = require('archiver');
global.sqlite3 = require('sqlite3').verbose(),
global.readline = require('readline'),
global.path = require('path');
global.bcrypt = require('bcryptjs');
// const ConvertTiff = require('tiff-to-png');
// global.converter = new ConvertTiff({logLevel: 1});

//global.readdirAsync = util.promisify(fs.readdir);
global.readdirAsync = util.promisify(fs.readdir);
global.removeDir = util.promisify(fs.rmdir);


// set ssl certificates
var ssl_key_path = configFile.ssl_key_path;
var ssl_cert_path = configFile.ssl_cert_path;

var secure = false;
if(ssl_key_path && ssl_cert_path){
	// console.log("secure True");
	secure = true;
	var https = require('https');
	var options = {
		key: fs.readFileSync(ssl_key_path),
		cert: fs.readFileSync(ssl_cert_path),
	};
}


// local imported libraries
const express = require('express'),
    //session = require('express-session'),
    //bodyParser = require('body-parser'),
    path = require('path'),
    sys  = require('util'),
    cookieParser = require('cookie-parser'),
    upload = require('express-fileupload'),
    app = express();
    // sqlite3 = require('sqlite3').verbose(),
// get path
global.currentPath = process.cwd();
global.dataFolder = currentPath + '/data/';

// read files
global.colorsJSON = JSON.parse(fs.readFileSync(dataFolder + 'colors.json', 'utf8'));

// create connection to database:
global.db = new sqlite3.Database('./db/manage.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('Connected to the main database.');
});
// customized asnc classes
global.db.getAsync = function (sql) {
    var that = this;
    return new Promise((resolve, reject) => {
        that.get(sql, function (err, row) {
            if (err)
            {
                console.log("getAsync ERROR! ", err);
                reject(err);
            }
            else
                resolve(row);
        });
    }).catch(err => {
		console.error(err)
	});
};
global.db.allAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.all(sql, function (err, row) {
            if (err)
            {
                console.log("allAsync ERROR! ", err);
                reject(err);
            }
            else
                resolve(row);
        });
    }).catch(err => {
		console.error(err)
	});
};
global.db.runAsync = function (sql) {
    var that = this;
    return new Promise(function (resolve, reject) {
        that.run(sql, function (err, row) {
            if (err)
            {
                console.log("runAsync ERROR! ", err);
                reject(err);
            }
            else
                resolve(row);
        });
    }).catch(err => {
		console.error("runAsync error: ",err)
	});
};
global.db.execAsync = function (sql) {
	var that = this;
	return new Promise(function (resolve, reject) {
		that.exec(sql, function(err, row) {
			if (err)
			{
				console.log("execAsync ERROR! ", err);
				reject(err);
			}
			else
			{
				resolve(row);
			}
		})
	}).catch(err => {
		console.error(err)
	});
}
const fileUpload = require('express-fileupload');
// api
const api = require('./routes/api');

// console.log(typeof(Storage));
// pages
const {
    getLoginPage,
    getSignupPage,
    getHomePage,
    getCreatePage,
    getProjectPage,
	getConfigPage,
	getDownloadPage,
	getLabelingPage,
	getStatsPage,
    getTrainingPage,
	getYoloPage,
	getUserPage,
  get404Page,
  getValidationHomePage,
  getValidationProjectPage,
  getValidationLabelingPage
} = require('./routes/pages');
// configure middlewares
// set
app.set('port', process.env.port || port); // set express to use this port
app.set('views', __dirname + '/views'); // set express to look in this folder to render our view
app.set('view engine', 'ejs'); // configure template engine

// use
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); // parse form data client
app.use(express.static(path.join(__dirname, 'public'))); // configure express to use public folder
app.use(cookieParser());
//app.use(session({secret:"Secret Code Don't Tell Anyone", cookie: { maxAge: 30 * 1000 }})); // configure fileupload
app.use(upload({
    useTempFiles: true,
    tempFileDir: "./tmp/"
}));
app.use("/",api);

////////////////////////////////////////////////////////
// Routes for the App:
////////////////////////////////////////////////////////

// get
app.get('/', getLoginPage);
app.get('/signup', getSignupPage);
app.get('/home', getHomePage);
app.get('/create', getCreatePage);
app.get('/project', getProjectPage);
app.get('/config', getConfigPage);
app.get('/download', getDownloadPage);
app.get('/labeling', getLabelingPage);
app.get('/stats', getStatsPage);
app.get('/training', getTrainingPage);
app.get('/yolo', getYoloPage);
app.get('/user', getUserPage);
app.get('/homeV', getValidationHomePage);
app.get('/projectV', getValidationProjectPage);
app.get('/labelingV', getValidationLabelingPage);
// everything else -> 404
app.get('*', get404Page);

////////////////////////////////////////////////////////
// Start Server:
////////////////////////////////////////////////////////
if(secure)
{
	https.createServer(options, app).listen(port);
}
else
{
	var server = app.listen(port, () => {
    	console.log(hostname+':'+port);
	});
}
////////////////////////////////////////////////////////
// Web-socket:
////////////////////////////////////////////////////////
//var io = require('socket.io').listen(server);


// web-socket
//require("./controllers/training/main")(io);



