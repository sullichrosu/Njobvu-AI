const { error, time } = require('console');
const { SSL_OP_EPHEMERAL_RSA } = require('constants');
const DecompressZip = require('decompress-zip');
const express = require('express');
const { existsSync, readdirSync } = require('fs');
const { async } = require('node-stream-zip');
const StreamZip = require('node-stream-zip');
const { protocol } = require('socket.io-client');
const { OPEN_CREATE } = require('sqlite3');
const rimraf = require('../public/libraries/rimraf');

const api = express.Router();

api.post('/logout', async (req, res) => {
	res.clearCookie("Username");
	res.redirect("/");
});


api.post('/login', async (req, res) => {
	console.log("login post request");
	var username = req.body.username,
		password = req.body.password;
	
	var public_path = __dirname.replace('routes','');
	var main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		downloads_path = main_path + username + '_Downloads';
	
	if(!fs.existsSync(downloads_path))
	{
		fs.mkdir(downloads_path, (err) => {
			if(err)
			{
				console.log(err);
			}
		});
	}   
	
	var passwords = await db.allAsync("SELECT Password FROM Users WHERE Username = '" + username +"'")
	var found = 0;
	for(var i=0; i<passwords.length; i++)
	{
		if(bcrypt.compareSync(password, passwords[i].Password))
		{
			found=1;
			break;
		}
	}
	if(found > 0)
	{
		res.cookie("Username", username, {
			httpOnly: true,
		});
		res.send({"Success": "Yes"});
	}
	else{
		res.send({"Success": "No"});
	}
});




api.post('/signup', async (req, res) => {
	console.log("signup");
	var Fname = req.body.Fname,
		Lname = req.body.Lname,
		email = req.body.email,
		username = req.body.username,
		password = req.body.password;

	var results1 = await db.getAsync("SELECT COUNT(*) AS USER FROM `Users` WHERE Username = '"+ username +"'");
	if(results1.USER != 0)
	{
		return res.redirect('/signup')
	}

	bcrypt.hash(password, 10, async function(err, hash){
		if(err)
		{
			console.error(err);
		}
		else
		{
			await db.allAsync("INSERT INTO Users (Username, Password, FirstName, LastName, Email) VALUES ('" + username + "', '" + hash + "', '" + Fname + "', '" + Lname + "', '" + email + "')");
		}
	});

	var results3 = await db.getAsync("SELECT COUNT(*) AS DUSER FROM Projects WHERE Admin='ZeroUser'");
	if(results3.DUSER > 0)
	{
		var results4 = await db.getAsync("SELECT * FROM Projects WHERE Admin='ZeroUser'");
		for(var i = 0; i < results3.DUSER; i++)
		{
			await db.runAsync("INSERT INTO Access (Username, PName) VALUES ('"+username+"', '"+results4.PName+"')");
		}
		await db.runAsync("UPDATE Projects SET Admin = '"+username+"' WHERE Admin ='ZeroUser'");
	}
	
	var public_path = __dirname.replace('routes','');
	var main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		downloads_path = main_path + username + '_Downloads';
	
	if(!fs.existsSync(downloads_path))
	{
		fs.mkdir(downloads_path, (err) => {
			if(err)
			{
				console.log(err)
			}
		});
	}   
	
	return res.redirect('/');
});




api.post('/createP', async (req, res) => {

	console.log("addProject");

	const {exec} = require('child_process');
	
	// get origin path $LABELING_TOOL_PATH
	var public_path = __dirname.replace('routes','');

	// get form inputs
	var project_name = req.body.project_name,
		upload_images = req.files["upload_images"],
		upload_bootstrap = req.files["upload_bootstrap"],
		input_classes = req.body.input_classes,
		auto_save = 1,
		username = req.cookies.Username,
		project_description = "none";

	if(input_classes.includes(",")){
		input_classes = req.body.input_classes.split(",");
	}

	// cleans the class input
	if(typeof(input_classes) == "string"){
		input_classes = input_classes.trim();
		input_classes = input_classes.split(' ').join('_');
	}
	else{
		for(i = 0; i < input_classes.length; i++){
			input_classes[i] = input_classes[i].trim();
			input_classes[i] = input_classes[i].split(' ').join('_');
		}
	
		//removes blanks
		var insert_classes = []
		for(i = 0; i < input_classes.length; i++){
			if(input_classes[i] != ""){
				insert_classes.push(input_classes[i])
			}
		}
	}

	//Project Table
	var main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + username + "-" + project_name, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		bootstrap_path = project_path + '/bootstrap',
		downloads_path = main_path + username + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		weights_path = training_path + '/weights',
		python_path = training_path + '/python',
		python_path_file = training_path + '/Paths.txt';
		darknet_path_file = training_path + '/darknetPaths.txt';

	if(!fs.existsSync(main_path))
	{
		fs.mkdirSync(main_path);
	}
	// create folders:
	if (!fs.existsSync(project_path)){
		console.log("addProject (create folders)");
		fs.mkdirSync(project_path);
		fs.mkdirSync(images_path);
		fs.mkdirSync(bootstrap_path);
		fs.mkdirSync(training_path);
		fs.mkdirSync(weights_path);
		fs.mkdirSync(logs_path);
		fs.mkdirSync(python_path);
		
		fs.writeFile(python_path_file, "", function(err){
			if(err)
			{
				console.log(err);
			}
		});
		fs.writeFile(darknet_path_file, "", function(err){
			if(err)
			{
				console.log(err);
			}
		});
	}

	//Create new project database
	var cdb = new sqlite3.Database(project_path+'/'+project_name+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to cdb.');
	});
	cdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	cdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	cdb.runAsync = function (sql) {
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
			console.error(err)
		});
	};	
	await cdb.runAsync("CREATE TABLE Classes (CName VARCHAR NOT NULL PRIMARY KEY)");
	await cdb.runAsync("CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0, validateImage INTEGER NOT NULL DEFAULT 0)");
	await cdb.runAsync("CREATE TABLE Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X INTEGER NOT NULL, Y INTEGER NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName))");
	await cdb.runAsync("CREATE TABLE Validation (Confidence INTEGER NOT NULL, LID INTEGER NOT NULL PRIMARY KEY, CName VARCHAR NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(LID) REFERENCES Labels(LID), FOREIGN KEY(IName) REFERENCES Images(IName), FOREIGN KEY(CName) REFERENCES Classes(CName))"); //tp1


	var results1 = await db.allAsync("INSERT INTO Projects (PName, PDescription, AutoSave, Admin) VALUES ('" + project_name + "', '" + project_description + "', '" + auto_save +"', '" + username + "')");

	//Access Table
	await db.runAsync("INSERT INTO Access (Username, PName, Admin) VALUES ('"+username+"', '"+project_name+"', '"+username+"')");

	//Classes Table
	var classesExist = await cdb.allAsync("SELECT CName FROM Classes");
	var cur_classes = []
	for (var i = 0; i < classesExist.length; i++)
	{
		cur_classes.push(classesExist[i].CName);
	}
	console.log("addProject (INSERT INTO Classes)");
	if(typeof(input_classes) == "string"){
		if(!cur_classes.includes(input_classes))
		{
			console.log("addProject (INSERT INTO Classes -> class = "+input_classes + ")");
			await cdb.runAsync("INSERT INTO CLASSES (CName) VALUES ('" + input_classes + "')");
		}
	}
	else {
		for (var i = 0; i < insert_classes.length; i++) {
			if(!cur_classes.includes(insert_classes[i]))
			{
				// console.log("addProject (INSERT INTO Classes -> class = "+insert_classes[i] + ")");
				cur_classes.push(insert_classes[i]);
				await cdb.runAsync("INSERT INTO CLASSES (CName) VALUES ('" + insert_classes[i] + "')");
			}
		}
	}

	//Images Table
	// console.log(project_path, project_name, images_path);
	var zip_path = images_path + '/' +upload_images.name; // $LABELING_TOOL_PATH/public/projects/{project_name}/{zip_file_name}

	await upload_images.mv(zip_path);
	console.log("File Uploaded", upload_images.name);
	
	//extract images zip file
	console.log(`zip_path: ${zip_path}`);
	var zip = new StreamZip({file: zip_path})

	zip.on('error', err => {
		console.log(err);	
		cdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("cdb closed successfully");
			}
		});

		return res.send("ERROR! ", err)
	});

	zip.on('ready', async () =>{
		console.log(zip_path)
		zip.extract(null, images_path, async (err, count) =>{
			console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
			zip.close();
			rimraf(zip_path, (err) => {
				if(err)
				{
					console.log(err);
					// res.send({"Success": "could not remove zip file"});
					cdb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("cdb closed successfully");
						}
					});
					res.send(err)
				}
			})
			files = await readdirAsync(images_path);
			console.log("file path: ", images_path);
			console.log("files: ", files);
			// console.log("addProject (INSERT INTO Images)");
			for (var i = 0; i < files.length; i++) {
				if(files[i] == "__MACOSX")
				{
					// check if __MACOSX is the last file, if so close cdb
					if(i+1 == files.length)
					{
						console.log("cbd should be closing here");
						cdb.close(function(err){ 
							if(err)
							{
								console.error(err);
							}
							else{
								console.log("cdb closed successfully");
							}
						});
						// res.send({"Success": "Yes"});
						res.send("Project creation successful")
					}
					continue;
				}
				//Cleans filenames, Removes trailing and leading spaces and swaps 0s and +s with _.
				if(!files[i].endsWith('.zip') && files[i] != 'blob')
				{
					var temp = images_path + '/' + files[i];
					// console.log("files[i]: ", files[i]);
					files[i] = files[i].trim();
					files[i] = files[i].split(' ').join('_');
					files[i] = files[i].split('+').join('_');
					fs.rename(temp, images_path + '/' + files[i], () => {});

					// console.log("addProject (INSERT INTO Images -> image = "+files[i] + ")");
					await cdb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('" +  files[i] +
						"', '" + 0 + "', '" + 0 + "')");
				}
				if(files[i].endsWith('.zip'))
				{
					fs.unlink(images_path + '/' + files[i], () => {});
				}
				// check if last file, if so close cdb
				if(i+1 == files.length)
				{
					console.log("cbd should be closing here"); 
					cdb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("cdb closed successfully");
						}
					});
					// res.send({"Success": "Yes"});
					if(upload_bootstrap == undefined){
						res.send("Project creation successful");
					}
					
				}
			}
		});
	});

	//Run models on existing data
	if(upload_bootstrap !== undefined){
		var bzip_path = bootstrap_path + '/' + upload_bootstrap.name;
		var out_bootstrap_json = "";

		await upload_bootstrap.mv(bzip_path);
		console.log("File Uploaded (Bootstrap)", upload_bootstrap.name);
		
		//extract images zip file
		console.log(`bzip_path (Bootstrap): ${bzip_path}`);
		var bzip = new StreamZip({file: bzip_path})
		bzip.on('error', err => {
			console.log(err);
			return res.send("ERROR! ", err);
		});
	
		bzip.on('ready', async () =>{

			var weight_bootstrap_path = cfg_bootstrap_path = data_bootstrap_path = "";

			// console.log(bzip_path)
			bzip.extract(null, bootstrap_path, async (err, count) =>{
				console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
				bzip.close();
				rimraf(bzip_path, (err) => {
					if(err)
					{
						console.log(err);
						// res.send({"Success": "could not remove bzip file"});
					}
				})
				bfiles = await readdirAsync(bootstrap_path);
				// console.log("file path (Bootstrap): ", bootstrap_path);
				// console.log("files (Bootstrap): ", bfiles);
				// console.log("addProject (INSERT INTO Images)");
				for (var i = 0; i < bfiles.length; i++) {
					//Cleans filenames, Removes trailing and leading spaces and swaps 0s and +s with _.
					if(!bfiles[i].endsWith('.zip'))
					{
						var temp = bootstrap_path + '/' + bfiles[i];
						// console.log("files[i]: ", files[i]);
						bfiles[i] = bfiles[i].trim();
						bfiles[i] = bfiles[i].split(' ').join('_');
						bfiles[i] = bfiles[i].split('+').join('_');
						fs.rename(temp, bootstrap_path + '/' + bfiles[i], () => {});
						if (bfiles[i].endsWith('.weights')) weight_bootstrap_path = bootstrap_path + '/' + bfiles[i];
						if (bfiles[i].endsWith('.cfg')) cfg_bootstrap_path = bootstrap_path + '/' + bfiles[i];
						if (bfiles[i].endsWith('.data')) data_bootstrap_path = bootstrap_path + '/' + bfiles[i];
					}
					if(!bfiles[i].endsWith('.weights') && !bfiles[i].endsWith('.cfg') && !bfiles[i].endsWith('.data'))
					{
						fs.unlink(bootstrap_path + '/' + bfiles[i], () => {});
					}
					// check if last file, if so run darknet
					if(i+1 == bfiles.length)
					{
						// res.send({"Success": "Yes"});
						console.log("Boostrap unzipped sucesfully");
						
						console.log("Create run txt file");
						images_to_write = await readdirAsync(images_path);
						var run_data = images_to_write.map(i => images_path + '/' + i).join("\n");
						var run_txt_path = bootstrap_path+ '/' + 'run.txt';

						fs.writeFileSync(run_txt_path,  run_data, (err) => {
							if (err) throw err;
							console.log("done writing bootstrap run txt file");
						});

						var yolo_script = public_path + 'controllers/training/bootstrap.py';
						out_bootstrap_json = bootstrap_path + '/out.json';
						console.log("Calling Darknet for Bootstrap")
						// Pass in python path, script, and options
						var darknet_path = '/export/darknet'; //TEMP SWITCH TO USER INPUT ASAP
						var cmd = `python3 ${yolo_script} -d ${data_bootstrap_path} -c ${cfg_bootstrap_path} -t ${run_txt_path} -y ${darknet_path} -w ${weight_bootstrap_path} -o ${out_bootstrap_json}`;
						// console.log(cmd)
						process.chdir(darknet_path);

						var child = exec(cmd, (err, stdout, stderr) => {
							if (err){
								console.log(`This is the error: ${err.message}`);
							}
							else if (stderr) {
								console.log(`This is the stderr: ${stderr}`);
							}
							console.log("stdout: ", stdout)
							console.log("stderr: ", stderr)
							console.log("err: ", err)
							console.log("The script has finished running");
							apply_bootstrap_labels();
						});
					}
				}
			});
			async function apply_bootstrap_labels() {
				console.log("Applying bootstrap labels.");
				var raw_label_bootstrap_data = fs.readFileSync(out_bootstrap_json);
				var label_bootstrap_data = JSON.parse(raw_label_bootstrap_data);

				// console.log(label_bootstrap_data);
				
				// Connect to database
				var bdddb = new sqlite3.Database(project_path+'/'+project_name+'.db', (err) => {
					if (err) {
						return console.error(err.message);
					}
					console.log('Connected to bdddb.');
				});
				bdddb.getAsync = function (sql) {
					var that = this;
					return new Promise(function (resolve, reject) {
						that.get(sql, function (err, row) {
							if (err)
							{
								console.log("runAsync ERROR! ", err);
								reject(err);
							}
							else
								resolve(row);
						});
					}).catch(err => {
						console.error(err)
					});
				};
				bdddb.allAsync = function (sql) {
					var that = this;
					return new Promise(function (resolve, reject) {
						that.all(sql, function (err, row) {
							if (err)
							{
								console.log("runAsync ERROR! ", err);
								reject(err);
							}
							else
								resolve(row);
						});
					}).catch(err => {
						console.error(err)
					});
				};	
				bdddb.runAsync = function (sql) {
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
					});
				};
				console.log('Inserting Labels into db');
				var image_results = await bdddb.allAsync("SELECT * FROM Images");
				var class_list = await bdddb.allAsync("SELECT * FROM Classes");
				// console.log(class_list);
				var class_set = new Set();
				for (var k = 0; k < class_list.length; k++){
					// console.log(class_list[i]);
					class_set.add(class_list[k].CName);
				}
				// image_results is empty fix it!
				var labelID = 0;
				for (var i = 0; i < image_results.length; i++) {
					var img = fs.readFileSync(`${images_path}/${image_results[i].IName}`), 
						img_data = probe.sync(img),
						img_w = img_data.width,
						img_h = img_data.height;
						
					// console.log(label_bootstrap_data[i].objects);
					for (var f = 0; f < label_bootstrap_data[i].objects.length; f++) {
						var bootstrap_obj = label_bootstrap_data[i].objects[f];
						var relative_coords = bootstrap_obj.relative_coordinates;

						var label_width = img_w * relative_coords.width;
						var label_height = img_h * relative_coords.height;
						var left_x = relative_coords.center_x * img_w - (label_width / 2);
						var bottom_y = relative_coords.center_y * img_h - (label_height / 2);
						var className =  bootstrap_obj.name;
						var confidence = Math.round(Number(bootstrap_obj.confidence) * 100);
						labelID += 1;

						if(!class_set.has(className)){
							await bdddb.runAsync("INSERT INTO Classes (CName) VALUES ('" + className +"')");
						}

						// console.log("INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES ('"+Number(labelID)+"', '" + className + "', '" + Number(left_x) + "', '" + Number(bottom_y) + "', '" + Number(label_width) + "', '" + Number(label_height) + "', '" + image_results[i].IName + "')");
						await bdddb.runAsync("INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES ('"+Number(labelID)+"', '" + className + 
						"', '" + Number(left_x) + 
						"', '" + Number(bottom_y) + 
						"', '" + Number(label_width) + 
						"', '" + Number(label_height) + 
						"', '" + image_results[i].IName + "')");

						await bdddb.runAsync("INSERT INTO Validation (Confidence, LID, CName, IName) VALUES ('" + confidence + "', '" + Number(labelID) + 
						"', '" + className +
						"', '" + image_results[i].IName + "')");//tp2

						class_set.add(className);
													

						
					}
				}
				bdddb.close(function(err){
					if(err)
					{
						console.error(err);
					}
					else{
						console.log("bdddb closed successfully");
						res.send("Project creation successful. Labels Applied Succesfully");
					}
				});
			}
		});
	}
	
});



api.post('/updateLabels', async (req, res) => {
	console.log("updateLabels");

	var IDX = parseInt(req.body.IDX),
		PName = req.body.PName,
		admin = req.body.Admin,
		user = req.cookies.Username;

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/';

	// get form inputs
	var	user = req.body.user,
		CName = req.body.CName,
		IName = req.body.IName,
		rev_image = req.body.rev_image,
		prev_IName = req.body.prev_IName,
		next_IName = req.body.next_IName,
		change_width = req.body.origin_image_width / req.body.image_width,
		labels_counter = parseInt(req.body.labels_counter),
		curr_class = req.body.curr_class,
		sortFilter = req.body.sortFilter,
		imageClass = req.body.imageClass,
		form_action = req.body.form_action;
	
	// set paths
	var project_path = main_path + admin + '-' + PName;
	var uldb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to uldb.');
	});
	uldb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	uldb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	uldb.runAsync = function (sql) {
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
			console.error(err)
		});
	};	

	await uldb.runAsync("UPDATE Images SET reviewImage = '" + rev_image + "' WHERE IName = '" + IName + "'");
	
	var confidence = await uldb.allAsync("SELECT * FROM Validation WHERE IName = '" + IName + "'");

	await uldb.runAsync("DELETE FROM Labels WHERE IName = '" + IName + "'");
	await uldb.runAsync("DELETE FROM Validation WHERE IName = '" + IName + "'");
	var getAllClasses = await uldb.allAsync("SELECT * FROM Classes");

	var conf = {};

	if(confidence != []){
		for(var x = 0; x < confidence.length; x++){
			conf[confidence[x].LID] = confidence[x]
		}
	}

	var cur_conf = [];
	
	for(var j = 0; j < labels_counter; j++)
	{
		var tempLID = '';
		var width = 0;
		var height = 0;
		if (labels_counter == 1){
			tempLID = req.body.LabelingID;
			width = req.body.W;
			height = req.body.H;
		}
		else{
			tempLID = req.body.LabelingID[j];
			width = req.body.W[j];
			height = req.body.H[j];
		}

		if(!(width > 0) || !(height > 0)){
			cur_conf.push([]);
			continue;
		} 
		if(tempLID in conf){
			cur_conf.push([conf[tempLID]])
		}
		else{
			cur_conf.push([]);
		}

	}//tp3
	var labelsExists = await uldb.getAsync("SELECT COUNT(*) AS count FROM Labels");

	if(labelsExists.count == 0)
	{
		var newmax = 1;
	}
	else
	{
		var oldmax = await uldb.getAsync("SELECT * FROM Labels WHERE LID = (SELECT MAX(LID) FROM Labels)");
		var newmax = oldmax.LID + 1;
	}
	
	//Edit Labels Table
	if(labels_counter > 1){

		for(var i=0; i<labels_counter; i++){
			
			if(!(req.body.W[i] > 0) || !(req.body.H[i] > 0))
				continue
				 
			console.log(IName +
				"', X: '" + req.body.X[i] +
				"', Y: '" + req.body.Y[i] +
				"', W: '" + req.body.W[i] +
				"', H: '" + req.body.H[i] +
				"', CName: '" + CName[i]);
			
			// var conf = 0; 

				await uldb.runAsync("INSERT INTO Labels (LID, IName, X, Y, W, H, CName) VALUES ('"+Number(newmax)+"', '" + IName + 
				"', '" + Number(req.body.X[i]) + 
				"', '" + Number(req.body.Y[i]) + 
				"', '" + Number(req.body.W[i]) + 
				"', '" + Number(req.body.H[i]) + 
				"', '" + CName[i] + "')");

				if(cur_conf.length > 0){

					await uldb.runAsync("INSERT INTO Validation (Confidence, LID, CName, IName) VALUES ('" + Number(cur_conf[i][0].Confidence) + 
					"', '" + Number(newmax) +
					"', '" + cur_conf[i][0].CName + 
					"', '" + cur_conf[i][0].IName + "')"); 
				}

			newmax = newmax + 1;
		}
	}
	else if (labels_counter == 1) {

		
		console.log(IName +
			"', X: '" + req.body.X +
			"', Y: '" + req.body.Y +
			"', W: '" + req.body.W +
			"', H: '" + req.body.H +
			"', CName: '" + CName);
			await uldb.runAsync("INSERT INTO Labels (LID, IName, X, Y, W, H, CName) VALUES ('"+Number(newmax)+"', '" + IName +
			"', '" + Number(req.body.X) +
			"', '" + Number(req.body.Y) +
			"', '" + Number(req.body.W) +
			"', '" + Number(req.body.H) +
			"', '" + CName + "')");

			if(cur_conf.length > 0){
				console.log('inserting', cur_conf[0][0]);
				var cc = cur_conf[0][0];

				await uldb.runAsync("INSERT INTO Validation (Confidence, LID, CName, IName) VALUES ('" + Number(cc.Confidence) + 
				"', '" + Number(newmax) +
				"', '" + cc.CName + 
				"', '" + cc.IName + "')"); 
			}
	}
	
	// close the database
	uldb.close(function(err){
		if(err)
		{
			console.error(err);
		}
		else{
			console.log("uldb closed successfully");
		}
	});
	if(form_action == "save"){ return res.redirect('/labeling?IDX='+IDX+'&IName='+IName+'&curr_class='+curr_class); }
	else if(form_action == "auto-prev"){ return res.redirect('/labeling?IDX='+IDX+'&IName='+prev_IName+'&curr_class='+curr_class); }
	else if(form_action == "auto-next"){ return res.redirect('/labeling?IDX='+IDX+'&IName='+next_IName+'&curr_class='+curr_class); }
	else if(form_action == "auto-prevV"){ return res.redirect('/labelingV?IDX='+IDX+'&IName='+prev_IName+'&curr_class='+curr_class+'&sort='+sortFilter+'&class='+imageClass); }
	else if(form_action == "auto-nextV"){ return res.redirect('/labelingV?IDX='+IDX+'&IName='+next_IName+'&curr_class='+curr_class+'&sort='+sortFilter+'&class='+imageClass); }
});



/////////////////////////////////////////config page////////////////////////////////////////


api.post('/updateProject', async (req, res) => {
	console.log("updateProject");

	// get url
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;

	// get form input
	var new_project_name = req.body.project_name,
		project_description = req.body.project_description;

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/';
		
	var auto_save = 1;
	
	await db.runAsync("UPDATE Projects SET PDescription = '"+project_description+
		"', AutoSave = '"+auto_save+
		"' WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
	
	return res.redirect('/config?IDX='+IDX);
});



api.post('/deleteProject', async (req, res) => {
	console.log("deleteProject");

	// get url variables
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;


	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/';
		project_path = main_path + admin + '-' + PName;

	// Delete the Files
	var darknet_path = new Set();
	var tempdarknet = fs.readFileSync(project_path + '/training/darknetPaths.txt', 'utf-8').split('\n').join(',').split(',');
	for(var f = 0; f < tempdarknet.length; f++){
		if(tempdarknet[f] != ''){
			darknet_path.add(tempdarknet[f]);
		}
	}
	
	//Delete the YOLO Files
	const drknt_temp = darknet_path.values();
	for(var i = 0; i < darknet_path.size; i++){
		var current_darknet_path = drknt_temp.next().value;
		var darknetFiles = readdirSync(current_darknet_path);
		for(var i = 0; i < darknetFiles.length; i++){
			if(darknetFiles[i] == (admin + '-' + PName)){
				rimraf(current_darknet_path + '/' +  darknetFiles[i], (err) => {
					if(err)
					{
						console.error("there was an error with the user contents: ", err);
					}
					else
					{
						console.log("Darknet user project contents successfuly deleted")
					}
				});
			}
		}
	}

	rimraf(project_path, function (err) { 
		if(err)
		{
			console.error(err);
		}
		console.log("rimraf done"); 
	});
	fs.unlink(project_path + '/' + PName + '.db', function (err) { 
		if(err)
		{
			console.error(err);
		}
		else
		{
			console.log("done"); 
		}
	});
	
	await db.runAsync("DELETE FROM Access WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
	await db.runAsync("DELETE FROM Projects WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
	return res.redirect('/home');
});



api.post('/addClasses', async (req, res) => {
	console.log("addClasses");
	
	// get url variables
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		// mult = parseInt(req.body.mult),
		user = req.cookies.Username;
	

	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		project_path = main_path + admin + '-' + PName;	

	// Connect to database
	var acdb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to acdb.');
	});
	acdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	acdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	acdb.runAsync = function (sql) {
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
			console.error(err)
		});
	};

	// get form
	var input_classes = req.body.input_classes;
	if(input_classes.includes(",")){
		input_classes = req.body.input_classes.split(",");
	}

	// cleans the class input
	if(typeof(input_classes) == "string"){
		input_classes = input_classes.trim();
		input_classes = input_classes.split(' ').join('_');
	}
	else{
		//removes blanks
		var insert_classes = []
		for(i = 0; i < input_classes.length; i++){
			if(input_classes[i] != ""){
				insert_classes.push(input_classes[i])
			}
		}
	}
	
	var classesExist = await acdb.allAsync("SELECT CName FROM Classes");
	var cur_classes = [];
	for (var i = 0; i < classesExist.length; i++)
	{
		cur_classes.push(classesExist[i].CName);
	}
  
	console.log("addClasses (INSERT INTO Classes)");
	if(typeof(input_classes) == "string"){
		if(!cur_classes.includes(input_classes))
		{
			await acdb.runAsync("INSERT INTO Classes (CName) VALUES ('" +  input_classes + "')");
		}
	}
	else {
		for (var i = 0; i < insert_classes.length; i++) {
			if(!cur_classes.includes(insert_classes[i]))
			{
				cur_classes.push(insert_classes[i])
				await acdb.runAsync("INSERT INTO Classes (CName) VALUES ('" +  insert_classes[i] + "')");
			}
		}
	}
	
	// close the database
	acdb.close(function(err){
		if(err)
		{
			console.error(err);
		}
		else{
			console.log("acdb closed successfully");
		}
	});

	return res.redirect('/config?IDX='+IDX);
});


// add images to project
api.post('/addImages', async(req,res) => {
	console.log("addImages");

	const {exec} = require('child_process');

	var IDX = parseInt(req.body.IDX),
		upload_images = req.files.upload_images,
		project_name = req.body.PName,
		admin = req.body.Admin,
		user = req.cookies.Username;
	

	console.log("PName: ", project_name);
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + project_name, // $LABELING_TOOL_PATH/public/projects/project_name
		merge_path = project_path + '/merge/',
		merge_images = merge_path + 'images/',
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads';

	console.log("merge_path: ", merge_path);
	console.log("merge_images: ", merge_images);
	
	if (fs.existsSync(merge_path))
	{
		rimraf(merge_path, (err) => {
			if(err)
			{
				console.log(err);
			}
			else{
				fs.mkdir(merge_path, function(error){
					if (error)
					{
						// res.send({"Success": "No"});
						console.error(error);
						// res.send({"Success": "No"});
						return res.send("ERROR! "+error)
					}
					else{
						fs.mkdir(merge_images, function(error){
							if (error)
							{
								// res.send({"Success": "No"});
								console.error(error);
								// res.send({"Success": "No"});
								return res.send("ERROR! "+error);
							}
						});
					}
				});
			}
		});
	}
	else
	{
		// create temp merge folders
		fs.mkdir(merge_path, function(err){
			if (err)
			{
				// res.send({"Success": "No"});
				console.error(err);
				// res.send({"Success": "No"});
				return res.send("ERROR! "+err);
			}
			else
			{
				fs.mkdir(merge_images, function(err){
					if (err)
					{
						// res.send({"Success": "No"});
						console.error(err);
						// res.send({"Success": "No"});
						return res.send("ERROR! "+err);
					}
				});
			}
		});
	}

	// connect to current project database
	var aidb = new sqlite3.Database(project_path+'/'+ project_name +'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to aidb.');
	});
	aidb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};
	aidb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};	
	aidb.runAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.run(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err)
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};


	var newImages = [];
	
	var zip_path = project_path + '/' +upload_images.name; // $LABELING_TOOL_PATH/public/projects/{project_name}/{zip_file_name}
	await upload_images.mv(zip_path);

	console.log(`zip_path: ${zip_path}`);
	var zip = new StreamZip({file: zip_path})

	zip.on('error', err => {
		console.log(err);
		return res.send("ERROR! "+err);
	})
	zip.on('ready', async () =>{
		console.log(zip_path)
		zip.extract(null, merge_images, async (err, count) =>{
			console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
			zip.close();
			rimraf(zip_path, (err) => {
				if(err)
				{
					console.log(err);
					// res.send({"Success": "could not remove zip file"});
					return res.send("ERROR! "+err);
				}
			})
			console.log("images_path: ", images_path);
			console.log("merge_images: ", merge_images);
			files = await readdirAsync(images_path);
			newfiles = await readdirAsync(merge_images);
			console.log("Found ",newfiles.length," files");

			for (var i = 0; i < newfiles.length; i++) 
			{
				// console.log(newfiles[i]);


				// //supposed to clean filenames, Remove trailing and leading spaces and swap 0s and +s with _.
				var temp = merge_images+'/'+newfiles[i];
				newfiles[i] = newfiles[i].trim();
				newfiles[i] = newfiles[i].split(' ').join('_');
				newfiles[i] = newfiles[i].split('+').join('_');
				fs.rename(temp, merge_images + '/' + newfiles[i], () => {});
				if(newfiles[i] == "__MACOSX")
				{
					continue;
				}
				else if(!files.includes(newfiles[i]))
				{
					fs.rename(merge_images+'/'+newfiles[i], images_path+'/'+newfiles[i], function(err){
						if (err)
						{
							// res.send({"Success": "could not move new images"});
							console.error(err);
							return res.send("ERROR! "+err);
						}
						// console.log("new file moved");
					});
					await aidb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('"+newfiles[i]+"', '"+0+"', '"+0+"')");
					newImages.push(newfiles[i]);
				}
			}
		
			//close project database
			aidb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("aidb closed successfully");
				}
			});

			//rimraf.sync(merge_path);
			rimraf(merge_path, (err) => {
				if(err)
				{
					console.log(err);
				}
			});
			// res.send({"Success": "Yes"});
			return res.send("New Images Added");
		});
	});	
});


api.post('/downloadDataset', async (req, res) => {
	console.log("downloadingData");

	// get URL variables
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		// mult = parseInt(req.body.mult),
		user = req.cookies.Username;


	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		merge_path = project_path + '/merge/',
		merge_images = merge_path + 'images/',
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads';
		bootstrap_path = project_path + '/bootstrap';
	
	if(!fs.existsSync(downloads_path))
	{
		fs.mkdir(downloads_path, (err) => {
			if(err)
			{
				console.log(err)
			}
		});
	}
	// Connect to database
	var dddb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to dddb.');
	});
	dddb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	dddb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	dddb.runAsync = function (sql) {
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
		});
	};
	
	// get form
	var download_format = parseInt(req.body.download_format);

	var cnames = [];
	var results1 = await dddb.allAsync("SELECT * FROM Classes");
	var results2 = await dddb.allAsync("SELECT * FROM Images");
	for(var i = 0; i < results1.length; i++)
	{
		cnames.push(results1[i].CName);
	}

	// Yolo Format
	if(download_format == 0){
		
		var dict_images_labels = {}
		for(var i=0; i<results2.length; i++){
			var img = fs.readFileSync(`${images_path}/${results2[i].IName}`),
				img_data = probe.sync(img),
				img_w = img_data.width,
				img_h = img_data.height;

			var results3 = await dddb.allAsync("SELECT * FROM Labels WHERE IName = '" + results2[i].IName + "'");
			for(var j=0; j<results3.length; j++){
				// x, y, w, h
				var centerX = (results3[j].X+(results3[j].W/2))/img_w;
				var centerY = (results3[j].Y+(results3[j].H/2))/img_h
				to_string_value = cnames.indexOf(results3[j].CName) +" "+centerX+" "+centerY+" "+results3[j].W/img_w +" "+results3[j].H/img_h +"\n"
				if(dict_images_labels[results2[i].IName] == undefined){
					dict_images_labels[results2[i].IName] = to_string_value;
				}
				else {
					dict_images_labels[results2[i].IName] += to_string_value;
				}
			}
			if(results3.length == 0)
			{
				dict_images_labels[results2[i].IName] = "";
			}
		}
	   
		var output = fs.createWriteStream(`${downloads_path}/yolo.zip`);
		var archive = archiver('zip');
		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
			dddb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dddb closed successfully");
				}
			});
			res.download(`${downloads_path}/yolo.zip`);
		});
		
		archive.on('error', function(err){
			throw err;
		});
		
		archive.pipe(output);
		console.log("Writing labels");
		for(var key in dict_images_labels){
			remove_dot_ext = key.split(".")[0]
			fs.writeFileSync(`${downloads_path}/${remove_dot_ext}.txt`,dict_images_labels[key] , (err) => {
				if (err) throw err;
			});
			archive.file(`${downloads_path}/${remove_dot_ext}.txt`, { name: remove_dot_ext+".txt" });
		}
		
		// Classes file
		console.log("Writing Classes file");
		var classes="";
		for(var i=0; i<results1.length; i++)
		{
			classes = classes + results1[i].CName + '\n';
		}
		classes = classes.substring(0, classes.length - 1);
		fs.writeFileSync(downloads_path+'/'+PName+'_Classes.txt', classes, (err) => {
			if (err) throw err;
			console.log("done writing Classes file");
		});
		await archive.file(downloads_path+'/'+PName+'_Classes.txt', { name: PName+"_Classes.txt" });
		
		//Images	
		archive.directory(images_path, false);
		
		
		archive.finalize();
	}

	// Tensorflow format
	// TODO xmin/ymin
	else if(download_format == 1){
		var labels = await dddb.allAsync("SELECT * FROM Labels");
		var xmin = 0;
		var xmax = 0;
		var ymin = 0;
		var ymax = 0;
		var data='filename,width,height,class,xmin,ymin,xmax,ymax\n';
		for(var i = 0; i < labels.length; i++)
		{
			xmin = labels[i].X
			xmax = xmin + labels[i].W;
			ymin = labels[i].Y
			ymax = ymin + labels[i].H;

			var img = fs.readFileSync(`${images_path}/${labels[i].IName}`);
            var img_data = probe.sync(img);
            var img_w = img_data.width;
            var img_h = img_data.height;

			data = data + labels[i].IName + ',' + img_w + ',' + img_h + ',' + labels[i].CName + ',' + xmin + ',' + ymin + ',' + xmax + ',' + ymax + '\n';
		}

		fs.writeFile(downloads_path+'/'+PName+'_dataset.csv', data, (err) => {
			if (err) throw err;
			console.log("done writing csv");
		});

		var output = fs.createWriteStream(downloads_path+'/tensorflow.zip');
		var archive = archiver('zip');
		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
			dddb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dddb closed successfully");
				}
			});
			res.download(downloads_path+'/tensorflow.zip');
		});
		
		archive.on('error', function(err){
			throw err;
		});
		
		archive.pipe(output);
		
		archive.file(downloads_path+'/'+PName+'_dataset.csv', { name: PName+'_dataset.csv'});

		// var images = await dddb.allAsync("SELECT * FROM Images");
		// for(var i = 0; i < images.length; i++)
		// {
		// 	archive.file(public_path+"/public/projects/" + admin + '-' +PName+"/images/"+images[i].IName, {name: images[i].IName});
		// }

		archive.finalize();
	}
	// COCO
	else if(download_format == 2){
		var labels = await dddb.allAsync("SELECT * FROM Labels");
		var xmin = 0;
		var xmax = 0;
		var ymin = 0;
		var ymax = 0;
		var rows=[];
		var imageNames = [];
		var imageId = 0;
		
		for(var i = 0; i < labels.length; i++)
		{
			data = []
			xmin = labels[i].X
			xmax = xmin + labels[i].W;
			ymin = labels[i].Y
			ymax = ymin + labels[i].Y;

			data.push(labels[i].IName);
			data.push(labels[i].CName);
			data.push(labels[i].W);
			data.push(labels[i].H);
			data.push(xmin);
			data.push(xmax);
			data.push(ymin);
			data.push(ymax);
			data.push(labels[i].LID);

			rows.push(data);
		}
		var coco = {}
		var images = []
		var categories = []
		var annotations = []

		function im(pic, id){
			var image = {}
			var rel_image_path = images_path+pic;
		
			var img = fs.readFileSync(`${images_path}/${pic}`);
            var img_data = probe.sync(img);
            var img_w = img_data.width;
            var img_h = img_data.height;

			image["height"] = img_h;
			image["width"] = img_w;
			image["id"] = id;
			image["file_name"] = pic;
			return image;
		}

		function category(cname){
			var cat = {}
			cat["supercategory"] = 'None';
			cat["id"] = cnames.indexOf(cname);
			cat["name"] = cname;
			return cat;
		}

		function annotation(row){
			var anno = {}
			var area = (row[2] * row[3]);
			anno["segmentation"] = [];
			anno["iscrowd"] = 0;
			anno["area"] = area;
			anno["image_id"] = imageNames.indexOf(row[0]);
			anno["bbox"] = [row[4], row[6], row[2], row[3]];
			anno["category_id"] = cnames.indexOf(row[1]);
			anno["id"] = row[8];

			return anno;

		}
		for(var i = 0; i < results2.length; i++)
		{
			// console.log(results2[i].IName);
			imageNames.push(results2[i].IName);
			images.push(im(results2[i].IName, i));
		}
		for(var i = 0; i < rows.length; i++)
		{
			annotations.push(annotation(rows[i]));
		}
		for(var i = 0; i < cnames.length; i++)
		{
			categories.push(category(cnames[i]));
		}

		coco["images"] = images;
		// console.log("images: \n", images);
		coco["categories"] = categories;
		coco["annotations"] = annotations;

		var coco_data = JSON.stringify(coco);

		fs.writeFile(downloads_path+'/'+PName+'_coco.json', coco_data, (err) => {
			if (err) throw err;
			console.log("done writing csv");
		});
		var output = fs.createWriteStream(downloads_path+'/coco.zip');
		var archive = archiver('zip');
		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
			dddb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dddb closed successfully");
				}
			});
			res.download(downloads_path+'/coco.zip');
		});
		
		archive.on('error', function(err){
			throw err;
		});
		
		archive.pipe(output);
		
		archive.file(downloads_path+'/'+PName+'_coco.json', { name: PName+'_coco.json'});

		var images = await dddb.allAsync("SELECT * FROM Images");
		for(var i = 0; i < images.length; i++)
		{
			archive.file(public_path+"/public/projects/" + admin + '-' +PName+"/images/"+images[i].IName, {name: images[i].IName});
		}

		archive.finalize();
	}
	//Pascal VOC
	else if(download_format == 3){
		var output = fs.createWriteStream(downloads_path+'/VOC.zip');
		var archive = archiver('zip');
		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
			dddb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dddb closed successfully");
				}
			});
			res.download(downloads_path+'/VOC.zip');
		});
		
		archive.on('error', function(err){
			throw err;
		});
		
		archive.pipe(output);


		
		for(var i = 0; i < results2.length; i++)
		{
			var imgName = results2[i].IName;
			var imgPath = `${images_path}/${imgName}`;
			var img = fs.readFileSync(`${imgPath}`);
            var img_data = probe.sync(img);
            var img_w = img_data.width;
            var img_h = img_data.height;
			var img_d = img_data.depth;

			var data = "<annotation>\n";
				data += "\t<folder>images</folder>\n";
				data += `\t<filename>${imgName}</filename>\n`;
				data += `\t<path>${imgPath}</path>\n`;
				data += `\t<soruce>\n`;
				data += `\t\t<database>${PName}.db</database>\n`;
				data += `\t</soruce>\n`;
				data += `\t<size>\n`;
				data += `\t\t<width>${img_w}</width>\n`;
				data += `\t\t<height>${img_h}</height>\n`;
				data += `\t\t<depth>3</depth>\n`;
				data += `\t</size>\n`;
				data += `\t<segmented>0</segmented>\n`;

			var labels = await dddb.allAsync("SELECT * FROM Labels WHERE IName = '" + imgName + "'");
			for(var j = 0; j < labels.length; j++)
			{
				var className = labels[j].CName;
				var xmin = labels[j].X
				var xmax = xmin + labels[j].W;
				var ymin = labels[j].Y
				var ymax = ymin + labels[j].Y;
				
				data += `\t<object>\n`;
				data += `\t\t<name>${className}</name>\n`;
				data += `\t\t<pose>Unspecified</pose>\n`;
				data += `\t\t<truncated>0</truncated>\n`;
				data += `\t\t<difficult>0</difficult>\n`;

				data += `\t\t<bndbox>\n`;
				data += `\t\t\t<xmin>${xmin}</xmin>\n`;
				data += `\t\t\t<ymin>${ymin}</ymin>\n`;
				data += `\t\t\t<xmax>${xmax}</xmax>\n`;
				data += `\t\t\t<ymax>${ymax}</ymax>\n`;
				data += `\t\t</bndbox>\n`;
				data += `\t</object>\n`;
			}
			data += "</annotation>";
			
			var xmlname = imgName.split('.')[0] + '.xml'
			fs.writeFile(downloads_path+'/'+xmlname, data, (err) => {
				if (err) throw err;
				console.log("done writing xml");
			});
			archive.file(downloads_path+'/'+xmlname, { name: xmlname});
		}
		
		var images = await dddb.allAsync("SELECT * FROM Images");
		for(var i = 0; i < images.length; i++)
		{
			archive.file(public_path+"/public/projects/" + admin + '-' +PName+"/images/"+images[i].IName, {name: images[i].IName});
		}

		archive.finalize();

	}
	// Summary file
	else if(download_format == 4){
		var output = fs.createWriteStream(downloads_path+'/summary.zip');
		var archive = archiver('zip');
		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
			dddb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dddb closed successfully");
				}
			});
			// res.download(public_path+'/public/projects/' + admin + '-' +PName+'/downloads/summary.zip');
			res.download(downloads_path+'/summary.zip');
		});
		
		archive.on('error', function(err){
			throw err;
		});
		
		archive.pipe(output);
		var data="";
		console.log("Organize Data");
		for(var i=0; i<results2.length; i++)
		{
			// console.log("Image: ", results2[i].IName);
			data = data + results2[i].IName + '\t';
			var classname = await dddb.allAsync("SELECT DISTINCT CName FROM Labels WHERE IName = '" + results2[i].IName + "'");
			// console.log("distinct: ", classname);
			for(var j=0; j<classname.length; j++)
			{
				var count = await dddb.getAsync("SELECT COUNT(*) AS count FROM Labels WHERE IName = '"+ results2[i].IName +"' AND CName = '"+ classname[j].CName +"'");
				// console.log("count: ", count.count);
				// console.log("CName: ", classname[j].CName);
				data = data + count.count + ": " + classname[j].CName + '\t';
			}
			data = data + '\n';
		}
		
		// Create race condition
		// Not sure if using await will work
		// as it remains non-blocking and archive.file
		// does not use the value of fs.writeFile.
		// fs.writeFileSync is blocking but will cause further slowdown
		// fs.writeFile(public_path+'/public/projects/' + admin + '-' +PName+'/downloads/'+PName+'_Summary.txt', data, (err) => {
		fs.writeFile(downloads_path+'/'+PName+'_Summary.txt', data, (err) => {
			if (err) throw err;
			console.log("done writing summary");
			// archive.file(public_path+'/public/projects/' + admin + '-' +PName+'/downloads/'+PName+'_Summary.txt', { name: PName+"_Summary.txt" });
			archive.file(downloads_path+'/'+PName+'_Summary.txt', { name: PName+"_Summary.txt" });

			archive.finalize();
		});
		
	}
	else if(download_format == 5){
		if(fs.existsSync(bootstrap_path + '/out.json')){
			var output = fs.createWriteStream(downloads_path+'/initialClassification.zip');
			var archive = archiver('zip');
			output.on('close', function () {
				console.log(archive.pointer() + ' total bytes');
				console.log('archiver has been finalized and the output file descriptor has closed.');
				dddb.close(function(err){
					if(err)
					{
						console.error(err);
					}
					else{
						console.log("dddb closed successfully");
					}
				});
				
				res.download(downloads_path+'/initialClassification.zip');
			});
			
			archive.on('error', function(err){
				throw err;
			});
			
			archive.pipe(output);
			console.log("Organize Data");

			var raw_label_bootstrap_data = fs.readFileSync(bootstrap_path + '/out.json');
			// var label_bootstrap_data = JSON.parse(raw_label_bootstrap_data);

			fs.writeFile(downloads_path+'/out.json', raw_label_bootstrap_data, (err) => {
				if (err) throw err;
				console.log("done writing summary");
				// archive.file(public_path+'/public/projects/' + admin + '-' +PName+'/downloads/'+PName+'_Summary.txt', { name: PName+"_Summary.txt" });
				archive.file(downloads_path+'/out.json', { name: "out.json" });
	
				archive.finalize();
			});
		}
	}
});


//download project
api.post('/downloadProject', async(req, res) => {
	console.log("download Project");

	const {spawn} = require('child_process');
	
	// Get Project info from form
	var PName = req.body.PName;
	var admin = req.body.Admin;
	var username = req.cookies.Username;

	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		project_path = main_path + admin + '-' + PName,
		//download_path = project_path + '/downloads',
		download_path = main_path + username + '_Downloads'
		images_path = project_path +'/images/',
		bootstrap_path = project_path + '/bootstrap',
		training_path = project_path + '/training',
		python_path = training_path + '/python',
		logs_path = training_path + '/logs',
		//weights_path = training_path + '/weights',
		project_db = `${project_path}/${PName}.db`,
		dump_file = `${PName}.dump`,
		dump_path = `${project_path}/${dump_file}`;
	
	// return res.download(download_path + '/' +PName+'.zip');

	if(!fs.existsSync(download_path))
	{
		fs.mkdir(download_path, (err) => {
			if(err)
			{
				console.log(err)
			}
		});
	}

	// Connect to database ////////////////////////////////////////////////////////////////
	var dpdb = new sqlite3.Database(project_db, (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to dpdb.');
	});
	dpdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	dpdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});;
	};	
	dpdb.runAsync = function (sql) {
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
			console.error(err)
		});;
	};
	///////////////////////////////////////////////////////////////////////////////////////////



	// console.log("table exists: ", await dpdb.allAsync("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Labels'"));
	var table_exists = await dpdb.allAsync("SELECT COUNT(*) as CNT FROM sqlite_master WHERE type='table' AND name='Labels'")
	if(table_exists.CNT == 0)
	{
		// close the database
		dpdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("dpdb closed successfully");
			}
		});
		res.send({"Success": "No Labels table"});

	}
	else
	{
		/*
			Get dump of project database
			Zip together dump file and images
			download zipfile
		*/

		var output = fs.createWriteStream(download_path + '/' +PName+'.zip');

		var archive = archiver('zip');

		output.on('close', function () {
			console.log(archive.pointer() + ' total bytes');
			console.log('archiver has been finalized and the output file descriptor has closed.');
				
			// close database
			dpdb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("dpdb closed successfully");
				}
			});
			return res.download(download_path + '/' +PName+'.zip');
		});
				
		archive.on('error', function(err){
			// throw err;
			console.log(err)
			return
		});
				
		archive.pipe(output);

		//add project to zip
		archive.directory(project_path, false);

		archive.finalize();
	}
});




api.post('/test', async(req,res) => {
	console.log("test")
	let file = req.files.upload_project;
	console.log(file)

	var username = req.cookies.Username;
	
	var Numprojects = await db.getAsync("SELECT COUNT(*) AS THING FROM Access WHERE Username = '"+username+"'");
	console.log("numprojects: ", Numprojects.THING)
	res.send({"Success": "Test was successful"});
});



// import project
api.post('/import', async(req,res) => {
	req.setTimeout(600000);
	console.log("import");
	
	const {exec} = require('child_process');

	var upload_images = req.files["upload_file"],
		project_name = req.body.project_name,
		username = req.cookies.Username,
		auto_save = 1,
		project_description = "none";

	// console.log(upload_images)
	// Check if project name already exists
	var names = [];
	var Numprojects = await db.getAsync("SELECT COUNT(*) AS THING FROM Access WHERE Username = '"+username+"'");
	var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+username+"'");
	for(var i = 0; i < Numprojects.THING; i++)
	{
		names.push(projects[i].PName);
	}
	if(names.includes(project_name))
	{
		res.send({"Success": "That project name already exists"});
	}

	// Add project
	else
	{
		var public_path = __dirname.replace('routes',''),
			main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
			project_path = main_path + username + '-' + project_name, // $LABELING_TOOL_PATH/public/projects/project_name
			images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
			bootstrap_path = project_path + '/bootstrap', // $LABELING_TOOL_PATH/public/projects/project_name/bootstrap
			downloads_path = main_path + username + '_Downloads',
			training_path = project_path + '/training',
			logs_path = training_path + '/logs',
			python_path = training_path + '/python',
			weights_path = training_path + '/weights',
			python_path_file = training_path + '/Paths.txt',
			darknet_paths_file = training_path + '/darknetPaths.txt';
			
		if(!fs.existsSync(main_path))
		{
			fs.mkdirSync(main_path);
		}
		// create folders:
		if (!fs.existsSync(project_path)){
			console.log("addProejct (create folders)");
			fs.mkdirSync(project_path);
		}

		// console.log(project_path, project_name, images_path);
		
		var zip_path = project_path + '/' +upload_images.name; // $LABELING_TOOL_PATH/public/projects/{project_name}/{zip_file_name}
		await upload_images.mv(zip_path);

		var dump= '';
		var found = 0;
		
		//extract zip file
	
		console.log(`zip_path: ${zip_path}`);
		var zip = new StreamZip({file: zip_path})
		// console.log(`Unzipper: ${zip}`);

		zip.on('error', err => {
			console.log(err);
		})

		zip.on('ready', () =>{
			console.log("zip is ready");
			console.log('project_path: ' + project_path);
			zip.extract(null, project_path, async (err, count) =>{
				console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
				zip.close();
			
		
				// console.log(zip_path)
				console.log("images_path: ", images_path);
				files = await readdirAsync(project_path);
				console.log("Found ",files.length," files");

				console.log("Look for dump file");
				for (var i = 0; i < files.length; i++) {
					console.log(files[i]);
					if(files[i].substr(-3) == '.db')
					{
						found = 1;
						// console.log(files[i]);
						var idb = files[i];
						if(idb.substr(0, idb.length - 3) != project_name)
						{
							fs.rename(`${project_path}/${idb}`, `${project_path}/${project_name}.db`, (error) => {
								if(error)
								{
									console.log(error)
								}
							});
						}

						//Add project to global database
						var results1 = await db.allAsync("INSERT INTO Projects (PName, PDescription, AutoSave, Admin) VALUES ('" + project_name + "', '" + project_description + "', '" + auto_save +"', '" + username + "')");
						console.log("INSERT INTO Access");
						await db.runAsync("INSERT INTO Access (Username, PName, Admin) VALUES ('"+username+"', '"+project_name+"', '"+username+"')");
						
						//remove uploaded zipfile to save space
						fs.unlink(zip_path, (error) => {
							if(error)
							{
								console.log(error)
							}
						});
						
						var dbpath = `${project_path}/${project_name}.db`
						while(!fs.existsSync(dbpath))
						{
							console.log("");
						}
						// console.log("dbpath: ", dbpath)
						var imdb = new sqlite3.Database(dbpath, (err) => {
							if (err) {
								return console.error(err.message);
							}
							console.log('Connected to imdb.');
						});
						imdb.getAsync = function (sql) {
							var that = this;
							return new Promise(function (resolve, reject) {
								that.get(sql, function (err, row) {
									if (err)
									{
										console.log("runAsync ERROR! ", err);
										imdb.close(function(err){
											if(err)
											{
												console.error(err);
											}
											else{
												console.log("imdb closed");
											}
										});
										reject(err);
									}
									else
										resolve(row);
								});
							}).catch(err => {
								console.error(err)
								res.send({"Success": "No"})
							});
						};
						imdb.allAsync = function (sql) {
							var that = this;
							return new Promise(function (resolve, reject) {
								that.all(sql, function (err, row) {
									if (err)
									{
										console.log("runAsync ERROR! ", err);
										imdb.close(function(err){
											if(err)
											{
												console.error(err);
											}
											else{
												console.log("imdb closed");
											}
										});
										reject(err);
									}
									else
										resolve(row);
								});
							}).catch(err => {
								console.error(err)
								res.send({"Success": "No"})
							});
						};	
						imdb.runAsync = function (sql) {
							var that = this;
							return new Promise(function (resolve, reject) {
								that.run(sql, function (err, row) {
									if (err)
									{
										console.log("runAsync ERROR! ", err);
										imdb.close(function(err){
											if(err)
											{
												console.error(err);
											}
											else{
												console.log("imdb closed");
											}
										});
										reject(err)
									}
									else
										resolve(row);
								});
							}).catch(err => {
								console.error(err)
								res.send({"Success": "No"})
							});
						};

						//Clean image and class names
						var images = await readdirAsync(images_path);
						var imcount = await imdb.allAsync("SELECT * FROM Images")
						var olddbimages = [];
						var dbimages = [];
						var fileTypes = ["jpeg", "JPEG", "jpg", "JPG", "png", "PNG", "tiff", "TIFF"]
						for(var j = 0; j < imcount.length; j++)
						{
							olddbimages.push(imcount[j].IName);
						}
						console.log("There are " + imcount.length + " images in the database");
						for (var j = 0; j < images.length; j++) {
							var oldimg = images[j];
							var image = images[j];
							image = image.trim();
							image = image.split(' ').join('_');
							image = image.split('+').join('_');
							var ext = image.split('.').pop()
							if(image != oldimg)
							{
								fs.rename(images_path + '/' + images[j], images_path + '/' + image, () => {});
							}
							if(olddbimages.includes(oldimg) && image != oldimg)
							{
								await imdb.runAsync("UPDATE Images SET IName = '" + image + "' WHERE IName = '" + images[j] + "'");
								await imdb.runAsync("UPDATE Labels SET IName = '" + image + "' WHERE IName = '" + images[j] + "'");
								await imdb.runAsync("UPDATE Validation SET IName = '" + image + "' WHERE IName = '" + images[j] + "'");
							}
							else if(!olddbimages.includes(oldimg) && fileTypes.includes(ext))
							{
								await imdb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('" + image + "', '" + 1 + "', '" + 0 + "')");
							}
						}
						
						var classes = await imdb.allAsync("SELECT CName FROM Classes");
						for(var j = 0; j < classes.length; j++)
						{
							var CName = classes[j].CName;
							CName = CName.trim();
							CName = CName.split(' ').join('_');
							await imdb.runAsync("UPDATE Classes SET CName = '" + CName + "' WHERE CName = '" + classes[j].CName + "'");
							await imdb.runAsync("UPDATE Labels SET CName = '" + CName + "' WHERE CName = '" + classes[j].CName + "'");
							await imdb.runAsync("UPDATE Validation SET CName = '" + CName + "' WHERE CName = '" + classes[j].CName + "'");
						}

						var labels = await imdb.allAsync("SELECT * FROM Labels");
						var confidence = await imdb.allAsync("SELECT * FROM Validation");
						var conf = {};
						for(var x; x < confidence.length; x++){
							console.log(confidence[x])
							conf[confidence[x].LID] = confidence[x]
						}
						// console.log(confidence);
						var cur_labels = [];
						var cur_conf = [];
						for(var j = 0; j < labels.length; j++)
						{
							if(labels[j].W > 0 && labels[j].H > 0)
							{
								cur_labels.push([labels[j].CName, labels[j].X, labels[j].Y, labels[j].W, labels[j].H, labels[j].IName]);
								// console.log(conf)
								if(labels[j].LID in conf){
									cur_conf.push([conf[labels[j].LID]])
								}
								else{
									cur_conf.push([]);
								}
							}
						}
						// console.log("CIR CONGAfADF");
						// console.log(cur_conf);
						await imdb.runAsync("DELETE FROM Labels");
						await imdb.runAsync("DELETE FROM Validation");
						for(var j = 0; j < cur_labels.length; j++)
						{
							await imdb.runAsync("INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES ('"+Number(j+1)+"', '" + cur_labels[j][0] + 
							"', '" + Number(cur_labels[j][1]) + 
							"', '" + Number(cur_labels[j][2]) + 
							"', '" + Number(cur_labels[j][3]) + 
							"', '" + Number(cur_labels[j][4]) + 
							"', '" + cur_labels[j][5] + "')");

							if(cur_conf[j].length != 0){
								await imdb.runAsync("INSERT INTO Validation (Confidence, LID, CName, IName) VALUES ('" + Number(cur_conf[i][0].Confidence) + 
							"', '" + Number(j+1) +
							"', '" + cur_conf[j][0].CName + 
							"', '" + cur_conf[j][0].IName + "')"); //tp4
							}
						}
						if (!fs.existsSync(bootstrap_path)){
							console.log("import Project (create folders)");
							fs.mkdirSync(bootstrap_path);
						}
						// Check for training related files
						if (!fs.existsSync(training_path)){
							console.log("addProject (create folders)");
							
							fs.mkdirSync(training_path);
							fs.mkdirSync(logs_path);
							fs.mkdirSync(python_path);
							fs.mkdirSync(weights_path);

							fs.writeFile(python_path_file, "", function(err){
								if(err)
								{
									console.log(err);
								}
							});
							fs.writeFile(darknet_paths_file, "", function(err){
								if(err)
								{
									console.log(err);
								}
							});
						}
						else
						{
							if(!fs.existsSync(logs_path))
							{
								fs.mkdirSync(logs_path);
							}

							if(!fs.existsSync(python_path))
							{
								fs.mkdirSync(python_path);
							}
							
							if(!fs.existsSync(weights_path))
							{
								fs.mkdirSync(weights_path);
							}
							
							if(!fs.existsSync(python_path_file))
							{
								fs.writeFile(python_path_file, "", function(err){
									if(err)
									{
										console.log(err);
									}
								});
							}
							
							if(!fs.existsSync(darknet_paths_file))
							{
								fs.writeFile(darknet_paths_file, "", function(err){
									if(err)
									{
										console.log(err);
									}
								});
							}
						}

						imdb.close(function(err){
							if(err)
							{
								console.error(err);
							}
							else{
								console.log("dpdb closed successfully");
							}
						});
						// res.send({"Success": "Yes"});
						res.send("Import Finished");
						break;
					}
				}
				if(found == 0)
				{
					//delete imported project
					rimraf(project_path, function (err) { 
						if(err)
						{
							console.error(err);
						}
						console.log("done"); 
					});
					res.send({"Success": "No .db file found"});
				}
			});
		});
	}
});




api.post('/mergeTest', async(req,res) => {
	console.log("\nmergeTest");

	const {exec} = require('child_process')
	const rmdir = util.promisify(fs.rmdir)
	const readdir = util.promisify(glob)
	//get form variables
	var upload_images = req.files.upload_project,
		project_name = req.body.PName,
		Admin = req.body.Admin,
		username = req.cookies.Username;

		console.log("project_name: ", project_name)
		console.log("Admin: ", Admin);
		console.log("upload: ", upload_images)

	//set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects',
		project_path = main_path + '/' + Admin + '-' + project_name,
		image_path = project_path + '/images',
		bootstrap_path = project_path + '/bootstrap',
		training_path = project_path + '/training',
		log_path = training_path + '/logs/',
		scripts_path = training_path + '/python/',
		python_path_file = training_path + '/Paths.txt',
		darknet_path_file = training_path + '/darknetPaths.txt',
		merge_path = project_path + '/merge',
		merge_images = merge_path + '/images/',
		zip_path = project_path + '/' +upload_images.name,
		newDB = merge_path + '/merge.db',
		dump = merge_path + '/merge.dump';

	//create merge file structure ///////////////////////////////////////////////////////////////////////////////////
	if(fs.existsSync(merge_path))
	{
		console.log("merge_path already exists");
		rimraf(merge_path, (err) => {
			if(err)
			{
				console.log(err);
			}
			else{
				fs.mkdir(merge_path, (error) => {
					if(error)
					{
						console.log(error)
					}
				})
			}
		});
	}
	else
	{
		fs.mkdir(merge_path, (err) => {
			if (err)
			{
				console.error(err);
				// res.send({"Success": "merge_path directory failed to make"});
				return res.send("ERROR! merge_path directory failed to make")
				
			}
		});
	}



	// connect to current project database /////////////////////////////////////////////////////////////////////////////
	var mdb = new sqlite3.Database(project_path+'/'+ project_name +'.db', function(err){
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to mdb.');
	});
	mdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	mdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	mdb.runAsync = function (sql) {
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
			console.error(err)
		});
	};



	var newImages = [];
	var incomingDB;
	var found = 0;
	
	//move zip file to zip_path
	await upload_images.mv(zip_path);
	console.log(`zip_path: ${zip_path}`);
	var zip = new StreamZip({file: zip_path})

	zip.on('error', err => {
		console.log("There was an error!");
		console.log(err)
		mdb.close((err) => {
			if(err)
			{
				console.log(err);
			}
			else
			{
				console.log("mdb closed successfully");
			}
		});

		fs.unlink(zip_path, (error) => {
			if(error)
			{
				console.log(error)
			}
		});

		rimraf(merge_path, (err) => {
			if(err)
			{
				console.error("there was an error with contents: ", err);
			}
			else
			{
				console.log("merge_path contents successfuly deleted")
			}
		});

		// res.send({"Success": "No .db file found"});	
		return res.send("ERROR! "+ err)
	});

	//extract contents of zip file into merge_images
	zip.on('ready', () =>{
		console.log("zip is ready");
		zip.extract(null, merge_path, async (err, count) =>{
			console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
			zip.close();
			//read current list of images
			var currImages = await readdirAsync(image_path)
			console.log("current Images: ", currImages);	
			//read in new files
			var newfiles = await readdirAsync(merge_path); 
			//look for .db file
			//keep track of new files (don't keep images you already have)
			console.log("found " + newfiles.length + " files")
			for(var i = 0; i < newfiles.length; i++)
			{
				// console.log(newfiles[i]);
				if(newfiles[i].split('.').pop() == "db")
				{
					console.log("found .db file")
					found = 1;
					incomingDB = newfiles[i]
				}
			}
			
			//If no .db file found, delete merge structure and new data
			if(found == 0)
			{
				console.log("no db found");
				console.log("delete contents of merge_path");
				try{
					await rimraf(merge_path, (err) => {
						if(err)
						{
							console.error("there was an error with contents: ", err);
						}
						else
						{
							console.log("merge_path contents successfuly deleted")
						}
					});
				}
				catch (e)
				{
					console.log("there was an error with contents");
					console.log(e);
					console.log("leaving catch block");
				}
				console.log("deleted merge_path");
				mdb.close((err) => {
					if(err)
					{
						console.log(err);
					}
					else
					{
						console.log("mdb closed successfully");
					}
				});
				// res.send({"Success": "No .db file found"});	
				return res.send("ERROR! No Database file (.db) found!")
			}
			else //Merge Projects ///////////////////////////////////////////////////////////////////////////////////////////////
			{	
				
				// Transfer incoming runs to current runs
				var merge_runs_path = `${merge_path}/training/logs/`
				if(fs.existsSync(merge_run_path))
				{
					console.log("merge_runs: ", merge_runs_path)
					var merge_runs = await readdirAsync(merge_runs_path);
					console.log("incoming runs: ", merge_runs);
					for(var i = 0; i < merge_runs.length; i++)
					{
						
						var merge_run_path = `${merge_runs_path}${merge_runs[i]}`
						console.log("merge_run_path: ", merge_run_path)
						if(fs.lstatSync(merge_run_path).isDirectory())
						{
							var merge_logs = await readdirAsync(merge_run_path)
							console.log("merge_logs: ", merge_logs)
							var new_run_path = path.join(log_path, merge_runs[i]);
							if(!fs.existsSync(new_run_path))
							{
							
								fs.mkdirSync(new_run_path);
								console.log("new_run_path: ", new_run_path)
								for(var j = 0; j < merge_logs.length; j++)
								{
									var merge_log_path = path.join(merge_run_path, merge_logs[j]);
									var new_log_path = path.join(new_run_path, merge_logs[j]);
									fs.renameSync(merge_log_path, new_log_path); 
								}
							}
						}
					}
				}
				// Transfer incoming bootstrap files to current files
				var merge_bootstrap_path = `${merge_path}/bootstrap/`;
				if(fs.existsSync(merge_bootstrap_path))
				{
					var merge_files = await readdirAsync(merge_bootstrap_path);
					for(var i = 0; i < merge_files.length; i++){
						var extension = merge_files[i].split('.').pop();
						if( ["weights", "cfg", "data", "json", "txt"].includes(extension)){
							var merge_file_path = path.join(merge_bootstrap_path, merge_files[i]);
							var cur_files = await readdirAsync(bootstrap_path);
							var merge_file_name = merge_files[i];
							var j = 1;
							var t = `${merge_files[i].split('.')[0]}${j}.${extension}`
							while(cur_files.includes(merge_file_name))
							{
								merge_file_name = `${merge_files[i].split('.')[0]}${j}.${extension}`
								
							}
							var new_file_path = path.join(bootstrap_path, merge_file_name);
							fs.rename(merge_file_path, new_file_path, (error) => {
								if(error){
									console.log(error)
								}
							});
						}
					}
				}
				// Transfer incomimg python scripts to current scripts
				var merge_scripts_path = `${merge_path}/training/python/`;
				if(fs.existsSync(merge_scripts_path))
				{
					var merge_scripts = await readdirAsync(merge_scripts_path);		
					for(var i = 0; i < merge_scripts.length; i++)
					{
						if(merge_scripts[i].split('.').pop() == "py")
						{
							var merge_script_path = path.join(merge_scripts_path, merge_scripts[i]);
							var cur_scripts = await readdirAsync(scripts_path);
							var merge_script_name = merge_scripts[i];
							var j = 1;
							var t = `${merge_scripts[i].split('.')[0]}${j}.py`
							// console.log("split name: ", t)
							while(cur_scripts.includes(merge_script_name))
							{
								merge_script_name = `${merge_scripts[i].split('.')[0]}${j}.py`
								
							}
							var new_script_path = path.join(scripts_path, merge_script_name);
							fs.rename(merge_script_path, new_script_path, (error) => {
								if(error){
									console.log(error)
								}
							});
							
						}
					}
				}

				// Add incoming python paths
				if(fs.existsSync(python_path_file))
				{
					var current_paths_arr = [];
					current_paths_arr.push(fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean));
					var current_paths = [];
					current_paths = (current_paths.concat.apply(current_paths, current_paths_arr)).filter(Boolean);
			
					var merge_path_file = `${merge_path}/training/Paths.txt`;
					if(fs.existsSync(merge_path_file))
					{
						var merge_paths_arr = [];
						merge_paths_arr.push(fs.readFileSync(merge_path_file, 'utf-8').split('\n').filter(Boolean));
						var merge_paths = [];
						merge_paths = (merge_paths.concat.apply(merge_paths, merge_paths_arr)).filter(Boolean);
						var new_paths = '';
						for(var i = 0; i < merge_paths.length; i++)
						{
							if(current_paths.includes(merge_paths[i]))
							{
								continue;
							}
							new_paths = `${new_paths}${merge_paths[i]}\n`
						}
						console.log("new python paths: ", new_paths);
						fs.appendFile(python_path_file, new_paths, (err) => {
							if (err) throw err;
				
						});
					}
				}

				// Add incoming darknet paths
				if(fs.existsSync(darknet_path_file))
				{
					var darknet_current_paths_arr = [];
					darknet_current_paths_arr.push(fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean));
					var darknet_current_paths = [];
					darknet_current_paths = (darknet_current_paths.concat.apply(darknet_current_paths, darknet_current_paths_arr)).filter(Boolean);
			
					var darknet_merge_path_file = `${merge_path}/training/darknetPaths.txt`;
					if(fs.existsSync(darknet_merge_path_file))
					{
						var darknet_merge_paths_arr = [];
						darknet_merge_paths_arr.push(fs.readFileSync(darknet_merge_path_file, 'utf-8').split('\n').filter(Boolean));
						var darknet_merge_paths = [];
						darknet_merge_paths = (darknet_merge_paths.concat.apply(darknet_merge_paths, darknet_merge_paths_arr)).filter(Boolean);
						var darknet_new_paths = '';
						for(var i = 0; i < darknet_merge_paths.length; i++)
						{
							if(darknet_current_paths.includes(darknet_merge_paths[i]))
							{
								continue;
							}
							darknet_new_paths = `${darknet_new_paths}${darknet_merge_paths[i]}\n`
						}
						console.log("new darknet paths: ", darknet_new_paths);
						fs.appendFile(darknet_path_file, darknet_new_paths, (err) => {
							if (err) throw err;
				
						});
					}
				}

				//connect to new database//////////////////////////////////////////////////////////////////
				var nmdb = new sqlite3.Database(merge_path + '/' +incomingDB, function(err){
					if (err) {
						return console.error(err.message);
					}
					console.log('Connected nmdb database.');
				});
				nmdb.getAsync = function (sql) {
					var that = this;
					return new Promise(function (resolve, reject) {
						that.get(sql, function (err, row) {
							if (err)
							{
								console.log("runAsync ERROR! ", err);
								reject(err);
							}
							else
								resolve(row);
						});
					}).catch(err => {
						console.error(err)
					});
				};
				nmdb.allAsync = function (sql) {
					var that = this;
					return new Promise(function (resolve, reject) {
						that.all(sql, function (err, row) {
							if (err)
							{
								console.log("runAsync ERROR! ", err);
								reject(err);
							}
							else
								resolve(row);
						});
					}).catch(err => {
						console.error(err)
					});
				};	
				nmdb.runAsync = function (sql) {
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
						console.error(err)
					});
				};
				


				// merge classes //////////////////////////////////////////////////////
				var results1 = await mdb.allAsync("SELECT * FROM Classes");
				var cur_classes = [];
				for(var i = 0; i < results1.length; i++)
				{
					cur_classes.push(results1[i].CName);
				}
				
				var results2 = await nmdb.allAsync("SELECT * FROM Classes");
				for(var i = 0; i < results2.length; i++)
				{
					var temp = results2[i].CName;
					results2[i].CName = results2[i].CName.trim();
					results2[i].CName = results2[i].CName.split(' ').join('_');
					if(!cur_classes.includes(results2[i].CName))
					{
						await nmdb.runAsync("UPDATE Labels SET CName = '" + results2[i].CName + "' WHERE CName = '" + temp + "'");
						cur_classes.push(results2[i].CName);
						await mdb.runAsync("INSERT INTO Classes (CName) VALUES ('"+results2[i].CName+"')");
					}
				}


				// merge images /////////////////////////////////////////////////////////
				//Check base database for missing/renamed images
				var curr_DB_Images = await readdirAsync(image_path);
				var dbimages = []
				var fileTypes = ["jpeg", "JPEG", "jpg", "JPG", "png", "PNG", "tiff", "TIFF"]
				
				// console.log("current Images: ", currImages);	
				
				//Check incoming database for missing/renamed images
				var currImages = await readdirAsync(merge_images);
				var dbimages = []
				var currDB = await nmdb.allAsync("SELECT * FROM Images");
				var nmdbimages = [];
				for(var j = 0; j < currDB.length; j++)
				{
					dbimages.push(currDB[j].IName);
				}
				for (var j = 0; j < currImages.length; j++) {
					var oldimg = currImages[j];
					var image = currImages[j]
					image = image.trim();
					image = image.split(' ').join('_');
					image = image.split('+').join('_');
					var ext = image.split('.').pop()
					fs.rename(merge_images + currImages[j], merge_images + image, () => {});
					nmdbimages.push(image);
					if(dbimages.includes(oldimg))
					{
						await nmdb.runAsync("UPDATE Images SET IName = '" + image + "' WHERE IName = '" + currImages[j] + "'");
						await nmdb.runAsync("UPDATE Labels SET IName = '" + image + "' WHERE IName = '" + currImages[j] + "'");
					}
					else if(fileTypes.includes(ext))
					{
						await nmdb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('" + image + "', '" + 1 + "', '" + 0 + "')");
					}
				}
				

				var results4 = await nmdb.allAsync("SELECT * FROM Images");
				console.log("moving new images");
				for(var i = 0; i < results4.length; i++)
				{
					if(!curr_DB_Images.includes(results4[i].IName))
					{
						fs.rename(merge_images+results4[i].IName, image_path+'/'+results4[i].IName, function(err){
							if (err)
							{
								return console.error(err);
							}
						});
						await mdb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('"+results4[i].IName+"', '"+results4[i].reviewImage+"', '"+results4[i].validateImage+"')");
						curr_DB_Images.push(results4[i].IName);
					}
				}
				console.log("Done moving new images");

				// merge labels ///////////////////////////////////////////////////////////////
				// count current labels
				var labelsExists = await mdb.getAsync("SELECT COUNT(*) AS count FROM Labels");
				console.log("LabelsExists: ", labelsExists.count);
				if(labelsExists.count == 0)
				{
					var newmax = 1;
				}
				else
				{
					var oldmax = await mdb.getAsync("SELECT * FROM Labels WHERE LID = (SELECT MAX(LID) FROM Labels)");
					var newmax = oldmax.LID + 1;
				}

				// get current labels
				var results5 = await mdb.allAsync("SELECT * FROM Labels");
				var cur_labels = [];
				for(var i = 0; i < results5.length; i++)
				{
					cur_labels.push([results5[i].CName, results5[i].X, results5[i].Y, results5[i].W, results5[i].H, results5[i].IName]);
				}

				// get incoming labels
				var results6 = await nmdb.allAsync("SELECT * FROM Labels");
				var new_labels = [];
				var newl = 0;
				for(var i = 0; i < results6.length; i++)
				{
					new_labels.push([results6[i].CName, results6[i].X, results6[i].Y, results6[i].W, results6[i].H, results6[i].IName]);
					
					// check if incoming label already exists in current dataset
					for(var j = 0; j < cur_labels.length; j++)
					{
						if(cur_labels[j][0] === new_labels[i][0] && cur_labels[j][1] === new_labels[i][1] && cur_labels[j][2] === new_labels[i][2] && cur_labels[j][3] === new_labels[i][3] && cur_labels[j][4] === new_labels[i][4] && cur_labels[j][5] === new_labels[i][5])
						{
							newl = 1;
						}
					}
					// add incoming label to database
					if(newl == 0)
					{
						cur_labels.push([results6[i].CName, results6[i].X, results6[i].Y, results6[i].W, results6[i].H, results6[i].IName]);
						await mdb.runAsync("INSERT INTO Labels (LID, IName, X, Y, W, H, CName) VALUES ('"+Number(newmax)+"', '" + results6[i].IName + "', '" + Number(results6[i].X) + "', '" + Number(results6[i].Y) + "', '" + Number(results6[i].W) + "', '" + Number(results6[i].H) + "', '" + results6[i].CName + "')");
						newmax = newmax + 1;
					}
					newl = 0;
				}

				// close databases //////////////////////////////////////////////////////////////////////
				mdb.close((err) => {
					if(err)
					{
						console.log(err);
					}
					else
					{
						console.log("mdb closed successfully");
					}
				});

				nmdb.close((err) => {
					if(err)
					{
						console.log(err);
					}
					else
					{
						console.log("nmdb closed successfully");
						// delete merge_path
						try{
							rimraf(merge_path, (err) => {
								if(err)
								{
									console.error("there was an error with contents: ", err);
								}
								else
								{
									console.log("merge_path contents successfuly deleted")
								}
							});
						}
						catch (e)
						{
							console.log("there was an error with contents");
							console.log(e);
							console.log("leaving catch block");
						}
						fs.unlink(zip_path, (error) => {
							if(error)
							{
								console.log(error)
							}
						});
					}
				});
			

				// res.send({"Success": "merge successful"});
				res.send("Merge successful")
			}// End Merge //////////////////////////////////////////////////////////////////////////////////////////////	
		});
	})
});

//TODO add correct res.send to finish the function
api.post('/mergeLocal', async(req, res) => {
    console.log("mergeLocal");

    var PName = req.body.PName,
		Admin = req.body.Admin,
        mergeName = req.body.mergeName,
        mergeAdmin = req.body.mergeAdmin,
		username = req.cookies.Username;

    console.log("PName: ", PName);
    console.log("Admin: ", Admin);
    console.log("MergeName: ", mergeName);
    console.log("mergeAdmin: ", mergeAdmin);

	//set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects',
		project_path = main_path + '/' + Admin + '-' + PName,
        mdb_path = project_path + '/' + PName + '.db',
		image_path = project_path + '/images',
		training_path = project_path + '/training',
		log_path = training_path + '/logs/',
		scripts_path = training_path + '/python/',
		python_path_file = training_path + '/Paths.txt',
		darknet_path_file = training_path + '/darknetPaths.txt';

	var	merge_path = main_path + '/' + mergeAdmin + '-' + mergeName,
        mergeDB_path = merge_path + '/' + mergeName + '.db',
        merge_images = merge_path + '/images/',
		merge_training = merge_path + '/training',
        merge_log = merge_training + '/logs/',
        merge_scripts_path = merge_training + '/python',
        merge_python_file = merge_training + '/Paths.txt',
        merge_darknet_file = merge_training + '/darknetPaths.txt';
        
    var mdb = new sqlite3.Database(mdb_path, function(err){
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to mdb.');
    });
    mdb.getAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.get(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };
    mdb.allAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };	
    mdb.runAsync = function (sql) {
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
            console.error(err)
        });
    };


    var mergeDB = new sqlite3.Database(mergeDB_path, function(err){
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to mergeDB.');
    });
    mergeDB.getAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.get(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };
    mergeDB.allAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };	
    mergeDB.runAsync = function (sql) {
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
            console.error(err)
        });
    };
    


    // Transfer incoming runs to current runs
    // var merge_runs_path = `${merge_path}/training/logs/`
    if(fs.existsSync(merge_log))
    {
        console.log("merge_runs: ", merge_log)
        var merge_runs = await readdirAsync(merge_log);
        console.log("incoming runs: ", merge_runs);
        for(var i = 0; i < merge_runs.length; i++)
        {
            
            var merge_run_path = `${merge_log}${merge_runs[i]}`
            console.log("merge_run_path: ", merge_run_path)
            if(fs.lstatSync(merge_run_path).isDirectory())
            {
                var merge_logs = await readdirAsync(merge_run_path)
                console.log("merge_logs: ", merge_logs)
                var new_run_path = path.join(log_path, merge_runs[i]);
                if(!fs.existsSync(new_run_path))
                {
                
                    fs.mkdirSync(new_run_path);
                    console.log("new_run_path: ", new_run_path)
                    for(var j = 0; j < merge_logs.length; j++)
                    {
                        var merge_log_path = path.join(merge_run_path, merge_logs[j]);
                        var new_log_path = path.join(new_run_path, merge_logs[j]);
                        // fs.renameSync(merge_log_path, new_log_path);
                        fs.copyFile(merge_log_path, new_log_path, (err) => {
                            if(err)
                            {
                                console.log(err)
                            }
                        }); 
                    }
                }
            }
        }
    }


    // Transfer incomimg python scrips to current scripts
    // var merge_scripts_path = `${merge_path}/training/python/`;
    if(fs.existsSync(merge_scripts_path))
    {
        var merge_scripts = await readdirAsync(merge_scripts_path);		
        for(var i = 0; i < merge_scripts.length; i++)
        {
            if(merge_scripts[i].split('.').pop() == "py")
            {
                var merge_script_path = path.join(merge_scripts_path, merge_scripts[i]);
                var cur_scripts = await readdirAsync(scripts_path);
                var merge_script_name = merge_scripts[i];
                var j = 1;
                var t = `${merge_scripts[i].split('.')[0]}${j}.py`
                // console.log("split name: ", t)
                while(cur_scripts.includes(merge_script_name))
                {
                    merge_script_name = `${merge_scripts[i].split('.')[0]}${j}.py`
                    
                }
                var new_script_path = path.join(scripts_path, merge_script_name);
                fs.copyFile(merge_script_path, new_script_path, (error) => {
                    if(error){
                        console.log(error)
                    }
                });
                
            }
        }
    }

    // Add incoming python paths
    if(fs.existsSync(python_path_file))
    {
        var current_paths_arr = [];
        current_paths_arr.push(fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean));
        var current_paths = [];
        current_paths = (current_paths.concat.apply(current_paths, current_paths_arr)).filter(Boolean);

        // var merge_path_file = `${merge_path}/training/Paths.txt`;
        if(fs.existsSync(merge_python_file))
        {
            var merge_paths_arr = [];
            merge_paths_arr.push(fs.readFileSync(merge_python_file, 'utf-8').split('\n').filter(Boolean));
            var merge_paths = [];
            merge_paths = (merge_paths.concat.apply(merge_paths, merge_paths_arr)).filter(Boolean);
            var new_paths = '';
            for(var i = 0; i < merge_paths.length; i++)
            {
                if(current_paths.includes(merge_paths[i]))
                {
                    continue;
                }
                new_paths = `${new_paths}${merge_paths[i]}\n`
            }
            console.log("new python paths: ", new_paths);
            fs.appendFile(python_path_file, new_paths, (err) => {
                if(err)
                {
                    console.log(err);
                }
            });
        }
    }

    // Add incoming darknet paths
    if(fs.existsSync(darknet_path_file))
    {
        var darknet_current_paths_arr = [];
        darknet_current_paths_arr.push(fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean));
        var darknet_current_paths = [];
        darknet_current_paths = (darknet_current_paths.concat.apply(darknet_current_paths, darknet_current_paths_arr)).filter(Boolean);

        // var darknet_merge_path_file = `${merge_path}/training/darknetPaths.txt`;
        if(fs.existsSync(merge_darknet_file))
        {
            var darknet_merge_paths_arr = [];
            darknet_merge_paths_arr.push(fs.readFileSync(merge_darknet_file, 'utf-8').split('\n').filter(Boolean));
            var darknet_merge_paths = [];
            darknet_merge_paths = (darknet_merge_paths.concat.apply(darknet_merge_paths, darknet_merge_paths_arr)).filter(Boolean);
            var darknet_new_paths = '';
            for(var i = 0; i < darknet_merge_paths.length; i++)
            {
                if(darknet_current_paths.includes(darknet_merge_paths[i]))
                {
                    continue;
                }
                darknet_new_paths = `${darknet_new_paths}${darknet_merge_paths[i]}\n`
            }
            console.log("new darknet paths: ", darknet_new_paths);
            fs.appendFile(darknet_path_file, darknet_new_paths, (err) => {
                if(err)
                {
                    console.log(err);
                }
            });
        }
    }


    // merge classes //////////////////////////////////////////////////////
    var results1 = await mdb.allAsync("SELECT * FROM Classes");
    var cur_classes = [];
    for(var i = 0; i < results1.length; i++)
    {
        cur_classes.push(results1[i].CName);
    }
    
    var results2 = await mergedb.allAsync("SELECT * FROM Classes");
    for(var i = 0; i < results2.length; i++)
    {
        var temp = results2[i].CName;
        results2[i].CName = results2[i].CName.trim();
        results2[i].CName = results2[i].CName.split(' ').join('_');
        if(!cur_classes.includes(results2[i].CName))
        {
            await mergedb.runAsync("UPDATE Labels SET CName = '" + results2[i].CName + "' WHERE CName = '" + temp + "'");
            cur_classes.push(results2[i].CName);
            await mdb.runAsync("INSERT INTO Classes (CName) VALUES ('"+results2[i].CName+"')");
        }
    }

    // merge images /////////////////////////////////////////////////////////
    var curr_DB_Images = await readdirAsync(image_path);
    var results4 = await mergedb.allAsync("SELECT * FROM Images");
    console.log("moving new images");
    for(var i = 0; i < results4.length; i++)
    {
        if(!curr_DB_Images.includes(results4[i].IName))
        {
            fs.copyFile(merge_images+results4[i].IName, image_path+'/'+results4[i].IName, function(err){
                if (err)
                {
                    return console.error(err);
                }
            });
            await mdb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('"+results4[i].IName+"', '"+results4[i].reviewImage+"', '"+results4[i].validateImage+"')");
            curr_DB_Images.push(results4[i].IName);
        }
    }
    console.log("Done moving new images");


    // merge labels ///////////////////////////////////////////////////////////////
    // count current labels
    var labelsExists = await mdb.getAsync("SELECT COUNT(*) AS count FROM Labels");
    console.log("LabelsExists: ", labelsExists.count);
    if(labelsExists.count == 0)
    {
        var newmax = 1;
    }
    else
    {
        var oldmax = await mdb.getAsync("SELECT * FROM Labels WHERE LID = (SELECT MAX(LID) FROM Labels)");
        var newmax = oldmax.LID + 1;
    }

    // get current labels
    var results5 = await mdb.allAsync("SELECT * FROM Labels");
    var cur_labels = [];
    for(var i = 0; i < results5.length; i++)
    {
        cur_labels.push([results5[i].CName, results5[i].X, results5[i].Y, results5[i].W, results5[i].H, results5[i].IName]);
    }

    // get incoming labels
    var results6 = await mergedb.allAsync("SELECT * FROM Labels");
    var new_labels = [];
    var newl = 0;
    for(var i = 0; i < results6.length; i++)
    {
        new_labels.push([results6[i].CName, results6[i].X, results6[i].Y, results6[i].W, results6[i].H, results6[i].IName]);
        
        // check if incoming label already exists in current dataset
        for(var j = 0; j < cur_labels.length; j++)
        {
            if(cur_labels[j][0] === new_labels[i][0] && cur_labels[j][1] === new_labels[i][1] && cur_labels[j][2] === new_labels[i][2] && cur_labels[j][3] === new_labels[i][3] && cur_labels[j][4] === new_labels[i][4] && cur_labels[j][5] === new_labels[i][5])
            {
                newl = 1;
            }
        }
        // add incoming label to database
        if(newl == 0)
        {
            cur_labels.push([results6[i].CName, results6[i].X, results6[i].Y, results6[i].W, results6[i].H, results6[i].IName]);
            await mdb.runAsync("INSERT INTO Labels (LID, IName, X, Y, W, H, CName) VALUES ('"+Number(newmax)+"', '" + results6[i].IName + "', '" + Number(results6[i].X) + "', '" + Number(results6[i].Y) + "', '" + Number(results6[i].W) + "', '" + Number(results6[i].H) + "', '" + results6[i].CName + "')");
            newmax = newmax + 1;
        }
        newl = 0;
    }

    // close databases //////////////////////////////////////////////////////////////////////
    mdb.close((err) => {
        if(err)
        {
            console.log(err);
        }
        else
        {
            console.log("mdb closed successfully");
        }
    });

    mergedb.close((err) => {
        if(err)
        {
            console.log(err);
        }
        else
        {
            console.log("mergedb closed successfully");
        }
    });
});


api.post('/addUser', async(req,res) => {
	console.log("adduser");
	
	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;

	var NewUser = req.body.newUser;
	console.log("NewUser: ", NewUser);

	var results1 = await db.getAsync("SELECT COUNT(*) AS THING FROM Users WHERE Username = '" + NewUser + "'");
	console.log("results1.User: ", results1.THING);
	if(results1.THING == 1)
	{
		var results2 = await db.getAsync("SELECT COUNT(*) AS SOMETHING FROM Access WHERE Username = '" + NewUser + "' AND PName = '" + PName + "' AND Admin = '" + Admin + "'");
		console.log("results2.SOMETHING: ", results2.SOMETHING);
		if(results2.SOMETHING == 0)
		{
			await db.runAsync("INSERT INTO Access (Username, PName, Admin) VALUES('"+NewUser+"', '"+PName+"', '"+Admin+"')");
		}
	}
	return res.redirect('/config?IDX='+IDX);
});



api.post('/removeAccess', async(req,res) => {
	console.log('removeAccess')
	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;

	var OldUser = req.body.OldUser
	console.log("OldUser: ", OldUser);

	await db.runAsync("DELETE FROM Access WHERE PName = '" + PName + "' AND Username = '" + OldUser + "' AND Admin = '" + Admin + "'");

	return res.redirect('/config?IDX='+IDX);
});



api.post('/transferAdmin', async(req,res) => {
	console.log('transferAdmin')

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;

	var NewAdmin = req.body.NewAdmin;
	console.log("NewAdmin: ", NewAdmin);
	var results1 = await db.getAsync("SELECT COUNT(*) AS THING FROM Projects WHERE Admin = '" + NewAdmin + "' AND PName = '" + PName +"'");
	if(results1.THING != 0)
	{
		return res.redirect('/config?IDX='+IDX);
	}
	await db.runAsync("PRAGMA foreign_keys=off");
	await db.runAsync("UPDATE Projects SET Admin = '"+NewAdmin+"' WHERE Admin = '"+user+"' AND PName = '"+PName+"'");
	await db.runAsync("UPDATE Access SET Admin = '"+NewAdmin+"' WHERE Admin = '"+user+"' AND PName = '"+PName+"'");
	await db.runAsync("PRAGMA foreign_keys=on");
	
	// Change name of project directory to match new admin
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + "-" + PName,
		new_path = main_path + NewAdmin + "-" + PName; // $LABELING_TOOL_PATH/public/projects/project_name
	
	fs.rename(project_path, new_path, (err) => {
		if(err){
			throw err;
		}
	})

	return res.redirect('/config?IDX='+IDX)
})


//upload python script
api.post('/script', async(req,res) => {
	console.log('python');
	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		python_file = req.files.upload_python;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		python_file_path = training_path + '/python/' + python_file.name;

	console.log(python_file.name[-3]);
	if(python_file.name.split('.').pop() != "py")
	{
		res.send({"Success": "ERROR: Wrong filetype. Must by type .py"});
	}
	else
	{
		// move python file and check of python path exists
		await python_file.mv(python_file_path);
		// console.log(req.files);

		// create trainging path if does not exist
		if(!fs.existsSync(training_path))
		{
			fs.mkdir(training_path, (error) => {
				if(error)
				{
					console.log(errror);
				}
			});
		}
		res.send({"Success": "Your script has been uploaded and saved"});
	}
});

//upload weights file
api.post('/upload_weights', async(req,res) => {
	console.log('upload_weights');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		weights_file = req.files.upload_weights;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		weights_path = training_path + '/weights/',
		weights_file_path = weights_path + weights_file.name;

	// console.log(weights_file.name.split('.').pop());
	if((weights_file.name.split('.').pop() != "h5") && (weights_file.name.split('.').pop() != "weights"))
	{
		res.send({"Success": "ERROR: Wrong filetype. Must be type .h5 or weights"});
	}
	else
	{
		// move python file and check of python path exists
		await weights_file.mv(weights_file_path);

		// create trainging path if does not exist
		if(!fs.existsSync(training_path))
		{
			fs.mkdir(training_path, (error) => {
				if(error)
				{
					console.log(errror);
				}
			});
		}
		res.send({"Success": "Your script has been uploaded and saved"});
	}
});

//upload weights file
api.post('/upload_pre_weights', async(req,res) => {
	console.log('upload_pre_weights');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		weights_file = req.files.upload_weights;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		weights_path = training_path + '/weights/',
		weights_file_path = weights_path + weights_file.name;

	console.log(weights_file.name.split('.').pop());
	if((weights_file.name.split('.').pop() != "137") && (weights_file.name.split('.').pop() != "weights"))
	{
		res.send({"Success": "ERROR: Wrong filetype. Must be type .137 or weights"});
	}
	else
	{
		// move python file and check of python path exists
		await weights_file.mv(weights_file_path);

		// create trainging path if does not exist
		if(!fs.existsSync(training_path))
		{
			fs.mkdir(training_path, (error) => {
				if(error)
				{
					console.log(errror);
				}
			});
		}
		res.send({"Success": "Your weight file has been uploaded and saved"});
	}
});

api.post('/deleteRun', async (req, res) => {
	console.log("delete Run");

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = req.body.IDX,
		weights = req.body.weights,
		user = req.cookies.Username,
		run_path = req.body.run_path,
		log_file = req.body.log_file;

	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + user + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs/';

	console.log("run_path: ", run_path)

	rimraf(run_path, function (err) { 
		if(err)
		{
			console.error(err);
		}
		console.log(`${run_path} deleted`); 
	});
	return res.redirect('/training?IDX='+IDX);

});


//Add a python path
api.post('/python', async(req, res) => {
	console.log('new python path');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		python_path = req.body.python_path;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
		images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		python_path_file = training_path + '/Paths.txt';
	
	console.log("python_path: ", python_path)
	console.log("Exists: ", fs.existsSync(python_path))
	if(fs.existsSync(python_path))
	{

		fs.writeFile(python_path_file, python_path+"\n", {'flag':'a'}, function(err){
			if(err)
			{
				console.log(err);
			}
		});

		res.send({"Success": "Python Path Saved"});
	}
	else
	{
		res.send({"Success": `ERROR! ${python_path} is not a valid path`});
	}
});

	api.post('/darknet', async(req, res) => {
		console.log('new darknet path');

		var PName = req.body.PName,
			Admin = req.body.Admin,
			user = req.cookies.Username,
			darknet_path = req.body.darknet_path;
		
		var public_path = __dirname.replace('routes',''),
			main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
			project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
			images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
			downloads_path = main_path + user + '_Downloads',
			training_path = project_path + '/training',
			darknet_path_file = training_path + '/darknetPaths.txt';
		
		console.log("darknet_path: ", darknet_path)
		console.log("Exists: ", fs.existsSync(darknet_path))
		if(fs.existsSync(darknet_path))
		{

			fs.writeFile(darknet_path_file, darknet_path+"\n", {'flag':'a'}, function(err){
				if(err)
				{
					console.log(err);
				}
			});

			res.send({"Success": "Darknet Path Saved"});
		}
		else
		{
			res.send({"Success": `ERROR! ${darknet_path} is not a valid path`});
		}
	});

api.post('/remove_path', async(req, res) => {
	console.log('remove python path');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;
		
	var	remove_paths_arr = [];
		remove_paths_arr.push(req.body["paths[]"]);
	var	remove_paths = [];
		remove_paths = (remove_paths.concat.apply(remove_paths, remove_paths_arr)).filter(Boolean);
	
	console.log("remove_paths: ", remove_paths);

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
		images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		python_path_file = training_path + '/Paths.txt';
	
	var current_paths_arr = [];
		current_paths_arr.push(fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean));
	var current_paths = [];
		current_paths = (current_paths.concat.apply(current_paths, current_paths_arr)).filter(Boolean);
	
	var new_paths = '';
	for(var i = 0; i < current_paths.length; i++)
	{
		if(remove_paths.includes(current_paths[i]))
		{
			continue;
		}
		new_paths = `${new_paths}${current_paths[i]}\n`
	}

	fs.writeFile(python_path_file, new_paths, (err) => {
		if (err) throw err;

		return res.redirect('/config?IDX='+IDX);
	});

});

api.post('/remove_darknet_path', async(req, res) => {
	console.log('remove darknet path');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;
		
	
	var remove_paths = req.body["darknet_paths[]"]
	console.log("remove_paths: ", remove_paths);

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
		images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		darknet_path_file = training_path + '/darknetPaths.txt',
		python_path_file = training_path + '/Paths.txt';
	
	var current_paths_arr = [];
		current_paths_arr.push(fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean));
	var current_paths = [];
		current_paths = (current_paths.concat.apply(current_paths, current_paths_arr)).filter(Boolean);
	
	var new_paths = '';

	var darknet_path = new Set();

	for(var i = 0; i < current_paths.length; i++)
	{
		if(remove_paths.includes(current_paths[i]))
		{
			
			darknet_path.add(current_paths[i]);
			continue;
		}
		new_paths = `${new_paths}${current_paths[i]}\n`
	}

	fs.writeFile(darknet_path_file, new_paths, (err) => {
		if (err) throw err;

	
		const drknt_temp = darknet_path.values();
		for(var i = 0; i < darknet_path.size; i++){
			var current_darknet_path = drknt_temp.next().value;
			var darknetFiles = readdirSync(current_darknet_path);
			for(var i = 0; i < darknetFiles.length; i++){
				if(darknetFiles[i].split('-')[0] == user){
					rimraf(current_darknet_path + '/' +  darknetFiles[i], (err) => {
						if(err)
						{
							console.error("there was an error with the user contents: ", err);
						}
						else
						{
							console.log("Darknet user project contents successfuly deleted")
						}
					});
				}
			}
		}
		return res.redirect('/config?IDX='+IDX);
	});
});


api.post('/remove_weights', async(req, res) => {
	console.log('remove weights file');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username,
		weights_arr = [];
		weights_arr.push(req.body["weights[]"]);
		weights = [];
		weights = (weights.concat.apply(weights, weights_arr)).filter(Boolean);
	
	console.log("remove_weights weights: ", weights)
	console.log("remove_weights weights.length: ", weights.length)

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
		images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		script_path = training_path + '/python',
		weights_path = training_path + '/weights',
		python_path_file = training_path + '/Paths.txt';
	
	for(var i=0; i < weights.length; i++)
	{
		weight = `${weights_path}/${weights[i]}`
		
		fs.unlink(weight, (error) => {
			if(error){
				console.log(error)
			}
		});
	}

	return res.redirect('/config?IDX='+IDX);

});

api.post('/remove_script', async(req, res) => {
	console.log('remove python script');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username,
		scripts = req.body["scripts[]"].split(",");
	
	console.log("remove_script scripts: ", scripts)
	console.log("remove_script scripts.length: ", scripts.length)

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',	// $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/Admin-project_name
		images_path = project_path + '/images',			// $LABELING_TOOL_PATH/public/projects/Admin-project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		script_path = training_path + '/python',
		python_path_file = training_path + '/Paths.txt';
	
	
	var new_paths = '';
	for(var i=0; i < scripts.length; i++)
	{
		script = `${script_path}/${scripts[i]}`
		fs.unlink(script, (error) => {
			console.log(error)
		});
	}

	return res.redirect('/config?IDX='+IDX);
});

api.post('/run', async(req, res) => {
	console.log('run script')
	
	const {exec} = require('child_process');
	
	console.log("date: ", Date.now());
	var date = Date.now();

	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		python_path = req.body.python_path,
		script = req.body.script,
		log = `${date}.log`,
		weights = req.body.weights,
		TrainingPercent = parseFloat(req.body.TrainingPercent);

		
	if(TrainingPercent > 1)
	{
		TrainingPercent = TrainingPercent/100;
	}
	var options = "";

	if(req.body.options)
	{
		options = req.body.options;
	}
	else
	{
		options = "EMPTY"
	}
	console.log("options: ", options);
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		abs_images_path = path.join(__dirname, images_path),
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		run_path = `${logs_path}/${date}`,
		weights_file = training_path + '/weights/' + weights,
		python_script = training_path + '/python/' + script,
		wrapper_path = public_path + 'controllers/training/train_data_from_project.py',
		project_db = `${project_path}/${PName}.db`;

	
	
	
	if(!fs.existsSync(run_path))
	{
		fs.mkdirSync(run_path);
	}

	fs.writeFile(`${run_path}/${log}`, "", (err) => {
		if (err) throw err;
	});

	
	///////////////////Connect to database /////////////////////////////////////////

	var rundb = new sqlite3.Database(project_db, (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to rundb.');
	});
	rundb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	rundb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});;
	};	
	rundb.runAsync = function (sql) {
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
			console.error(err)
		});;
	};

	///////////////Create Tensorflow training csv /////////////////////////////////

	var labels = await rundb.allAsync("SELECT * FROM Labels");
	var xmin = 0;
	var xmax = 0;
	var ymin = 0;
	var ymax = 0;
	var data='filename,width,height,class,xmin,ymin,xmax,ymax\n';
	var i = 0;
	var image = '';
	for(i = 0; i < Math.floor(labels.length * TrainingPercent); i++)
	{
		image = path.join(abs_images_path, labels[i].IName);
		xmin = labels[i].X
		xmax = xmin + labels[i].W;
		ymin = labels[i].Y
		ymax = ymin + labels[i].Y;
		data = data + image + ',' + labels[i].W + ',' + labels[i].H + ',' + labels[i].CName + ',' + xmin + ',' + ymin + ',' + xmax + ',' + ymax + '\n';
	}
	var training_csv = run_path+'/'+PName+'_train.csv';
	fs.writeFile(training_csv, data, (err) => {
		if (err) throw err;
		console.log("done writing csv");
	});

	///////////////Create Tensorflow Validate csv /////////////////////////////////
	var data='filename,width,height,class,xmin,ymin,xmax,ymax\n';
	for(var j = i; j < labels.length; j++)
	{
		image = path.join(abs_images_path, labels[j].IName);
		xmin = labels[j].X
		xmax = xmin + labels[j].W;
		ymin = labels[j].Y
		ymax = ymin + labels[j].Y;
		data = data + image + ',' + labels[j].W + ',' + labels[j].H + ',' + labels[j].CName + ',' + xmin + ',' + ymin + ',' + xmax + ',' + ymax + '\n';
	}
	var validation_csv = run_path+'/'+PName+'_validate.csv';
	fs.writeFile(validation_csv, data, (err) => {
		if (err) throw err;
		console.log("done writing csv");
	});


	rundb.close((err) => {
		if(err)
		{
			console.log(err);
		}
		else
		{
			console.log("rundb closed successfully");
		}
	});

	//Create error file name
	var err_file = `${date}-error.log`;
	
	// Call Chris's script here
	// Pass in python path, script, and options

	//TODO: Add weights, training.csv, and validate.csv options to command
	options = options.replace("<data_dir>", images_path)
	options = options.replace("<training_csv>", training_csv)
	options = options.replace("<validation_csv>", validation_csv)
	options = options.replace("<output_dir>", run_path)
	options = options.replace("<weights>", weights_file)

	var cmd = `${wrapper_path} -p ${python_path} -s ${python_script} -l ${run_path}/${log} -o "${options}"`
	var success = "Training complete";
	var error = '';
	process.chdir(run_path);

	var child = exec(cmd, (err, stdout, stderr) => {
		if (err){
			console.log(`This is the error: ${err.message}`);
			success = err.message;
			fs.writeFile(`${run_path}/${err_file}`, success, (err) => {
				if (err) throw err;
			});
		}
		else if (stderr) {
			console.log(`This is the stderr: ${stderr}`);
			fs.writeFile(`${run_path}/${err_file}`, stderr, (err) => {
				if (err) throw err;
			});
			//return;
		}
		console.log("stdout: ", stdout)
		console.log("stderr: ", stderr)
		console.log("err: ", err)
		console.log("The script has finished running");
		fs.writeFile(`${run_path}/done.log`, success, (err) => {
			if (err) throw err;
		});
	});
	
	res.send({"Success": `Training Started`});
	process.chdir(`${public_path}routes`);
});




////////////////////////////Download page/////////////////////////////////////////////////

api.post('/downloadScript', async (req, res) => {
	console.log("downloadingScripts");

	// get URL variables
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		// mult = parseInt(req.body.mult),
		user = req.cookies.Username;
		//scripts = req.body["scripts[]"];
	
	var	scripts_arr = [];
		scripts_arr.push(req.body["scripts[]"]);
	var	scripts = [];
		scripts = (scripts.concat.apply(scripts, scripts_arr)).filter(Boolean);
	
	
	console.log("scritps: ", scripts);
	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		python_path = training_path + '/python',
		logs_path = training_path + '/logs';

	// Create zipfile
	
	var output = fs.createWriteStream(downloads_path+'/scripts.zip');
	var archive = archiver('zip');
	
	output.on('close', function () {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
		res.download(downloads_path+'/scripts.zip');
	});
	archive.on('error', function(err){
		throw err;
	});
	
	archive.pipe(output);
	for(var i=0; i < scripts.length; i++)
	{
		script = `${python_path}/${scripts[i]}`
		archive.file(script, { name: scripts[i]});
	}
	archive.finalize();
	
});


api.post('/downloadWeights', async (req, res) => {
	console.log("downloadingWeights");

	// get URL variables
	var PName = req.body.PName,
		admin = req.body.Admin,
		IDX = parseInt(req.body.IDX),
		user = req.cookies.Username;
	
	var	weights_arr = [];
		weights_arr.push(req.body["weights[]"]);
	var	weights = [];
		weights = (weights.concat.apply(weights, weights_arr)).filter(Boolean);
	console.log("weights: ", weights);

	// Set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		//downloads_path = project_path + '/downloads', // $LABELING_TOOL_PATH/public/projects/project_name/downloads
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		python_path = training_path + '/python',
		logs_path = training_path + '/logs',
		weights_path = training_path + '/weights';

	// Create zipfile
	
	var output = fs.createWriteStream(downloads_path+'/weights.zip');
	var archive = archiver('zip');
	
	output.on('close', function () {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
		res.download(downloads_path+'/weights.zip');
	});
	archive.on('error', function(err){
		throw err;
	});
	
	archive.pipe(output);
	for(var i=0; i < weights.length; i++)
	{
		var weights_file = weights_path + "/" + weights[i];
		archive.file(weights_file, { name: weights[i]});
	}
	archive.finalize();
	
});


api.post('/downloadRun', async (req, res) => {
	console.log('downloadRun');

	var PName = req.body.PName,
		Admin = req.body.Admin,
		IDX = req.body.IDX,
		weights = req.body.weights,
		user = req.cookies.Username,
		log_file = req.body.log_file,
		run_path = req.body.run_path;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + user + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs/';
	
	var output = fs.createWriteStream(downloads_path+'/'+log_file.substr(0, log_file.length - 4)+'.zip');
	var archive = archiver('zip');
	
	output.on('close', function () {
		console.log(archive.pointer() + ' total bytes');
		console.log('archiver has been finalized and the output file descriptor has closed.');
		res.download(downloads_path+'/'+log_file.substr(0, log_file.length - 4)+'.zip');
	});
	archive.on('error', function(err){
		throw err;
	});
	
	archive.pipe(output);

	var logs = await readdirAsync(`${run_path}`);
	
	for (var i = 0; i < logs.length; i++)
	{
		archive.file(`${run_path}${logs[i]}`, {name: logs[i]})
	}
	
	archive.finalize();
});

//TODO
//Call Ashwin's script to configure YOLO files
api.post('/yolo-run', async (req, res) => {
	console.log('yolo-run')
	
	const {exec} = require('child_process');
	//const {spawn} = require('child_process');

	var date = Date.now();
	
	var PName = req.body.PName,
		Admin = req.body.Admin,
		user = req.cookies.Username,
		darknet_path = req.body.darknet_path,
		log = `${date}.log`,
		trainDataPer = req.body.TrainingPercent,
		batch = req.body.batch,
		subdiv = req.body.subdiv,
		width = req.body.width,
		height = req.body.height,
		weight_name = req.body.weights;
	
	var err_file = `${date}-error.log`;

	/*
	Steps:
		1. Create txt files for each image
		2. Create classes.txt file
		3. Call datatovalues.py script
	*/
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + PName, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		run_path = `${logs_path}/${date}`,
		classes_path = run_path + '/classes.txt',
		weight_path = training_path + '/weights/' + weight_name,
		yolo_script = public_path + 'controllers/training/datatovalues.py', 
		wrapper_path = public_path + 'controllers/training/train_data_from_project.py';

	

	//Create run path
	if(!fs.existsSync(run_path))
	{
		fs.mkdirSync(run_path);
	}
	
	fs.writeFile(`${run_path}/${log}`, "", (err) => {
		if (err) throw err;
	});
	
	//////////////////////Copy YOLO template files over to run folder///////////////////////////////////////////////////
	console.log("Copy YOLO template files over to run folder")
	cfgTemp_path = public_path + 'controllers/training/cfgTemplate.txt'
	cfgTemp = run_path + '/cfgTemplate.txt'
	fs.copyFile(cfgTemp_path, cfgTemp, (err) => {
		if(err)
		{
			console.log(err);
		}
	})

	dataTemp_path = public_path + 'controllers/training/dataTemplate.txt'
	dataTemp = run_path + '/dataTemplate.txt'
	fs.copyFile(dataTemp_path, dataTemp, (err) => {
		if(err)
		{
			console.log(err);
		}
	})

	/////////////////////Copy darknet config script to darknet directory///////////////////////////////////////////
	console.log("Copy darknet config script to darknet directory")
	darknet_cfg_script = darknet_path + '/datatovalues.py'
	if(!existsSync(darknet_cfg_script))
	{
		fs.copyFile(yolo_script, darknet_cfg_script, (err) => {
			if(err)
			{
				console.log(err);
			}
		})
	}

	/////////////////////////Create Project within darknet if does not exist///////////////////////////////////////
	console.log("Create Project within darknet if does not exist")
	project = `${Admin}-${PName}`
	abs_darknet_project_path = path.join(darknet_path, project)
	abs_darknet_images_path = path.join(abs_darknet_project_path, 'images');

	if(!fs.existsSync(abs_darknet_images_path))
	{
		fs.mkdirSync(abs_darknet_project_path)
		//Create symbolic link to images
		fs.symlink(images_path, abs_darknet_images_path, 'dir', (err) => {
			if(err)
			{
				console.log(err);
			}
			else
			{
				console.log("Images Symlink created");
				console.log("Symlink is a directory: ", fs.lstatSync(abs_darknet_images_path).isDirectory())
			}
		});
	}


	//////////////////////////Create symbolic link from darknet to run/////////////////////////////////////////////
	console.log("Create symbolic link from darknet to run")
	abs_darknet_project_run = path.join(abs_darknet_project_path, date.toString())

	if(!fs.existsSync(abs_darknet_project_run))
	{
		fs.symlink(run_path, abs_darknet_project_run, 'dir', (err) => {
			if(err)
			{
				console.log(err);
			}
			else
			{
				console.log("Symlink created");
				console.log("Symlink is a directory: ", fs.lstatSync(abs_darknet_project_run).isDirectory())
			}
		});
	}

	
	// Connect to database
	var ycdb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to ycdb.');
	});
	ycdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	ycdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	ycdb.runAsync = function (sql) {
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
			console.error(err)
		});
	};	

	/////////////////////////////////////////Create label txt files///////////////////////////////////////////////////
	console.log("Create label txt files")
	var cnames = [];
	var results1 = await ycdb.allAsync("SELECT * FROM Classes");
	var results2 = await ycdb.allAsync("SELECT * FROM Images");
	for(var i = 0; i < results1.length; i++)
	{
		cnames.push(results1[i].CName);
	}
	var dict_images_labels = {}

	for(var i=0; i<results2.length; i++){

		var img = fs.readFileSync(`${images_path}/${results2[i].IName}`),
			img_data = probe.sync(img),
			img_w = img_data.width,
			img_h = img_data.height;

		var results3 = await ycdb.allAsync("SELECT * FROM Labels WHERE IName = '" + results2[i].IName + "'");
		for(var j=0; j<results3.length; j++){
			// x, y, w, h
			var centerX = (results3[j].X+(results3[j].W/2))/img_w;
			var centerY = (results3[j].Y+(results3[j].H/2))/img_h
			to_string_value = cnames.indexOf(results3[j].CName) +" "+centerX+" "+centerY+" "+results3[j].W/img_w +" "+results3[j].H/img_h +"\n"
			if(dict_images_labels[results2[i].IName] == undefined){
				dict_images_labels[results2[i].IName] = to_string_value;
			}
			else {
				dict_images_labels[results2[i].IName] += to_string_value;
			}
		}
		if(results3.length == 0)
		{
			dict_images_labels[results2[i].IName] = "";
		}
	}

	for(var key in dict_images_labels){
		remove_dot_ext = key.split(".")[0]
		fs.writeFileSync(`${images_path}/${remove_dot_ext}.txt`,dict_images_labels[key] , (err) => {
			if (err) throw err;
		});
	}



//////////////////////////////////////////////////Create Classes file///////////////////////////////////////////////////////////////////
	console.log("Create Classes file")
	var classes="";
	for(var i=0; i<results1.length; i++)
	{
		classes = classes + results1[i].CName + '\n';
	}
	classes = classes.substring(0, classes.length - 1); //remove trailing newline

	fs.writeFileSync(classes_path, classes, (err) => {
		if (err) throw err;
		console.log("done writing Classes file");
	});
	

	ycdb.close((err) => {
		if(err)
		{
			console.log(err);
		}
		else
		{
			console.log("ycdb closed successfully");
		}
	});


//////////////////////////////////////////// Call Ashwin's script here//////////////////////////////////////////////////////////////////
	console.log("Calling Darknet")
	// Pass in python path, script, and options
	darknet_project_run = path.join(project, date.toString())
	darknet_images_path = path.join(abs_darknet_project_path, 'images')
	var cmd = `python3 ${yolo_script} -d ${darknet_path}/${darknet_project_run} -i ${darknet_images_path} -n ${classes_path} -p ${trainDataPer} -l ${abs_darknet_project_run}/${log} -y ${darknet_path} -w ${weight_path} -b ${batch} -s ${subdiv} -x ${width} -t ${height}`
	var success = ""
	var error = '';
	console.log(cmd)

	//change directory to darknet
	process.chdir(darknet_path);

	var child = exec(cmd, (err, stdout, stderr) => {

		if (err){
			console.log(`This is the error: ${err.message}`);
			if (err.message != "stdout maxBuffer length exceeded"){
				success = err.message;
				fs.writeFile(`${darknet_project_run}/${err_file}`, success, (err) => {
					if (err) throw err;
				});
			}
		}
		else if (stderr) {
			console.log(`This is the stderr: ${stderr}`);
			if (stderr != "stdout maxBuffer length exceeded"){
				fs.writeFile(`${darknet_project_run}/${err_file}`, stderr, (err) => {
					if (err) throw err;
				});
			}
			//return;
		}
		console.log("stdout: ", stdout)
		console.log("stderr: ", stderr)
		console.log("err: ", err)
		console.log("The script has finished running");
		fs.writeFile(`${darknet_project_run}/done.log`, success, (err) => {
			if (err) throw err;
		});
	});
	res.send({"Success": `Training Started`});
});


module.exports = api;


api.post('/deleteUser', async (req,res) =>{
	console.log("delete user");
	var user = req.cookies.Username;

	var public_path = __dirname.replace('routes',''),
	main_path = public_path + 'public/projects/';

	var darknet_path = new Set();

	var filesinfolder = readdirSync(main_path);
	// Delete the Files
	for(var i = 0; i < filesinfolder.length; i++){
		if(filesinfolder[i].split('_')[0] == user || filesinfolder[i].split('-')[0] == user){
			if(filesinfolder[i].split('-')[0] == user){
				var tempdarknet = fs.readFileSync(main_path + filesinfolder[i] + '/training/darknetPaths.txt', 'utf-8').split('\n').join(',').split(',');
				for(var f = 0; f < tempdarknet.length; f++){
					if(tempdarknet[f] != ''){
						darknet_path.add(tempdarknet[f]);
					}
				}
			}
			rimraf(main_path + filesinfolder[i], (err) => {
				if(err)
				{
					console.error("there was an error with the user contents: ", err);
				}
				else
				{
					console.log("User directory contents successfuly deleted")
				}
			});
		}
	}

	//Delete the YOLO Files
	const drknt_temp = darknet_path.values();
	for(var i = 0; i < darknet_path.size; i++){
		var current_darknet_path = drknt_temp.next().value;
		var darknetFiles = readdirSync(current_darknet_path);
		for(var i = 0; i < darknetFiles.length; i++){
			if(darknetFiles[i].split('-')[0] == user){
				rimraf(current_darknet_path + '/' +  darknetFiles[i], (err) => {
					if(err)
					{
						console.error("there was an error with the user contents: ", err);
					}
					else
					{
						console.log("Darknet user project contents successfuly deleted")
					}
				});
			}
		}
	}
	// Delete from the Database
	db.getAsync("DELETE FROM Access WHERE Admin = '" + user + "'");
	db.getAsync("DELETE FROM Access WHERE Username = '" + user + "'");
	db.getAsync("DELETE FROM Projects WHERE Admin = '" + user + "'");
	db.getAsync("DELETE FROM Users WHERE Username = '" + user + "'");


	res.clearCookie("Username");
	return res.send({"Success": "Yes"});

});



api.post('/deleteClass', async (req, res) => {
	console.log("deleteClass");
	   	
	var IDX = parseInt(req.body.IDX),
		PName = req.body.PName,
		admin = req.body.Admin,
		user = req.cookies.Username,
		classes = req.body.classArray;

		console.log("IDX: ", IDX)
	// set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		project_path = main_path + admin + '-' + PName;

	var dcdb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to dcdb.');
	});
	dcdb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};
	dcdb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
		});
	};	
	dcdb.runAsync = function (sql) {
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
			console.error(err)
		});
	};	


	if(classes.includes(",")){
		classes = classes.split(",");
	}
	console.log(classes);

	//Delete classes
	var deleteLabels = "";
	var deleteClasses = "";
	var deleteValid = "";
	if(typeof(classes) == "string"){
		deleteClasses = `DELETE FROM Classes WHERE CName = '${classes}'`
		deleteLabels = `DELETE FROM Labels WHERE CName = '${classes}'`
		deleteValid = `DELETE FROM Validation WHERE CName = '${classes}'`
	}
	else
	{
		deleteLabels = `DELETE FROM Labels WHERE CName = '${classes[0]}'`;
		deleteClasses = `DELETE FROM Classes WHERE CName = '${classes[0]}'`;
		deleteValid = `DELETE FROM Validation WHERE CName = '${classes[0]}'`;

		for(var i = 1; i < classes.length; i++){
			var string = ` OR CName = '${classes[i]}'`;
			deleteLabels += string;
			deleteClasses += string;
			deleteValid += string;
		}
	}
	console.log(deleteClasses);
	await dcdb.runAsync(deleteClasses)

	console.log(deleteLabels);
	await dcdb.runAsync(deleteLabels)

	console.log(deleteValid);
	await dcdb.runAsync(deleteValid)

	   
	console.log("deleteClass (redirect)");

	dcdb.close(function(err){
		if(err)
		{
			console.error(err);
		}
		else{
			console.log("cdb closed successfully");
		}
	});

	return res.redirect('/config?IDX='+IDX);
});


api.post('/changeFname', async (req, res) => {
	console.log("changeFname");
	   	
	var user = req.cookies.Username,
		FName = req.body.FName;
	await db.runAsync("UPDATE Users SET FirstName = '"+FName+"' WHERE Username = '"+user+"'");

	return res.send({"Success": "Yes"});
});

api.post('/changeLname', async (req, res) => {
	console.log("changeLname");
	   	
	var user = req.cookies.Username,
		LName = req.body.LName;
	await db.runAsync("UPDATE Users SET LastName = '"+LName+"' WHERE Username = '"+user+"'");

	return res.send({"Success": "Yes"});
});

api.post('/changeEmail', async (req, res) => {
	console.log("changeEmail");
	   	
	var user = req.cookies.Username,
		Email = req.body.Email;
	await db.runAsync("UPDATE Users SET Email = '"+Email+"' WHERE Username = '"+user+"'");

	return res.send({"Success": "Yes"});
});

api.post('/changeUname', async (req, res) => {
	console.log("changeUname");
	   	
	var user = req.cookies.Username,
		UName = req.body.UName;

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		download_path = main_path + user + '_Downloads',
		new_download_path = main_path + UName + '_Downloads';
	
	await db.runAsync("UPDATE Users SET Username = '"+UName+"' WHERE Username = '"+user+"'");
	await db.runAsync("UPDATE Access SET Username = '"+UName+"' WHERE Username = '"+user+"'");
	await db.runAsync("UPDATE Access SET Admin = '"+UName+"' WHERE Admin = '"+user+"'");
	await db.runAsync("UPDATE Projects SET Admin = '"+UName+"' WHERE Admin = '"+user+"'");

	fs.rename(download_path, new_download_path, () => {});

	var project_files = readdirSync(main_path);

	for(var f = 0; f < project_files.length; f++){
		if(project_files[f].split('-')[0] == user){
			fs.rename(main_path + project_files[f], main_path + UName + '-' + project_files[f].split('-')[1], () => {});
		}
	}

	res.clearCookie("Username");
	res.cookie("Username", UName, {
		httpOnly: true,
	});
	return res.send({"Success": "Yes"});
});

api.post('/changePassword', async (req, res) => {
	console.log("changePassword");

	var user = req.cookies.Username,
		oldPassword = req.body.oldPassword,
		newPassword = req.body.newPassword;

	var passwords = await db.allAsync("SELECT Password FROM Users WHERE Username = '" + user +"'")
	
	
	if(!bcrypt.compareSync(oldPassword, passwords[0].Password))
	{
		return res.send({"Success": "Wrong Password!"});
	}
	else
	{
		bcrypt.hash(newPassword, 10, async function(err, hash){
			if(err)
			{
				console.error(err);
				return res.send({"Success": "Password encryption error. Password has not been changed"});
				
			}
			else
			{
				await db.runAsync("UPDATE Users SET Password = '"+hash+"' WHERE Username = '"+user+"'");
				return res.send({"Success": "Yes"});
			}
		});
	}
});

//TODO return to whatever page calls it
api.post('/deleteImage', async (req, res) => {
    console.log("deleteImage");

	var IDX = parseInt(req.body.IDX),
		PName = req.body.PName,
		admin = req.body.Admin,
		user = req.cookies.Username,
		images = req.body.ImageArray;;

		console.log("IDX: ", IDX)
	// set paths
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		project_path = main_path + admin + '-' + PName,
        images_path = project_path + '/images/';


    var didb = new sqlite3.Database(project_path+'/'+PName+'.db', (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Connected to didb.');
    });    
    didb.getAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.get(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };
    didb.allAsync = function (sql) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.all(sql, function (err, row) {
                if (err)
                {
                    console.log("runAsync ERROR! ", err);
                    reject(err);
                }
                else
                    resolve(row);
            });
        }).catch(err => {
            console.error(err)
        });
    };	
    didb.runAsync = function (sql) {
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
            console.error(err)
        });
    };
    
    if(images.includes(",")){
		images = images.split(",");
	}

    var deleteLabels = "";
	var deleteImages = "";
	if(typeof(images) == "string"){
		deleteImages = `DELETE FROM Images WHERE IName = '${images}'`;
		deleteLabels = `DELETE FROM Labels WHERE IName = '${images}`;
		deleteLabels = `DELETE FROM Validation WHERE IName = '${images}`;
	}
	else
	{
		deleteLabels = `DELETE FROM Labels WHERE IName = '${images[0]}'`;
		deleteImage = `DELETE FROM Images WHERE IName = '${images[0]}'`;
		deleteImage = `DELETE FROM Validation WHERE IName = '${images[0]}'`;
		for(var i = 1; i < images.length; i++){
			var string = ` OR IName = '${images[i]}'`;
			deleteLabels += string;
			deleteClasses += string;
		}
	}
    // deleteImage = `DELETE FROM Images WHERE IName = '${IName}'`;
    // deleteLabels = `DELETE FROM Labels WHERE IName = '${IName}`;

    console.log(deleteLabels);
	await didb.runAsync(deleteLabels);

    console.log(deleteImages);
	await didb.runAsync(deleteImages);

    image_path = `${images_path}${IName}`
    console.log("Delete image: ", image_path)
    fs.unlink(image_path, function (err) { 
		if(err)
		{
			console.error(err);
		}
		else
		{
			console.log("done"); 
		}
	});

    didb.close(function(err){
		if(err)
		{
			console.error(err);
		}
		else{
			console.log("didb closed successfully");
		}
	});

});

api.post('/bootstrap', async (req, res) => {
	console.log('bootstrap-run');
	var project_name = req.body.PName,
	Admin = req.body.Admin,
	user = req.cookies.Username,
	darknet_path = req.body.darknet_path,
	run_number = req.body.run_number,
	upload_images = req.files.upload_images,
	IDX = parseInt(req.body.IDX);


	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + Admin + '-' + project_name, // $LABELING_TOOL_PATH/public/projects/project_name
		images_path = project_path + '/images', // $LABELING_TOOL_PATH/public/projects/project_name/images
		downloads_path = main_path + user + '_Downloads',
		training_path = project_path + '/training',
		logs_path = training_path + '/logs',
		merge_path = project_path + '/merge/',
		merge_images = merge_path + 'images/',
		yolo_script = public_path + 'controllers/training/bootstrap.py', 
		run_path = logs_path + run_number;


	console.log("merge_path: ", merge_path);
	console.log("merge_images: ", merge_images);
	
	if (fs.existsSync(merge_path))
	{
		rimraf(merge_path, (err) => {
			if(err)
			{
				console.log(err);
			}
			else{
				fs.mkdir(merge_path, function(error){
					if (error)
					{
						// res.send({"Success": "No"});
						console.error(error);
						// res.send({"Success": "No"});
						return res.send("ERROR! "+error)
					}
					else{
						fs.mkdir(merge_images, function(error){
							if (error)
							{
								// res.send({"Success": "No"});
								console.error(error);
								// res.send({"Success": "No"});
								return res.send("ERROR! "+error);
							}
						});
					}
				});
			}
		});
	}
	else
	{
		// create temp merge folders
		fs.mkdir(merge_path, function(err){
			if (err)
			{
				// res.send({"Success": "No"});
				console.error(err);
				// res.send({"Success": "No"});
				return res.send("ERROR! "+err);
			}
			else
			{
				fs.mkdir(merge_images, function(err){
					if (err)
					{
						// res.send({"Success": "No"});
						console.error(err);
						// res.send({"Success": "No"});
						return res.send("ERROR! "+err);
					}
				});
			}
		});
	}

	// connect to current project database
	var aidb = new sqlite3.Database(project_path+'/'+ project_name +'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to aidb.');
	});
	aidb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};
	aidb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};	
	aidb.runAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.run(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err)
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};


	var newImages = [];
	var bootstrapString = "";
	
	var zip_path = project_path + '/' +upload_images.name; // $LABELING_TOOL_PATH/public/projects/{project_name}/{zip_file_name}
	await upload_images.mv(zip_path);

	console.log(`zip_path: ${zip_path}`);
	var zip = new StreamZip({file: zip_path})

	zip.on('error', err => {
		console.log(err);
		return res.send("ERROR! "+err);
	})
	zip.on('ready', async () =>{
		console.log(zip_path)
		zip.extract(null, merge_images, async (err, count) =>{
			console.log(err ? `Extract error: ${err}` : `Extracted ${count} entries`);
			zip.close();
			rimraf(zip_path, (err) => {
				if(err)
				{
					console.log(err);
					// res.send({"Success": "could not remove zip file"});
					return res.send("ERROR! "+err);
				}
			})
			console.log("images_path: ", images_path);
			console.log("merge_images: ", merge_images);
			files = await readdirAsync(images_path);
			newfiles = await readdirAsync(merge_images);
			console.log("Found ",newfiles.length," files");

			for (var i = 0; i < newfiles.length; i++) 
			{
				// console.log(newfiles[i]);


				// //supposed to clean filenames, Remove trailing and leading spaces and swap 0s and +s with _.
				var temp = merge_images+'/'+newfiles[i];
				newfiles[i] = newfiles[i].trim();
				newfiles[i] = newfiles[i].split(' ').join('_');
				newfiles[i] = newfiles[i].split('+').join('_');
				fs.rename(temp, merge_images + '/' + newfiles[i], () => {});
				if(newfiles[i] == "__MACOSX")
				{
					continue;
				}
				else if(!files.includes(newfiles[i]))
				{
					fs.rename(merge_images+'/'+newfiles[i], images_path+'/'+newfiles[i], function(err){
						if (err)
						{
							// res.send({"Success": "could not move new images"});
							console.error(err);
							return res.send("ERROR! "+err);
						}
						// console.log("new file moved");
					});
					await aidb.runAsync("INSERT INTO Images (IName, reviewImage, validateImage) VALUES ('"+newfiles[i]+"', '"+0+"', '"+1+"')");
					newImages.push(newfiles[i]);
					bootstrapString += newfiles[i] + '\n';
				}
			}
			//console.log('here');
			//console.log(newfiles);
			// console.log(run_path + '/' +  run_number + '.txt');
			fs.writeFileSync(training_path + '/images_to_bootstrap.txt', bootstrapString, (err) => {
				if (err) throw err;
			});
			//close project database
			aidb.close(function(err){
				if(err)
				{
					console.error(err);
				}
				else{
					console.log("aidb closed successfully");
					
				}
			});

			//rimraf.sync(merge_path);
			rimraf(merge_path, (err) => {
				if(err)
				{
					console.log(err);
				}
			});
			// res.send({"Success": "Yes"});
			// res.send("Images sucessfully added")
		});
	});	

	// CALL BOOTSTRAP SCRIPT
	//////////////////////////////////////////// Call Ashwin's script here//////////////////////////////////////////////////////////////////
	console.log("Calling Darknet")
	console.log(darknet_path)
	console.log(run_path)
	// Pass in python path, script, and options
	// project = `${Admin}-${project_name}`
	// abs_darknet_project_path = path.join(darknet_path, project)
	// abs_darknet_images_path = path.join(abs_darknet_project_path, 'images');
	// darknet_project_run = path.join(project, run_number)
	// weight_path = darknet_project_run + '/' + 'obj_last.weights'

	// var cmd = `python3 ${yolo_script} -r ${darknet_path}/${darknet_project_run} -i ${training_path + '/images_to_bootstrap.txt'} -p ${training_path} -y ${darknet_path} -w ${weight_path}`
	// var success = ""
	// var error = '';
	// console.log(cmd)

	// //change directory to darknet
	// process.chdir(darknet_path);
	// var child = exec(cmd, (err, stdout, stderr) => {
	// 	if (err){
	// 		console.log(`This is the error: ${err.message}`);
	// 		success = err.message;
	// 		fs.writeFile(`${run_path}/${err_file}`, success, (err) => {
	// 			if (err) throw err;
	// 		});
	// 	}
	// 	else if (stderr) {
	// 		console.log(`This is the stderr: ${stderr}`);
	// 		fs.writeFile(`${run_path}/${err_file}`, stderr, (err) => {
	// 			if (err) throw err;
	// 		});
	// 		//return;
	// 	}
	// 	console.log("stdout: ", stdout)
	// 	console.log("stderr: ", stderr)
	// 	console.log("err: ", err)
	// 	console.log("The script has finished running");
	// 	fs.writeFile(`${run_path}/done.log`, success, (err) => {
	// 		if (err) throw err;
	// 	});
	// });

	

	res.send({"Success": "Yes"});
});

api.post('/changeValidation', async(req, res) => {
	var PName = req.body.PName;
	var admin = req.body.Admin;
	var status = req.body.validMode;

	if(status == 0){
		await db.runAsync("UPDATE Projects SET Validate = '"+Number(1)+"' WHERE PName = '" + PName + "' AND Admin ='" + admin + "'");
		console.log("Enabled Validation mode for: " + admin + "-" + PName);
		res.send({"Success": "Yes"});
	}
	else if(status == 1) {
		await db.runAsync("UPDATE Projects SET Validate = '"+Number(0)+"' WHERE PName = '" + PName + "' AND Admin ='" + admin + "'");
		console.log("Disabled Validation mode for: " + admin + "-" + PName);
		res.send({"Success": "Yes"});
	}
	else{
		res.send({"Success": "No"});
	}
});


api.post('/batch-change-class', async(req,res) =>{
	console.log("Batch Change Class")
	var project_name = req.body.PName,
		admin = req.body.Admin,
		class1 = req.body.class1,
		class2 = req.body.class2;
	
	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + project_name; // $LABELING_TOOL_PATH/public/projects/project_name

	var aidb = new sqlite3.Database(project_path+'/'+ project_name +'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to aidb.');
	});
	aidb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};
	aidb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};	
	aidb.runAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.run(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err)
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};

	await aidb.runAsync("UPDATE Labels SET CName = '"+class2+"' WHERE CName ='"+ class1 +"'");
	await aidb.runAsync("UPDATE Validation SET CName = '"+class2+"' WHERE CName ='"+ class1 +"'");
	res.send({"Success": "Yes"});
});

api.post('/solo-change-class', async(req,res) =>{
	var LID = parseInt(req.body.LID),
	selectedClass = req.body.selectedClass,
	project_name = req.body.PName,
	admin = req.body.Admin;

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/', // $LABELING_TOOL_PATH/public/projects/
		project_path = main_path + admin + '-' + project_name; // $LABELING_TOOL_PATH/public/projects/project_name

	var aidb = new sqlite3.Database(project_path+'/'+ project_name +'.db', (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to aidb.');
	});
	aidb.getAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.get(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};
	aidb.allAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.all(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					//reject(err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err);
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};	
	aidb.runAsync = function (sql) {
		var that = this;
		return new Promise(function (resolve, reject) {
			that.run(sql, function (err, row) {
				if (err)
				{
					console.log("runAsync ERROR! ", err);
					aidb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("aidb closed");
						}
					});
					reject(err)
				}
				else
					resolve(row);
			});
		}).catch(err => {
			console.error(err)
			// res.send({"Success": "No"})
			return res.send("ERROR! "+err);
		});
	};

	await aidb.runAsync("UPDATE Labels SET CName = '"+selectedClass+"' WHERE LID =' "+ LID +"'");
	await aidb.runAsync("UPDATE Validation SET CName = '"+selectedClass+"' WHERE LID =' "+ LID +"'");
	res.send({"Success": "Yes"});
});