////////////////////////////////////////////////////////
// Main - Routes

const { reject, filter } = require("bluebird");

////////////////////////////////////////////////////////
module.exports = {

	getLoginPage: async (req,res) => {
		console.log("getLoginPage");
		var auto_save = 1
		db.runAsync("UPDATE Projects SET AutoSave = '"+auto_save+"'");

		res.render('login', {
            title: 'login',
            logged: req.query.logged
        });
	},

    // Signup page
    getSignupPage: async (req,res) => {
        console.log("getSignupPage");
		var results1 = await db.allAsync("SELECT * FROM `Users`");
		var users = []
		for(var i = 0; i < results1.length; i++)
		{
			users.push(results1[i].Username)
		}

        res.render('signup', {
            title: 'signup',
            logged: req.query.logged,
			users: users
        });
    },

    // Home page
    getHomePage: async (req, res) => {
        console.log("getHomePage");
		
		var page = req.query.page,
            perPage = req.query.perPage,
            user = req.cookies.Username;
		
		var public_path = __dirname.replace('routes','');
		var project_path = public_path + 'public/projects/';
       
        if(page == undefined) {
            page = 1
        }
        if(perPage == undefined){
            perPage = 10
        }

        var qnum = 0;
        var test = await db.allAsync("SELECT * FROM `Access` WHERE Username = '"+user+"' LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);
        var projects = await db.allAsync("SELECT * FROM `Access` WHERE Username = '"+user+"'"); 
		var results1 = []

		var test2 = []
		var PNames = []
		
		if(projects.length > 0)
		{  
			for(var i = 0; i < projects.length; i++)
			{
				var Proj = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '"+projects[i].PName+"' AND Admin = '"+projects[i].Admin+"' AND Validate = '"+Number(0)+"'");
				
				//[Project, IDX, Review, NumberOfImages, %labeled]
				if(Proj != null){
					results1.push([Proj, i, 0, 0, 0])
					PNames.push(Proj.PName)
				}
			}
			if(PNames.length != 0){
				var list_counter = [];
				var review_counter = [];
				var counter = 0;
				
				for(var i=0; i<results1.length; i++) 
				{	
					var dbpath = project_path + '/' + results1[i][0].Admin + '-' + results1[i][0].PName + '/' + results1[i][0].PName + '.db';
	
					// Connect to project databases
					var hdb = new sqlite3.Database(dbpath, (err) => {
						if (err) {
							return console.error("hdb connect error: ", err.message);
						}
						console.log('Connected to hdb.');
					});
					
					// create async database object functions
					hdb.getAsync = function (sql) {
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
							console.log(err)
						});
					};
					hdb.allAsync = function (sql) {
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
							console.log(err)
						});
					};		
					
	
					var numimg = await hdb.getAsync("SELECT COUNT(*) FROM Images");
					var numLabeled = await hdb.allAsync("SELECT DISTINCT IName FROM Labels");
					var complete = Math.trunc(100*(numLabeled.length/numimg['COUNT(*)']));
					var found_review = await hdb.getAsync("SELECT COUNT(*) FROM Images WHERE reviewImage = 1")
					counter = await hdb.getAsync("SELECT COUNT(*) FROM Labels");
					
					if(Number(found_review['COUNT(*)']) == 0)
					{
						review_counter.push(0);
					}
					else
					{
	
						review_counter.push(1);
						results1[i][2] = 1;
					}
					results1[i][3] = Number(numimg['COUNT(*)']);
					results1[i][4] = complete;
	
					list_counter.push(counter['COUNT(*)']);
					
					
					hdb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("hdb closed successfully");
						}
					});
				}
			}
            
        }
        res.render('home', {
            title: 'home',
            user: user,
            projects: results1,
			PNames: PNames,
			list_counter: list_counter,
			page: page,
            current: page,
            pages: Math.ceil(projects.length/perPage),
            perPage: perPage,
            logged: req.query.logged,
            needs_review: review_counter
        });
    },

	//validation home page
	// Home page
    getValidationHomePage: async (req, res) => {
        console.log("getValidationHomePage");
		
		var page = req.query.page,
            perPage = req.query.perPage,
            user = req.cookies.Username;
		
		var public_path = __dirname.replace('routes','');
		var project_path = public_path + 'public/projects/';
       
        if(page == undefined) {
            page = 1
        }
        if(perPage == undefined){
            perPage = 10
        }

        var qnum = 0;
        var test = await db.allAsync("SELECT * FROM `Access` WHERE Username = '"+user+"' LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);
        var projects = await db.allAsync("SELECT * FROM `Access` WHERE Username = '"+user+"'");
		var results1 = []

		var test2 = []
		var PNames = []
		
		if(projects.length > 0)
		{  
			for(var i = 0; i < projects.length; i++)
			{
				var Proj = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '"+projects[i].PName+"' AND Admin = '"+projects[i].Admin+"' AND Validate = '"+Number(1)+"'");

				//[Project, IDX, Review, NumberOfImages, %labeled]
				if(Proj != null){
					results1.push([Proj, i, 0, 0, 0])
					PNames.push(Proj.PName)
				}
			}
			
			if(PNames.length != 0){

				var list_counter = [];
				var review_counter = [];
				var counter = 0;
				
				for(var i=0; i<results1.length; i++) 
				{	
					var dbpath = project_path + '/' + results1[i][0].Admin + '-' + results1[i][0].PName + '/' + results1[i][0].PName + '.db';
	
					// Connect to project databases
					var hdb = new sqlite3.Database(dbpath, (err) => {
						if (err) {
							return console.error("hdb connect error: ", err.message);
						}
						console.log('Connected to hdb.');
					});
					
					// create async database object functions
					hdb.getAsync = function (sql) {
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
							console.log(err)
						});
					};
					hdb.allAsync = function (sql) {
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
							console.log(err)
						});
					};		
					
	
					var numimg = await hdb.getAsync("SELECT COUNT(*) FROM Images");
					var numLabeled = await hdb.allAsync("SELECT DISTINCT IName FROM Labels");
					var complete = Math.trunc(100*(numLabeled.length/numimg['COUNT(*)']));
					var found_review = await hdb.getAsync("SELECT COUNT(*) FROM Images WHERE reviewImage = 1")
					counter = await hdb.getAsync("SELECT COUNT(*) FROM Labels");
					
					if(Number(found_review['COUNT(*)']) == 0)
					{
						review_counter.push(0);
					}
					else
					{
	
						review_counter.push(1);
						results1[i][2] = 1;
					}
					results1[i][3] = Number(numimg['COUNT(*)']);
					results1[i][4] = complete;
	
					list_counter.push(counter['COUNT(*)']);
					
					
					hdb.close(function(err){
						if(err)
						{
							console.error(err);
						}
						else{
							console.log("hdb closed successfully");
						}
					});
				}
			}

        }
        res.render('homeV', {
            title: 'homeV',
            user: user,
            projects: results1,
			PNames: PNames,
			list_counter: list_counter,
			page: page,
            current: page,
            pages: Math.ceil(projects.length/perPage),
            perPage: perPage,
            logged: req.query.logged,
            needs_review: review_counter
        });
    },




    // create page
    getCreatePage: async (req, res) => {
		username = req.cookies.Username;
		console.log("getCreatePage");
		var projects =  await db.allAsync("SELECT * FROM Access WHERE Admin = '"+username+"'");
		var PNames = []
		for(var i = 0; i < projects.length; i++)
		{
			PNames.push(projects[i].PName)
		}

        res.render('create', {
            title: 'create',
            user: req.cookies.Username,
            logged: req.query.logged,
			PNames: PNames
        });
    },

    // project page
    getProjectPage: async (req, res) => {
        console.log("getProjectPage");
       
		var public_path = __dirname.replace('routes','');
		
        // get URL variables
		var IDX = parseInt(req.query.IDX),
            page = req.query.page,
            perPage = req.query.perPage,
			user = req.cookies.Username,
			valid = 0;
	
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}

		
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
		
		var num = IDX;
		
		if(num > projects.length){
			valid = 1;
			return res.redirect('/home');
		}

		var PName = projects[num].PName;
		var admin = projects[num].Admin;
		
		var public_path = __dirname.replace('routes','');
		var db_path = public_path + 'public/projects/' + admin + '-' + PName + '/' + PName + '.db';

        if(page == undefined){
            page = 1
        }
        if(perPage == undefined){
            perPage = 10
        }
		
		var pdb = new sqlite3.Database(db_path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to pdb.');
		});

		// create async database object functions
		pdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		pdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		

        var results1 = await pdb.allAsync("SELECT * FROM `Images` LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);
        
        var results2 = await pdb.getAsync("SELECT COUNT(*) FROM Images");
        
        var list_counter = []
        for(var i=0; i<results1.length; i++) {
            var results3 = await pdb.getAsync("SELECT COUNT(*) FROM `Labels` WHERE IName = '"+results1[i].IName+"'")
            list_counter.push(results3['COUNT(*)'])
        }
		// var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "'");
		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
        for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
        }
        pdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("pdb closed successfully");
			}
		});
        res.render('project', {
            title: 'project',
			user: user,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            access: access,
            images: results1,
            list_counter: list_counter,
            current: page,
            pages: Math.ceil(results2['COUNT(*)']/perPage),
            perPage: perPage,
            logged: req.query.logged
        });
    },

	// project validation page

    // project page
    getValidationProjectPage: async (req, res) => {
        console.log("getValidationProjectPage");
       
		var public_path = __dirname.replace('routes','');
		
        // get URL variables
		var IDX = parseInt(req.query.IDX),
            page = req.query.page,
            perPage = req.query.perPage,
			sortFilter = req.query.sort,
			imageClass = req.query.class,
			user = req.cookies.Username,
			valid = 0;
	
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}

		
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
		
		var num = IDX;
		
		if(num > projects.length){
			valid = 1;
			return res.redirect('/home');
		}

		var PName = projects[num].PName;
		var admin = projects[num].Admin;
		
		var public_path = __dirname.replace('routes','');
		var db_path = public_path + 'public/projects/' + admin + '-' + PName + '/' + PName + '.db';

        if(page == undefined){
            page = 1
        }
        if(perPage == undefined){
            perPage = 10
        }
		
		var pdb = new sqlite3.Database(db_path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to pdb.');
		});

		// create async database object functions
		pdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		pdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
		var projectClasses = await pdb.allAsync("SELECT * FROM `Classes`");
		var Classes = [];
		for(var i = 0; i < projectClasses.length; i++){
			Classes.push(projectClasses[i].CName);
		}
		var results1 = Array();

		
        // var results1 = await pdb.allAsync("SELECT * FROM `Images` LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);

		if((imageClass == null || imageClass == 'null' || !Classes.includes(imageClass)) && (sortFilter == "null" || sortFilter == null) || (sortFilter=="Confidence" && imageClass == 'null')){ 
			results1 = await pdb.allAsync("SELECT * FROM `Images` LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);
		}
		else if(sortFilter == "needs_review" && (imageClass == null || imageClass == 'null' || !Classes.includes(imageClass))){
			results1 = await pdb.allAsync("SELECT * FROM `Images` WHERE reviewImage=1 LIMIT "+perPage+" OFFSET "+ (page-1)*perPage);
		}
		else if(sortFilter == 'confidence' && (imageClass == null || imageClass == 'null' || !Classes.includes(imageClass))){
			var images = await pdb.allAsync("SELECT * FROM `Labels`");
			var confidenceImages = await pdb.allAsync("SELECT Confidence, IName FROM `Validation`");
			const highestConf = {};
			confidenceImages.forEach(item => {
				const { Confidence, IName } = item;
				if (!(IName in highestConf) || Confidence > highestConf[IName]) {
					highestConf[IName] = Confidence;
				}
			});

			images.sort((a, b) => {
				const confidenceA = highestConf[a.IName] || 0;
				const confidenceB = highestConf[b.IName] || 0;
				return confidenceB - confidenceA;
			  });

			for(var d = 0; d < images.length; d++){
				var imageData = await (pdb.allAsync("SELECT * FROM `Images` WHERE IName = '" + images[d].IName + "'"));
				results1.push(imageData[0]);
			}
		}
		else if(sortFilter == 'confidence' && imageClass != null && Classes.includes(imageClass)){
			var imagesWithClass = await pdb.allAsync("SELECT DISTINCT IName FROM `Labels` WHERE CName = '" + imageClass + "'");
			var confidenceImages = await pdb.allAsync("SELECT Confidence, IName FROM `Validation` WHERE CName = '" + imageClass + "'");
			const highestConf = {};
			confidenceImages.forEach(item => {
				const { Confidence, IName } = item;
				if (!(IName in highestConf) || Confidence > highestConf[IName]) {
					highestConf[IName] = Confidence;
				}
			});
			imagesWithClass.sort((a, b) => {
				const confidenceA = highestConf[a.IName] || 0;
				const confidenceB = highestConf[b.IName] || 0;
				return confidenceB - confidenceA;
			  });

			for(var d = 0; d < imagesWithClass.length; d++){
				var imageData = await (pdb.allAsync("SELECT * FROM `Images` WHERE IName = '" + imagesWithClass[d].IName + "'"));
				results1.push(imageData[0]);
			}
		}
		else if(sortFilter == 'has_class'){
			if(imageClass != 'null'){
				var imagesWithClass;
				imagesWithClass = await pdb.allAsync("SELECT DISTINCT IName FROM `Labels` WHERE CName = '" + imageClass + "'");
			}
			else{
				imagesWithClass = await pdb.allAsync("SELECT DISTINCT IName FROM `Labels`");
			}
			imagesWithClass.sort((a, b) => {
				if (a.IName < b.IName) {
				  return -1;
				} else if (a.IName > b.IName) {
				  return 1;
				} else {
				  return 0;
				}
			  });

			for(var d = 0; d < imagesWithClass.length; d++){
				var imageData = await (pdb.allAsync("SELECT * FROM `Images` WHERE IName = '" + imagesWithClass[d].IName + "'"));
				results1.push(imageData[0]);
			}
		}
        else{
			var imagesWithClass = await pdb.allAsync("SELECT DISTINCT IName FROM `Labels` WHERE CName = '" + imageClass + "'");
			imagesWithClass.sort((a, b) => {
				if (a.IName < b.IName) {
				  return -1;
				} else if (a.IName > b.IName) {
				  return 1;
				} else {
				  return 0;
				}
			  });

			for(var d = 0; d < imagesWithClass.length; d++){
				var imageData = await (pdb.allAsync("SELECT * FROM `Images` WHERE IName = '" + imagesWithClass[d].IName + "'"));
				results1.push(imageData[0]);
			}
		}

        var results2 = await pdb.getAsync("SELECT COUNT(*) FROM Images");
		
		var imageLabels = [];
        var list_counter = [];
		var imageConf = [];
		// console.log(results1);
        for(var i=0; i<results1.length; i++) {

			labelList = await pdb.allAsync("SELECT CName FROM `Labels` WHERE IName = '" + results1[i].IName + "'");
			var usedLabels = new Set();
			for(var f=0; f<labelList.length;f++){
				usedLabels.add(labelList[f].CName);
			}

            var results3 = await pdb.getAsync("SELECT COUNT(*) FROM `Labels` WHERE IName = '"+results1[i].IName+"'")
            list_counter.push(results3['COUNT(*)']);
			
			imageLabels.push(Array.from(usedLabels));

			var imageList = await pdb.allAsync("SELECT Confidence FROM `Validation` WHERE IName = '"+results1[i].IName+"'");
			if(imageList.length == 0){
				imageConf.push(0);
			}
			else{
				var high = 0;
				var idx = 0;
				for(var x = 0; x < imageList.length; x++){
					if(imageList[x].Confidence > high){
						high = imageList[x].Confidence;
						idx = x;
					}
				}
				if(typeof(imageList[idx].Confidence) != 'number'){	
					imageConf.push(0);
				}
				else{
					imageConf.push(imageList[idx].Confidence);
				}
			}

			// console.log(imageConf + ' ' + results1[i].IName);
        }

		// var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "'");
		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
        for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
        }
        pdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("pdb closed successfully");
			}
		});

        res.render('projectV', {
            title: 'projectV',
			user: user,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            access: access,
            images: results1,
			classes: imageLabels,
            list_counter: list_counter,
            current: page,
            pages: Math.ceil(results2['COUNT(*)']/perPage),
            perPage: perPage,
            logged: req.query.logged,
			sortFilter: sortFilter,
			imageClass: imageClass,
			projectClasses: Classes,
			imageConf: imageConf
        });
    },



    // config page
    getConfigPage: async (req, res) => {
        console.log("getConfigPage");
		   
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			user = req.cookies.Username;
		
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}

		if(user == undefined)
		{
			return res.redirect('/');
		}
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
		var num = IDX

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}


		var PName = projects[num].PName;
		var admin = projects[num].Admin;	
		
		var mergeProjects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"' AND NOT PName = '"+PName+"'");

		var public_path = __dirname.replace('routes',''),
			main_path = public_path + 'public/projects/',
			project_path = main_path + admin + '-' + PName,
			path = project_path + '/' + PName + '.db',
			training_path = project_path + '/training',
			log_path = training_path + '/logs/',
			python_path = training_path + '/python',
			python_path_file = training_path + '/Paths.txt',
			darknet_path_file = training_path + '/darknetPaths.txt',
			weights_path = training_path + '/weights';

		if(!fs.existsSync(training_path))
		{
			fs.mkdirSync(training_path);
			fs.mkdirSync(log_path);
			fs.mkdirSync(python_path);
			fs.mkdirSync(weights_path);
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
		if(!fs.existsSync(weights_path))
		{
			fs.mkdirSync(weights_path);
		}
		if(!fs.existsSync(darknet_path_file))
		{
			fs.writeFile(darknet_path_file, "", function(err){
				if(err)
				{
					console.log(err);
				}
			});
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

		var cfdb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to cfdb.');
		});

		// create async database object functions
		cfdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		cfdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
		

        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var results2 = await cfdb.allAsync("SELECT * FROM `Classes`");
		var results3 = await db.allAsync("SELECT * FROM `Access` WHERE PName= '" + PName + "' AND Admin = '"+ admin + "' AND Username != '"+user+"'");
		var results4 = await db.allAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin != '" + user + "'");
        var acc1 = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '"+ admin + "'");
        var acc = [];
        for(var i = 0; i < acc1.length; i++)
        {
            acc.push(acc1[i].Username);
        }
        var access = [];
        for(var i = 0; i < results3.length; i++)
        {
            access.push(results3[i].Username);
        }
		var DAdmin = [];
		for(var i = 0; i<results4.length; i++)
		{
			DAdmin.push(results4[i].Admin);
		}
		// close the database
		cfdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("cfdb closed successfully");
			}
		});

		var colors = [];
		var i = 0;
		while(colors.length < results2.length)
		{
			if(i >= colorsJSON.length)
			{
				i = 0;
			}
			colors.push(colorsJSON[i]);
			i++;
		}
		
		
		var scripts = [];
		scripts = await readdirAsync(python_path);

		var weights = [];
		weights = await readdirAsync(weights_path);
        
		var paths = fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean);

		var darknet_paths = fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean);
		
		res.render('config', {
            title: 'config',
            user: user,
			Admin: results1.Admin,
			DAdmin: DAdmin,
            access: access,
			acc: acc,
			PName: PName,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
			weights: weights,
			scripts: scripts,
			paths: paths,
			darknet_paths: darknet_paths,
			classes: results2,
			colors: colors,
            logged: req.query.logged,
			mergeProjects: mergeProjects
        });
    },

// config page
getValidationConfigPage: async (req, res) => {
	console.log("getValidationConfigPage");
	   
	// get URL variables
	var IDX = parseInt(req.query.IDX),
		user = req.cookies.Username;
	
	if(IDX == undefined)
	{
		IDX = 0;
		valid = 1;
		return res.redirect('/home');
	}

	if(user == undefined)
	{
		return res.redirect('/');
	}
	var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
	var num = IDX

	if(num >= projects.length){
		valid = 1;
		return res.redirect('/home');
	}


	var PName = projects[num].PName;
	var admin = projects[num].Admin;	
	
	var mergeProjects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"' AND NOT PName = '"+PName+"'");

	var public_path = __dirname.replace('routes',''),
		main_path = public_path + 'public/projects/',
		project_path = main_path + admin + '-' + PName,
		path = project_path + '/' + PName + '.db',
		training_path = project_path + '/training',
		log_path = training_path + '/logs/',
		python_path = training_path + '/python',
		python_path_file = training_path + '/Paths.txt',
		darknet_path_file = training_path + '/darknetPaths.txt',
		weights_path = training_path + '/weights';

	if(!fs.existsSync(training_path))
	{
		fs.mkdirSync(training_path);
		fs.mkdirSync(log_path);
		fs.mkdirSync(python_path);
		fs.mkdirSync(weights_path);
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
	if(!fs.existsSync(weights_path))
	{
		fs.mkdirSync(weights_path);
	}
	if(!fs.existsSync(darknet_path_file))
	{
		fs.writeFile(darknet_path_file, "", function(err){
			if(err)
			{
				console.log(err);
			}
		});
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

	var cfdb = new sqlite3.Database(path, (err) => {
		if (err) {
			return console.error(err.message);
		}
		console.log('Connected to cfdb.');
	});

	// create async database object functions
	cfdb.getAsync = function (sql) {
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
			console.log(err)
		});
	};
	cfdb.allAsync = function (sql) {
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
			console.log(err)
		});
	};		
	

	var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
	var results2 = await cfdb.allAsync("SELECT * FROM `Classes`");
	var results3 = await db.allAsync("SELECT * FROM `Access` WHERE PName= '" + PName + "' AND Admin = '"+ admin + "' AND Username != '"+user+"'");
	var results4 = await db.allAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin != '" + user + "'");
	var acc1 = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '"+ admin + "'");
	var acc = [];
	for(var i = 0; i < acc1.length; i++)
	{
		acc.push(acc1[i].Username);
	}
	var access = [];
	for(var i = 0; i < results3.length; i++)
	{
		access.push(results3[i].Username);
	}
	var DAdmin = [];
	for(var i = 0; i<results4.length; i++)
	{
		DAdmin.push(results4[i].Admin);
	}
	// close the database
	cfdb.close(function(err){
		if(err)
		{
			console.error(err);
		}
		else{
			console.log("cfdb closed successfully");
		}
	});

	var colors = [];
	var i = 0;
	while(colors.length < results2.length)
	{
		if(i >= colorsJSON.length)
		{
			i = 0;
		}
		colors.push(colorsJSON[i]);
		i++;
	}
	
	
	var scripts = [];
	scripts = await readdirAsync(python_path);

	var weights = [];
	weights = await readdirAsync(weights_path);
	
	var paths = fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean);

	var darknet_paths = fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean);
	
	res.render('configV', {
		title: 'config',
		user: user,
		Admin: results1.Admin,
		DAdmin: DAdmin,
		access: access,
		acc: acc,
		PName: PName,
		IDX: IDX,
		PDescription: results1.PDescription,
		AutoSave: results1.AutoSave,
		weights: weights,
		scripts: scripts,
		paths: paths,
		darknet_paths: darknet_paths,
		classes: results2,
		colors: colors,
		logged: req.query.logged,
		mergeProjects: mergeProjects
	});
},

	// download page
    getDownloadPage: async (req, res) => {
        console.log("getDownloadPage");
		   
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			user = req.cookies.Username;

		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");

		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;

		var public_path = __dirname.replace('routes','');
			main_path = public_path + 'public/projects/',
			path = main_path + admin + '-' + PName + '/' + PName + '.db',
			training_path = main_path + admin + '-' + PName + '/training',
			log_path = training_path + '/logs/',
			python_path = training_path + '/python',
			weights_path = training_path + '/weights';
		
		if(!fs.existsSync(training_path))
		{
			fs.mkdirSync(training_path);
			fs.mkdirSync(log_path);
			fs.mkdirSync(python_path);
			fs.mkdirSync(weights_path);
			fs.writeFile(python_path_file, "", function(err){
				if(err)
				{
					console.log(err);
				}
			});
		}
		else if(!fs.existsSync(weights_path))
		{
			fs.mkdirSync(weights_path);
		}
		
		
		var ddb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to ddb.');
		});

		// create async database object functions
		ddb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		ddb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
		

        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var results2 = await ddb.allAsync("SELECT * FROM `Classes`");
        var results3 = await db.allAsync("SELECT * FROM `Access` WHERE PName= '" + PName + "' AND Admin = '" + admin + "' AND Username != '"+user+"'");
        var acc1 = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var acc = [];
        for(var i = 0; i < acc1.length; i++)
        {
            acc.push(acc1[i].Username);
        }
        var access = [];
        for(var i = 0; i < results3.length; i++)
        {
            access.push(results3[i].Username);
        }
		
		// close the database
		ddb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("ddb closed successfully");
			}
		});
		
		var colors = [];
		var i = 0;
		while(colors.length < results2.length)
		{
			if(i >= colorsJSON.length)
			{
				i = 0;
			}
			colors.push(colorsJSON[i]);
			i++;
		}


		//Get scripts
		var has_scripts = 0;
		var scripts = [];
		scripts = await readdirAsync(python_path);
		if( scripts.length > 0 )
		{
			has_scripts = 1;
		}

		// Get weights files
		var weights = await readdirAsync(weights_path)
		
		res.render('download', {
            title: 'download',
            user: user,
            Admin: results1.Admin,
            access: access,
			acc: acc,
			PName: PName,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
			classes: results2,
			colors: colors,
			scripts: scripts,
			weights: weights,
			has_scripts: has_scripts,
            logged: req.query.logged
        });
	},
	
    // labeling page
    getLabelingPage: async (req, res) => {
        console.log("getLabelingPage");
       
		var IDX = parseInt(req.query.IDX),
			IName = String(req.query.IName),
			curr_class = req.query.curr_class,
			user = req.cookies.Username;
		
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");

		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;

       	// set paths
		var public_path = __dirname.replace('routes',''),
            main_path = public_path + 'public/projects/',
			project_path = main_path + admin + '-' + PName;

		var rel_project_path = 'projects/' + admin + '-' + PName;

		//Connect Database
		var ldb = new sqlite3.Database(project_path + '/' + PName + '.db', (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to ldb.');
		});

		// create async database object functions
		ldb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		ldb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
		ldb.eachAsync = function (sql) {
			var that = this;
			return new Promise(function (resolve, reject) {
				that.each(sql, function (err, row) {
					if (err)
					{
						console.log("runAsync ERROR! ", err);
						reject(err);
					}
					else
						resolve(row);
				});
			}).catch(err => {
				console.log(err)
			});
		};


		var results1 = await ldb.allAsync("SELECT * FROM `Classes`")
		var Classes = [];
		for(var i = 0; i < results1.length; i++)
		{
			Classes.push(results1[i].CName);
		}
        var results2 = await ldb.allAsync("SELECT * FROM `Images`")
		var rowid = await ldb.getAsync("SELECT rowid FROM Images WHERE IName = '" + IName +"'");
	
		var results3 = await ldb.allAsync("SELECT * FROM `Labels` WHERE IName = '" + String(IName) + "'")
        var results4 = await ldb.allAsync("SELECT * FROM `Images` WHERE IName = '" + String(IName) + "'")
        var results5 = await db.getAsync("SELECT AutoSave FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'")
        var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		
		if(curr_class == null) {
			curr_class = results1[0].CName;
		}

		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}
		
		var abs_image_path = project_path + "/images/"+IName;
		
		if(!fs.existsSync(abs_image_path))
		{
			res.render('404', {
				title: '404',
				user: req.cookies.Username
			});
			
		}
		else{
		// var rel_image_path = abs_image_path;
		var rel_image_path = rel_project_path + "/images/"+results4[0].IName;
		// get image information //there might be a race condition between rel_project_path and project_path which makes them different when bootstrapping is run
        var img = fs.readFileSync(project_path + "/images/"+results4[0].IName, (err) => { 
			if(err)
			{
				res.render('404', {
					title: '404',
					user: req.cookies.Username
				});
			}
		}),
            img_data = probe.sync(img),
            img_w = img_data.width,
            img_h = img_data.height,
            image_ratio = img_h / img_w,
            image_width = img_w,
            image_height = image_ratio * image_width,
            prev_IName = next_IName = -1;
        var curr_index = 1;
		
		var list_counter = [];

		curr_index = Number(rowid.rowid);
		if(curr_index != 1)
		{
			prev_IName = results2[curr_index-2]["IName"];
		}
		if(curr_index != results2.length)
		{
			next_IName = results2[curr_index]["IName"]
		}

		// close the database
		ldb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("ldb closed successfully");
			}
		});
        
		var colors = [];
		var i = 0;
		while(colors.length < Classes.length)
		{
			if(i >= colorsJSON.length)
			{
				i = 0;
			}
			colors.push(colorsJSON[i]);
			i++;
		}
		console.log(results3);
        res.render('labeling', {
            title: 'labeling',
            user: user,
            access: access,
            image_width: image_width,
            image_height: image_height,
            image_path: rel_image_path,
            image_name: results4[0].IName,
            image_ratio: image_ratio,
            classes: Classes,
            images: results2,
            labels: results3,
			colors: colors,
			IName: IName,
            prev_IName: prev_IName,
			next_IName: next_IName,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            images_length: results2.length,
            curr_index: curr_index,
            curr_class: curr_class,
            rev_image: results4[0].reviewImage,
            list_counter: list_counter,
            AutoSave: results5["AutoSave"],
            logged: req.query.logged
        });
	}
    },



    // labeling page
    getValidationLabelingPage: async (req, res) => { //tp1
        console.log("getValidationLabelingPage");
       
		var IDX = parseInt(req.query.IDX),
			IName = String(req.query.IName),
			curr_class = req.query.curr_class,
			sortFilter = req.query.sort,
			imageClass = req.query.class,
			classFilter = req.query.classFilter,
			user = req.cookies.Username;
		
		
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}
		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");

		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;

       	// set paths
		var public_path = __dirname.replace('routes',''),
            main_path = public_path + 'public/projects/',
			project_path = main_path + admin + '-' + PName;

		var rel_project_path = 'projects/' + admin + '-' + PName;

		//Connect Database
		var ldb = new sqlite3.Database(project_path + '/' + PName + '.db', (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to ldb.');
		});

		// create async database object functions
		ldb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		ldb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
		ldb.eachAsync = function (sql) {
			var that = this;
			return new Promise(function (resolve, reject) {
				that.each(sql, function (err, row) {
					if (err)
					{
						console.log("runAsync ERROR! ", err);
						reject(err);
					}
					else
						resolve(row);
				});
			}).catch(err => {
				console.log(err)
			});
		};


		var results1 = await ldb.allAsync("SELECT * FROM `Classes`")
		var Classes = [];
		for(var i = 0; i < results1.length; i++)
		{
			Classes.push(results1[i].CName); 
		}

		var results2 = Array();
		if(imageClass == null || imageClass == 'null' || !Classes.includes(imageClass)){
			results2 = await ldb.allAsync("SELECT * FROM `Images`")
		} else{
			var imagesWithClass = await ldb.allAsync("SELECT DISTINCT IName FROM `Labels` WHERE CName = '" + imageClass + "'");
			imagesWithClass.sort((a, b) => {
				if (a.IName < b.IName) {
				  return -1;
				} else if (a.IName > b.IName) {
				  return 1;
				} else {
				  return 0;
				}
			  });

			for(var d = 0; d < imagesWithClass.length; d++){
				var imageData = await (ldb.allAsync("SELECT * FROM `Images` WHERE IName = '" + imagesWithClass[d].IName + "'"));
				results2.push(imageData[0]);
			}
		}
		var rowid;
		if(imageClass == null || imageClass == 'null'  || !Classes.includes(imageClass)){
			rowid = await ldb.getAsync("SELECT rowid FROM Images WHERE IName = '" + IName +"'"); 
		}
		else{
			for(var b = 0; b < results2.length; b++){
				if(IName == results2[b].IName) {
					rowid = {rowid: b+1}
					break;
				}
			}
		}

		// for(var b = 0; b < results2.length; b++){
		// 	console.log(results2[b].IName);
		// }
		// console.log(rowid);
		await ldb.allAsync("UPDATE Images SET reviewImage = 0 WHERE IName = '" + IName + "'");

		var results3 = await ldb.allAsync("SELECT * FROM `Labels` WHERE IName = '" + String(IName) + "'");
        var results4 = await ldb.allAsync("SELECT * FROM `Images` WHERE IName = '" + String(IName) + "'");
        var results5 = await db.getAsync("SELECT AutoSave FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
		var results6 = await ldb.allAsync("SELECT * FROM `Validation` WHERE IName = '" + String(IName) + "'");
        var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		
		if(curr_class == null) {
			curr_class = results1[0].CName;
		}

		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}
		
		var abs_image_path = project_path + "/images/"+IName;
		
		if(!fs.existsSync(abs_image_path))
		{
			res.render('404', {
				title: '404',
				user: req.cookies.Username
			});
			
		}
		else{
		// var rel_image_path = abs_image_path;
		var rel_image_path = rel_project_path + "/images/"+results4[0].IName;
		// get image information //there might be a race condition between rel_project_path and project_path which makes them different when bootstrapping is run
        var img = fs.readFileSync(project_path + "/images/"+results4[0].IName, (err) => { 
			if(err)
			{
				res.render('404', {
					title: '404',
					user: req.cookies.Username
				});
			}
		}),
            img_data = probe.sync(img),
            img_w = img_data.width,
            img_h = img_data.height,
            image_ratio = img_h / img_w,
            image_width = img_w,
            image_height = image_ratio * image_width,
            prev_IName = next_IName = -1;
        var curr_index = 1;
		
		var list_counter = [];
		
		curr_index = Number(rowid.rowid);

		if(curr_index != 1)
		{
			prev_IName = results2[curr_index-2]["IName"];
		}
		if(curr_index != results2.length)
		{
			next_IName = results2[curr_index]["IName"]
		}

		// close the database
		ldb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("ldb closed successfully");
			}
		});
        
		var colors = [];
		var i = 0;
		while(colors.length < Classes.length)
		{
			if(i >= colorsJSON.length)
			{
				i = 0;
			}
			colors.push(colorsJSON[i]);
			i++;
		}

		var stats = {}
		for(var a = 0; a < results3.length; a++){
			className = results3[a].CName;
			labelID = results3[a].LID;
			if(stats[className] == null){
				stats[className] = 1;
			}
			else{
				stats[className] += 1;
			}
		}
		var statsO = [];
		for (const [key, value] of Object.entries(stats)) {
			statsO.push([key, value]);
		  }
		// console.log(results2);

        res.render('labelingV', {
            title: 'labeling',
            user: user,
            access: access,
            image_width: image_width,
            image_height: image_height,
            image_path: rel_image_path,
            image_name: results4[0].IName,
            image_ratio: image_ratio,
            classes: Classes,
            images: results2,
            labels: results3,
			labelConf: results6,
			colors: colors,
			IName: IName,
            prev_IName: prev_IName,
			next_IName: next_IName,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            images_length: results2.length,
            curr_index: curr_index,
            curr_class: curr_class,
            rev_image: results4[0].reviewImage,
            list_counter: list_counter,
            AutoSave: results5["AutoSave"],
            logged: req.query.logged,
			stats: statsO,
			sortFilter: sortFilter,
			imageClass: imageClass,
			classFilter: classFilter
        });
	}
    },



    // Training page
    getTrainingPage: async (req, res) => {
        console.log("getTrainingPage");
	   
		const readdir = util.promisify(glob)
		const readFile = util.promisify(fs.readFile)
		
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			IName = String(req.query.IName),
			curr_class = req.query.curr_class,
			user = req.cookies.Username;
	
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}


		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;

		// set paths
		var public_path = __dirname.replace('routes',''),
			main_path = public_path + 'public/projects/',
			project_path = main_path + admin + '-' + PName,
			path = project_path + '/' + PName + '.db',
			training_path = project_path + '/training',
			log_path = training_path + '/logs/',
			weights_path = training_path + '/weights',
			python_path = training_path + '/python',
			python_path_file = training_path + '/Paths.txt';

		if(!fs.existsSync(training_path))
		{
			fs.mkdirSync(training_path);
			fs.mkdirSync(log_path);
			fs.mkdirSync(python_path);
			fs.mkdirSync(weights_path);
			
			fs.writeFile(python_path_file, "", function(err){
				if(err)
				{
					console.log(err);
				}
			});
		}
		else if(!fs.existsSync(weights_path))
		{
			fs.mkdirSync(weights_path);
		}
		
		// connect to project database
		var tdb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to tdb.');
		});

		// create async database object functions
		tdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		tdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
        
		
        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
		var results2 = await tdb.allAsync("SELECT * FROM `Classes`");
		

		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}
	
		//Get global weights///////////////////////////////////////////
		var global_weights = await readdirAsync(weights_path);

		// get runs ///////////////////////////////////////////////////
		var runs = await readdirAsync(log_path);
		runs = runs.reverse();
		// get logfiles
		var logs = [];

		var log_idx;
		var err_idx;
		var done_idx;
		var run_status = []
		var log_files = []
		var log_contents = [];
		var weights = [];
		var weight = [];
		var err_file = [];
		var err = [];
		var prev = 0;
		var weights_names = [];
		var weights_files = [];
		var run_path = "";
		var run_paths = [];
		var idx = 0;
		
		// Get weights files and log files for each run
		for(var i = 0; i < runs.length; i++)
		{
			weight = [];
			run_path = `${log_path}${runs[i]}/`;
			run_paths.push(run_path)
			// get all files for each run
			logs = await readdirAsync(`${run_path}`);
			// get index of log file
			log_idx = logs.indexOf(`${runs[i]}.log`)
			// get log file for each run
			log_files.push(`${runs[i]}.log`);
				
			log_contents.push(fs.readFileSync(`${run_path}${runs[i]}.log`, 'utf8'));
			
			//check for error file
			err_idx = logs.indexOf(`${runs[i]}-error.log`);
			done_idx = logs.indexOf("done.log");
			
			if(err_idx >= 0)
			{
				// Add error to arrays
				run_status.push("FAILED");
				err_file.push(`${logs[err_idx]}`);
				err.push(fs.readFileSync(run_path+logs[err_idx], 'utf8'));

				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx || j == err_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}
			else if(done_idx >= 0)
			{
				run_status.push("DONE");
				
				err_file.push("NULL");
				err.push("NULL");
				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx || j == done_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}		
			else
			{
				run_status.push("RUNNING");
				
				err_file.push("NULL");
				err.push("NULL");
				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}
			weights.push(weight);
			weights_files.push(weights_names)
		}

		
		
		// close the database
		tdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("tdb closed successfully");
			}
		});
        

		// get python scripts
		var scripts = await readdirAsync(python_path);
		
		// get python paths
		// This places the entire file into memory
		// Will not work with large files, apx 10000000 lines
		var paths = fs.readFileSync(python_path_file, 'utf-8').split('\n').filter(Boolean);
	
		// Get default python path
		var default_path = configFile.default_python_path;
		if(!default_path)
		{
			default_path = null
		}
        res.render('training', {
            title: 'training',
			user: req.cookies.Username,
			access: access,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
            classes: results2,
			logs: log_files,
			err_file: err_file,
			err_contents: err,
			default_path: default_path,
			paths: paths,
			scripts: scripts,
			global_weights: global_weights,
			weights: weights,
			weight_names: weights_files,
			run_status: run_status,
			run_paths: run_paths,
			log_contents: log_contents,
            logged: req.query.logged
        });
    },

    // Yolo page
    getYoloPage: async (req, res) => {
        console.log("getYoloPage");
	   
		const readdir = util.promisify(glob)
		const readFile = util.promisify(fs.readFile)
		
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			IName = String(req.query.IName),
			curr_class = req.query.curr_class,
			user = req.cookies.Username;
	
		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/l');
		}


		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");
		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;

		// set paths
		var public_path = __dirname.replace('routes',''),
			main_path = public_path + 'public/projects/',
			project_path = main_path + admin + '-' + PName,
			path = project_path + '/' + PName + '.db',
			training_path = project_path + '/training',
			weights_path = training_path + '/weights',
			log_path = training_path + '/logs/',
			python_path = training_path + '/python',
			python_path_file = training_path + '/Paths.txt',
			darknet_path_file = training_path + '/darknetPaths.txt';

		if(!fs.existsSync(training_path))
		{
			fs.mkdirSync(training_path);
			fs.mkdirSync(log_path);
			fs.mkdirSync(python_path);
			fs.mkdirSync(weights_path);
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
		else if(!fs.existsSync(weights_path))
		{
			fs.mkdirSync(weights_path);
		}
		else if(!fs.existsSync(darknet_path_file))
		{
			fs.writeFile(darknet_path_file, "", function(err){
				if(err)
				{
					console.log(err);
				}
			});
		}
		
		// connect to project database
		var tdb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to tdb.');
		});

		// create async database object functions
		tdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		tdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
        
		
        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
		var results2 = await tdb.allAsync("SELECT * FROM `Classes`");
		

		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}
	
		//Get global weights///////////////////////////////////////////
		var global_weights = await readdirAsync(weights_path);

		// get runs
		var runs = await readdirAsync(log_path);
		runs = runs.reverse();
		// get logfiles
		var logs = [];

		var log_idx;
		var err_idx;
		var done_idx;
		var run_status = []
		var log_files = []
		var log_contents = [];
		var weights = [];
		var weight = [];
		var err_file = [];
		var err = [];
		var prev = 0;
		var weights_names = [];
		var weights_files = [];
		var run_path = "";
		var run_paths = [];
		var idx = 0;
		
		// Get weights files and log files for each run
		for(var i = 0; i < runs.length; i++)
		{
			weight = [];
			run_path = `${log_path}${runs[i]}/`;
			run_paths.push(run_path)
			// get all files for each run
			logs = await readdirAsync(`${run_path}`);
			// get index of log file
			log_idx = logs.indexOf(`${runs[i]}.log`)
			// get log file for each run
			log_files.push(`${runs[i]}.log`);
				
			log_contents.push(fs.readFileSync(`${run_path}${runs[i]}.log`, 'utf8'));
			
			//check for error file
			err_idx = logs.indexOf(`${runs[i]}-error.log`);
			done_idx = logs.indexOf("done.log");
			
			if(err_idx >= 0)
			{
				// Add error to arrays
				run_status.push("FAILED");
				err_file.push(`${logs[err_idx]}`);
				err.push(fs.readFileSync(run_path+logs[err_idx], 'utf8'));

				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx || j == err_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}
			else if(done_idx >= 0)
			{
				run_status.push("DONE");
				
				err_file.push("NULL");
				err.push("NULL");
				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx || j == done_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}		
			else
			{
				run_status.push("RUNNING");
				
				err_file.push("NULL");
				err.push("NULL");
				// Add weights to array
				for(var j=0; j<logs.length; j++)
				{
					if(j == log_idx)
					{
						continue;
					}
					weight.push(`${run_path}${logs[j]}`);
					weights_names.push(logs[j]);
				}
			}
			weights.push(weight);
			weights_files.push(weights_names)
		}

		
		
		// close the database
		tdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("tdb closed successfully");
			}
		});
        

		// get python scripts
		var scripts = await readdirAsync(python_path);
		
		// get python paths
		// This places the entire file into memory
		// Will not work with large files, apx 10000000 lines
		var paths = fs.readFileSync(darknet_path_file, 'utf-8').split('\n').filter(Boolean);
	
		// Get default python path
		var default_path = configFile.default_yolo_path;
		if(!default_path)
		{
			default_path = null
		}

        res.render('yolo', {
			title: 'yolo',
			user: req.cookies.Username,
			access: access,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
            classes: results2,
			logs: log_files,
			err_file: err_file,
			err_contents: err,
			default_path: default_path,
			paths: paths,
			scripts: scripts,
			global_weights: global_weights,
			weights: weights,
			weight_names: weights_files,
			run_status: run_status,
			run_paths: run_paths,
			log_contents: log_contents,
            logged: req.query.logged
        });
    },

	// Stats page
    getStatsPage: async (req, res) => {
        console.log("getStatsPage");
	   
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			user = req.cookies.Username;

		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}

		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");

		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;
		
		var public_path = __dirname.replace('routes','');
		var main_path = public_path + 'public/projects/';
		var path = main_path + admin + '-' + PName + '/' + PName + '.db';
		

		var sdb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to tdb.');
		});

		// create async database object functions
		sdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		sdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
		var results2 = await sdb.allAsync("SELECT * FROM `Classes`");
		
		var classes = [];
		var counts = [];
		var icounts = [];
		var lcounts = 0;
		for(var i = 0; i < results2.length; i++)
		{
			var results3 = await sdb.getAsync("SELECT COUNT(*) FROM Labels Where CName = '" + results2[i].CName + "'");
			classes.push(results2[i].CName);
			counts.push(results3["COUNT(*)"]);
			var results4 = await sdb.allAsync("SELECT DISTINCT IName FROM Labels WHERE CName = '" + results2[i].CName + "'");
			icounts.push(results4.length);
		}
		
		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}


		var results5 = await sdb.getAsync("SELECT COUNT(*) FROM Images");
		var results6 = await sdb.allAsync("SELECT DISTINCT IName FROM Labels");
		var complete = Math.trunc(100*(results6.length/results5['COUNT(*)']));

		// close the database
		sdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("sdb closed successfully");
			}
		});
        
        res.render('stats', {
            title: 'stats',
			user: req.cookies.Username,
			access: access,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
			classes: classes,
			counts: counts,
			icounts: icounts,
			complete: complete,
            logged: req.query.logged
        });
    },

	// Stats page
    getValidationStatsPage: async (req, res) => {
        console.log("getValidationStatsPage");
	   
		// get URL variables
		var IDX = parseInt(req.query.IDX),
			user = req.cookies.Username;

		if(IDX == undefined)
		{
			IDX = 0;
			valid = 1;
			return res.redirect('/home');
		}
		if(user == undefined)
		{
			return res.redirect('/');
		}

		var projects = await db.allAsync("SELECT * FROM Access WHERE Username = '"+user+"'");

		var num = IDX;

		if(num >= projects.length){
			valid = 1;
			return res.redirect('/home');
		}
		var PName = projects[num].PName;
		var admin = projects[num].Admin;
		
		var public_path = __dirname.replace('routes','');
		var main_path = public_path + 'public/projects/';
		var path = main_path + admin + '-' + PName + '/' + PName + '.db';
		

		var sdb = new sqlite3.Database(path, (err) => {
			if (err) {
				return console.error(err.message);
			}
			console.log('Connected to tdb.');
		});

		// create async database object functions
		sdb.getAsync = function (sql) {
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
				console.log(err)
			});
		};
		sdb.allAsync = function (sql) {
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
				console.log(err)
			});
		};		
        var results1 = await db.getAsync("SELECT * FROM `Projects` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
		var results2 = await sdb.allAsync("SELECT * FROM `Classes`");
		
		var classes = [];
		var counts = [];
		var icounts = [];
		var lcounts = 0;
		for(var i = 0; i < results2.length; i++)
		{
			var results3 = await sdb.getAsync("SELECT COUNT(*) FROM Labels Where CName = '" + results2[i].CName + "'");
			classes.push(results2[i].CName);
			counts.push(results3["COUNT(*)"]);
			var results4 = await sdb.allAsync("SELECT DISTINCT IName FROM Labels WHERE CName = '" + results2[i].CName + "'");
			icounts.push(results4.length);
		}
		
		var acc = await db.allAsync("SELECT * FROM `Access` WHERE PName = '" + PName + "' AND Admin = '" + admin + "'");
        var access = [];
		for(var i = 0; i < acc.length; i++)
        {
            access.push(acc[i].Username);
		}


		var results5 = await sdb.getAsync("SELECT COUNT(*) FROM Images");
		var results6 = await sdb.allAsync("SELECT DISTINCT IName FROM Images WHERE reviewImage = 1");
		var complete = Math.trunc(100*(results6.length/results5['COUNT(*)']));

		// close the database
		sdb.close(function(err){
			if(err)
			{
				console.error(err);
			}
			else{
				console.log("sdb closed successfully");
			}
		});
        
        res.render('statsV', {
            title: 'stats',
			user: req.cookies.Username,
			access: access,
			PName: PName,
			Admin: admin,
			IDX: IDX,
            PDescription: results1.PDescription,
            AutoSave: results1.AutoSave,
			classes: classes,
			counts: counts,
			icounts: icounts,
			complete: complete,
            logged: req.query.logged
        });
    },

	// User page
    getUserPage: async (req, res) => {
		console.log("getUserPage");

		var user = req.cookies.Username;
		if(user == undefined)
		{
			return res.redirect('/');
		}

		var userInfo = await db.getAsync("SELECT * FROM Users WHERE Username = '" + user +"'");
		var results1 = await db.allAsync("SELECT * FROM Users");
		var users = []
		for(var i = 0; i < results1.length; i++)
		{
			users.push(results1[i].Username)
		}
		var Fname = userInfo.FirstName;
		var Lname = userInfo.LastName;
		var email = userInfo.Email;

		res.render('user', {
            title: 'user',
			user: req.cookies.Username,
            Fname: Fname,
			Lname: Lname,
			email: email,
			users:  users,
			logged: req.query.logged
        });
	},
    // 404 page
    get404Page: async (req, res) => {
		
        res.render('404', {
            title: '404',
            user: req.cookies.Username
        });
    }
};

