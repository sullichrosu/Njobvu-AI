// HPC (Slurm) job status/history page. Additive - reads job data client-side
// from the existing /api/v2/slurm/jobs and /api/v2/slurm/jobs/:id endpoints,
// so this controller only needs to resolve the usual project/access context
// for nav + the page-level access gate, matching every other page under
// processingNav/inferenceNav (e.g. getServerStatsPage.js).
async function getHpcJobsPage(req, res) {
    var IDX = parseInt(req.query.IDX),
        user = req.cookies.Username;

    if (IDX == undefined || isNaN(IDX)) {
        IDX = 0;
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
        return res.redirect("/home");
    }
    var PName = projects[num].PName;
    var admin = projects[num].Admin;

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

    res.render("hpc/jobs", {
        title: "hpcJobs",
        user: user,
        access: access,
        PName: PName,
        Admin: admin,
        IDX: IDX,
        activePage: "hpcJobs",
    });
}

module.exports = getHpcJobsPage;
