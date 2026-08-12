function formatRunOptionsHeader(options) {
    const lines = Object.entries(options).map(([key, value]) => {
        const displayValue = value === undefined || value === null || value === "" ? "(none)" : value;
        return `# ${key}: ${displayValue}`;
    });

    return [
        "# ===== Run options (for reproducing this run) =====",
        ...lines,
        "# ====================================================",
        "",
        "",
    ].join("\n");
}

module.exports = formatRunOptionsHeader;
