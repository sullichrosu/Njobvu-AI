const queries = require("../../queries/queries");
const { getSlurmPartitions } = require("../../utils/slurmAccess");

// Admin-only page for managing which Users have access to which Slurm
// partitions. Restricted to the admin user defined in config.json
async function getAdminPartitionsPage(req, res) {
    const user = req.cookies.Username;

    if (!user) {
        return res.redirect("/");
    }

    const config = global.configFile || {};

    if (!config.admin || user !== config.admin) {
        return res.redirect("/home");
    }

    const usersResult = await queries.managed.getAllUsers();
    const users = ((usersResult && usersResult.rows) || []).map(
        (row) => row.Username,
    );

    const partitions = getSlurmPartitions();

    const accessResult = await queries.managed.listPartitionAccess();
    const accessRows = (accessResult && accessResult.rows) || [];

    const accessByUser = {};
    for (const row of accessRows) {
        if (!accessByUser[row.Username]) {
            accessByUser[row.Username] = [];
        }
        accessByUser[row.Username].push(row.Partition);
    }

    res.render("admin/partitionAccess", {
        title: "adminPartitionAccess",
        user: user,
        users: users,
        partitions: partitions,
        accessByUser: accessByUser,
        isAdmin: true,
    });
}

module.exports = getAdminPartitionsPage;
