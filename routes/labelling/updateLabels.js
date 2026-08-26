const queries = require("../../queries/queries");

async function updateLabels(req, res) {
    var IDX = parseInt(req.body.IDX),
        PName = req.body.PName,
        admin = req.body.Admin,
        user = req.cookies.Username;

    var publicPath = currentPath,
        mainPath = publicPath + "public/projects/";

    var user = req.body.user,
        CName = req.body.CName,
        IName = req.body.IName,
        reviewImage = req.body.rev_image,
        prev_IName = req.body.prev_IName,
        next_IName = req.body.next_IName,
        changeWidth = req.body.origin_image_width / req.body.image_width,
        labelsCounter = parseInt(req.body.labels_counter),
        currClass = req.body.curr_class,
        sortFilter = req.body.sortFilter,
        classFilter = req.body.classFilter,
        imageClass = req.body.imageClass,
        formAction = req.body.form_action;

    var projectPath = mainPath + admin + "-" + PName;

    try {
        global.logger.info("[updateLabels] Request body: " + JSON.stringify(req.body));
        await queries.project.updateReviewImage(
            projectPath,
            reviewImage,
            IName,
        );

        const confidence = await queries.project.getAllValidationsForImage(
            projectPath,
            IName,
        );
        await queries.project.deleteAllLabelsForImage(projectPath, IName);
        await queries.project.deleteAllValidationsForImage(projectPath, IName);

        var conf = {};

        if (confidence != []) {
            for (var x = 0; x < confidence.rows.length; x++) {
                conf[confidence.rows[x].LID] = confidence.rows[x];
            }
        }

        const cnames = Array.isArray(req.body.CName) ? req.body.CName : (req.body.CName ? [req.body.CName] : []);
        const xs = Array.isArray(req.body.X) ? req.body.X : (req.body.X ? [req.body.X] : []);
        const ys = Array.isArray(req.body.Y) ? req.body.Y : (req.body.Y ? [req.body.Y] : []);
        const ws = Array.isArray(req.body.W) ? req.body.W : (req.body.W ? [req.body.W] : []);
        const hs = Array.isArray(req.body.H) ? req.body.H : (req.body.H ? [req.body.H] : []);
        const lids = Array.isArray(req.body.LabelingID) ? req.body.LabelingID : (req.body.LabelingID ? [req.body.LabelingID] : []);

        global.logger.info("[updateLabels] Normalized arrays: " + JSON.stringify({ cnames, xs, ys, ws, hs, lids }));

        var currentConfidence = [];

        for (var j = 0; j < lids.length; j++) {
            var tempLID = lids[j];
            var width = Number(ws[j]);
            var height = Number(hs[j]);

            if (!(width >= 0) || !(height >= 0)) {
                currentConfidence.push([]);
                continue;
            }

            if (tempLID in conf) {
                currentConfidence.push([conf[tempLID]]);
            } else {
                currentConfidence.push([]);
            }
        }

        const currentLabels = await queries.project.getAllLabels(projectPath);
        let newMax;

        if (currentLabels.rows.length == 0) {
            newMax = 1;
        } else {
            const oldMax = await queries.project.getMaxLabelId(projectPath);

            newMax = oldMax.rows[0].LID + 1;
        }

        const count = lids.length;
        for (var i = 0; i < count; i++) {
            const wVal = Number(ws[i]);
            const hVal = Number(hs[i]);
            if (isNaN(wVal) || isNaN(hVal) || wVal < 0 || hVal < 0) {
                global.logger.info(`[updateLabels] Skipping invalid width/height at i=${i}: W=${ws[i]}, H=${hs[i]}`);
                continue;
            }

            const xVal = xs[i] && xs[i].includes(',') ? xs[i] : Number(xs[i]);
            const yVal = ys[i] && ys[i].includes(',') ? ys[i] : Number(ys[i]);

            global.logger.info(`[updateLabels] Inserting label i=${i}: LID=${newMax}, CName=${cnames[i]}, X=${xVal}, Y=${yVal}, W=${wVal}, H=${hVal} (type of X: ${typeof xVal})`);

            await queries.project.createLabel(
                projectPath,
                Number(newMax),
                cnames[i],
                xVal,
                yVal,
                wVal,
                hVal,
                IName,
            );

            if (currentConfidence[i] && currentConfidence[i][0]) {
                await queries.project.createValidation(
                    projectPath,
                    Number(currentConfidence[i][0].Confidence),
                    Number(newMax),
                    currentConfidence[i][0].CName,
                    currentConfidence[i][0].IName,
                );
            }

            newMax = newMax + 1;
        }

        // The video player saves the outgoing frame via AJAX on every
        // play/pause/step -- everything above this (label save, review
        // update) is the same save path a normal form submit takes; only the
        // response differs, so a video-frame-mode save never triggers a
        // full-page redirect.
        if (req.body.ajax === "1") {
            return res.json({ success: true, IName, reviewImage });
        }

        if (formAction == "save") {
            return res.redirect(
                "/annotate?IDX=" +
                    IDX +
                    "&IName=" +
                    IName +
                    "&curr_class=" +
                    currClass,
            );
        } else if (formAction == "auto-prev") {
            return res.redirect(
                "/annotate?IDX=" +
                    IDX +
                    "&IName=" +
                    prev_IName +
                    "&curr_class=" +
                    currClass,
            );
        } else if (formAction == "auto-next") {
            return res.redirect(
                "/annotate?IDX=" +
                    IDX +
                    "&IName=" +
                    next_IName +
                    "&curr_class=" +
                    currClass,
            );
        } else if (formAction == "saveV") {
            return res.redirect(
                "/labelingV?IDX=" +
                    IDX +
                    "&IName=" +
                    IName +
                    "&curr_class=" +
                    currClass +
                    "&sort=" +
                    sortFilter +
                    "&class=" +
                    imageClass +
                    "&classFilter=" +
                    classFilter,
            );
        } else if (formAction == "auto-prevV") {
            return res.redirect(
                "/labelingV?IDX=" +
                    IDX +
                    "&IName=" +
                    prev_IName +
                    "&curr_class=" +
                    currClass +
                    "&sort=" +
                    sortFilter +
                    "&class=" +
                    imageClass +
                    "&classFilter=" +
                    classFilter,
            );
        } else if (formAction == "auto-nextV") {
            return res.redirect(
                "/labelingV?IDX=" +
                    IDX +
                    "&IName=" +
                    next_IName +
                    "&curr_class=" +
                    currClass +
                    "&sort=" +
                    sortFilter +
                    "&class=" +
                    imageClass +
                    "&classFilter=" +
                    classFilter,
            );
        }

        // Fallback redirect to prevent request hanging if formAction is invalid/unmatched
        return res.redirect(
            "/annotate?IDX=" +
                IDX +
                "&IName=" +
                IName +
                "&curr_class=" +
                currClass,
        );
    } catch (err) {
        global.logger.error(err);
        return res.status(500).send("Error updating labels");
    }
}

module.exports = updateLabels;
