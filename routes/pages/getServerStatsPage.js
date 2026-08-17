const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const queries = require("../../queries/queries");

async function getServerStatsPage(req, res) {
    let idx = parseInt(req.query.IDX, 10);
    const user = req.cookies ? req.cookies.Username : undefined;

    if (isNaN(idx) || idx === undefined) {
        return res.redirect("/home");
    }
    if (user === undefined) {
        return res.redirect("/");
    }

    let projects = [];
    if (queries.managed && typeof queries.managed.getUserProjects === "function") {
        try {
            const userProjectsRes = await queries.managed.getUserProjects(user);
            projects = (userProjectsRes && userProjectsRes.rows) ? userProjectsRes.rows : (Array.isArray(userProjectsRes) ? userProjectsRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql("SELECT * FROM Access WHERE Username = ?", [user]);
            projects = (accRes && accRes.rows) ? accRes.rows : (Array.isArray(accRes) ? accRes : []);
        } catch (err) {}
    }
    if ((!projects || projects.length === 0) && global.db && typeof global.db.allAsync === "function") {
        try {
            projects = await global.db.allAsync("SELECT * FROM Access WHERE Username = '" + user + "'");
        } catch (err) {}
    }

    if (!projects || idx < 0 || idx >= projects.length) {
        return res.redirect("/home");
    }

    const PName = projects[idx].PName;
    const admin = projects[idx].Admin;

    let accessUsers = [];
    if (queries.managed && typeof queries.managed.sql === "function") {
        try {
            const accRes = await queries.managed.sql(
                "SELECT * FROM Access WHERE PName = ? AND Admin = ?",
                [PName, admin]
            );
            const rows = (accRes && accRes.rows) ? accRes.rows : [];
            accessUsers = rows.map((r) => r.Username);
        } catch (err) {}
    }

    process.env.TERM = "xterm";
    let topStdout = "";
    let gpuInfo = [];

    try {
        const { stdout } = await execAsync("top -bn1|head -20");
        topStdout = stdout;
    } catch (error) {
        global.logger.error(error);
        topStdout = "";
    }

    try {
        const { stdout } = await execAsync(
            "nvidia-smi --format=csv,noheader,nounits --query-gpu=name,temperature.gpu,power.draw,power.limit,memory.used,memory.total,utilization.gpu"
        );

        if (stdout && stdout.trim().length > 0) {
            const lines = stdout.trim().split("\n");
            gpuInfo = lines.map((line) => {
                const [
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
        }
    } catch (error) {
        global.logger.debug("Error fetching GPU stats:", error);
        gpuInfo = [];
    }

    res.render("servstats", {
        title: "servstats",
        user,
        access: accessUsers,
        PName,
        Admin: admin,
        IDX: idx,
        top_stdout: topStdout,
        gpu_info: gpuInfo,
        activePage: "servstats",
    });
}

module.exports = getServerStatsPage;
