(function () {
    "use strict";

    function initializeProjectSwitcher() {
        const switcher = document.getElementById("project-switcher");
        const toggle = document.getElementById("project-switcher-toggle");
        const menu = document.getElementById("project-switcher-menu");
        const search = document.getElementById("project-switcher-search");
        const list = document.getElementById("project-switcher-list");

        if (!switcher || !toggle || !menu || !search || !list) return;

        let projects = [];

        function setOpen(isOpen) {
            menu.hidden = !isOpen;
            toggle.setAttribute("aria-expanded", String(isOpen));
            if (isOpen) search.focus();
        }

        function renderProjects() {
            const searchTerm = search.value.trim().toLowerCase();
            const matches = projects.filter((project) => {
                const name = String(project.PName || "").toLowerCase();
                const admin = String(project.Admin || "").toLowerCase();
                return name.includes(searchTerm) || admin.includes(searchTerm);
            });

            list.replaceChildren();

            if (matches.length === 0) {
                const empty = document.createElement("span");
                empty.className = "project-switcher-status";
                empty.textContent = "No matching projects";
                list.appendChild(empty);
                return;
            }

            matches.forEach((project) => {
                const link = document.createElement("a");
                link.className = "project-switcher-item";
                link.href = `/project?IDX=${encodeURIComponent(project.idx)}&page=1&perPage=10`;
                link.setAttribute("role", "option");
                link.textContent = project.PName;

                if (project.Admin) {
                    const owner = document.createElement("small");
                    owner.textContent = ` by ${project.Admin}`;
                    link.appendChild(owner);
                }

                list.appendChild(link);
            });
        }

        toggle.addEventListener("click", async function () {
            const isOpen = menu.hidden;
            setOpen(isOpen);

            if (isOpen && projects.length === 0) {
                try {
                    const response = await fetch("/api/v2/projects?perPage=1000", {
                        headers: { Accept: "application/json" },
                    });
                    const payload = await response.json();

                    if (!response.ok || !payload.success) {
                        throw new Error(payload.error || "Unable to load projects");
                    }

                    projects = payload.projects || [];
                    renderProjects();
                } catch (error) {
                    list.replaceChildren();
                    const status = document.createElement("span");
                    status.className = "project-switcher-status project-switcher-error";
                    status.textContent = "Unable to load projects";
                    list.appendChild(status);
                    console.error("Project switcher failed:", error);
                }
            }
        });

        search.addEventListener("input", renderProjects);

        document.addEventListener("click", function (event) {
            if (!switcher.contains(event.target)) setOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") setOpen(false);
        });
    }

    document.addEventListener("DOMContentLoaded", initializeProjectSwitcher);
})();
