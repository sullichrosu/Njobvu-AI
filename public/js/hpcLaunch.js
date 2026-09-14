// Shared client-side helper for the additive "Launch on HPC" option that
// sits alongside the existing local exec launch forms (training + the three
// inference types). Only ever appends a panel to a form - never touches the
// form's existing submit handler or local-launch request, so the local exec
// path keeps working exactly as before regardless of whether this runs.
(function () {
    function fetchAccess() {
        return fetch("/api/v2/slurm/access").then(function (resp) {
            return resp.json();
        });
    }

    // Foolproof partition choice: a plain <select> built only from the
    // server's admin-curated list, defaulting to the first entry - there is
    // no free-text path to an invalid/unauthorized partition. Omitted
    // entirely when no partitions are configured.
    function buildPanel(access, opts) {
        var wrapper = document.createElement("div");
        wrapper.className = "form-row hpc-launch-panel";
        wrapper.style.marginTop = "10px";
        wrapper.style.alignItems = "flex-end";

        var partitionHtml = "";
        if (access.partitions && access.partitions.length > 0) {
            var options = access.partitions
                .map(function (p) {
                    return '<option value="' + p + '">' + p + "</option>";
                })
                .join("");

            partitionHtml =
                '<div class="form-group col-md-2">' +
                '<label for="' + opts.formId + '-hpc-partition">Partition</label>' +
                '<select id="' + opts.formId + '-hpc-partition" class="form-control">' + options + "</select>" +
                "</div>";
        }

        wrapper.innerHTML =
            partitionHtml +
            '<div class="form-group col-md-3">' +
            '<button type="button" id="' + opts.formId + '-hpc-launch" class="btn btn-outline-primary btn-lg" style="border-radius: 0">Launch on HPC</button>' +
            "</div>";

        return wrapper;
    }

    // opts: { formId, endpoint, redirectUrl, collectFields }
    // collectFields() returns the JSON body to submit, or `false` to abort
    // (e.g. a required select was left blank) - same validation convention
    // the existing local-launch inline scripts use.
    function init(opts) {
        fetchAccess()
            .then(function (access) {
                if (!access.success || !access.configured || !access.allowed) {
                    return;
                }

                var form = document.getElementById(opts.formId);
                if (!form) {
                    return;
                }

                var panel = buildPanel(access, opts);
                form.appendChild(panel);

                var launchBtn = document.getElementById(opts.formId + "-hpc-launch");
                var partitionSelect = document.getElementById(opts.formId + "-hpc-partition");

                launchBtn.addEventListener("click", function () {
                    var fields = opts.collectFields();
                    if (fields === false) {
                        return;
                    }

                    if (partitionSelect) {
                        fields.partition = partitionSelect.value;
                    }

                    if (window.LoadingSpinner) LoadingSpinner.show(launchBtn, "Submitting to HPC...");

                    fetch(opts.endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(fields),
                    })
                        .then(function (resp) {
                            return resp.json();
                        })
                        .then(function (body) {
                            if (window.LoadingSpinner) LoadingSpinner.hide(launchBtn);

                            if (!body.success) {
                                alert(body.error || "Failed to submit HPC job");
                                return;
                            }

                            alert("Submitted to HPC (Slurm job " + body.slurmJobId + ")");
                            window.location.replace(opts.redirectUrl);
                        })
                        .catch(function (error) {
                            if (window.LoadingSpinner) LoadingSpinner.hide(launchBtn);
                            console.log(error);
                            alert("Failed to submit HPC job");
                        });
                });
            })
            .catch(function (error) {
                console.log("HPC access check failed:", error);
            });
    }

    window.HpcLaunch = { init: init };
})();
