const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

async function getServerStatsPage(req, res) {
    // get URL variables
    var IDX = parseInt(req.query.IDX),
        IName = String(req.query.IName),
        curr_class = req.query.curr_class,
        user = req.cookies.Username;

    if (IDX == undefined) {
        IDX = 0;
        valid = 1;
        return res.redirect("/home");
    }
    if (user == undefined) {
        return res.redirect("/");
    }

    var projects = await db.allAsync(
        "SELECT * FROM Access WHERE Username = '" + user + "'",
    );
    var num = IDX;

    if (num >= projects.length) {
        valid = 1;
        return res.redirect("/home");
    }
    var PName = projects[num].PName;
    var admin = projects[num].Admin;

    var results1 = await db.getAsync(
        "SELECT * FROM `Projects` WHERE PName = '" +
        PName +
        "' AND Admin = '" +
        admin +
        "'",
    );
    var acc = await db.allAsync(
        "SELECT * FROM `Access` WHERE PName = '" +
        PName +
        "' AND Admin = '" +
        admin +
        "'",
    );

    var access = [];
    for (var i = 0; i < acc.length; i++) {
        access.push(acc[i].Username);
    }

    process.env.TERM = "xterm";
    var top_stdout = "",
        nvidia_smi,
        gpu_info = [];

    try {
        // const { stdout, stderr } = await exec( "uptime");
        const { stdout, stderr } = await execAsync("top -bn1|head -20");
        top_stdout = stdout;
        global.logger.debug("this is top_stdout: ", top_stdout);
    } catch (error) {
        global.logger.error(error);
        top_stdout = ""; // Set default value on error
    }

    try {
        // Fetch GPU information using CSV format
        const { stdout } = await execAsync(
            "nvidia-smi --format=csv,noheader,nounits --query-gpu=name,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu",
        );

        if (!stdout || stdout.trim().length === 0) {
            throw new Error("nvidia-smi output is empty.");
        }

        // Convert CSV output into structured JSON
        let lines = stdout.trim().split("\n");
        gpu_info = lines.map((line) => {
            let [
                name,
                temp,
                power_usage,
                power_cap,
                memory_used,
                memory_total,
                utilization,
            ] = line.split(",").map((x) => x.trim());
            return {
                name,
                temp: `${temp} C`,
                power_usage: `${power_usage} W`,
                power_cap: `${power_cap} W`,
                memory_used: `${memory_used} MiB`,
                memory_total: `${memory_total} MiB`,
                utilization: `${utilization} %`,
            };
        });
    } catch (error) {
        global.logger.debug("Error fetching GPU stats:", error);
        gpu_info = []; // Set default value on error
    }

    // var g_stdout;
    // try {
    // 	const { stdout, stderr } = await exec( "nvidia-smi -q -x");
    // 	g_stdout = stdout;
    // 	// console.log("this is g_stdout: ", g_stdout);
    // }
    // catch( error) {
    // 	global.logger.error(error);
    // }

    // var gpu_data = "";

    // parseString( g_stdout,  function( error, gpu_result) {
    // 	if (error) {
    // 		global.logger.error(error);
    // 	} else {
    // 		// console.log( result);
    // 		gpu_data = JSON.stringify( gpu_result);
    // 	}
    // });

    res.render("servstats", {
        title: "servstats",
        user: req.cookies.Username,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        top_stdout: top_stdout,
        gpu_info: gpu_info,
        activePage: "servstats",
    });
}

module.exports = getServerStatsPage;
