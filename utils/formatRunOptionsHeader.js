const LABEL_OVERRIDES = {
    yolovx_path: "YOLO Path",
    yolo_version: "YOLO Version",
    yolo_task: "Task",
    yolo_mode: "Mode",
    darknet_path: "Darknet Path",
    python_path: "Python Path",
    imgsz: "Image Size",
    subdiv: "Subdivisions",
    top_k: "Top K",
    using_imagenet_classes: "Using ImageNet Classes",
    training_percent: "Train Split (%)",
    val_percent: "Validation Split (%)",
    test_percent: "Test Split (%)",
    max_images: "Max Images",
    selected_classes: "Classes",
    inference_file: "Inference File",
};

function humanizeKey(key) {
    if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];

    return key
        .split("_")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function formatRunOptionsHeader(options) {
    const entries = Object.entries(options).map(([key, value]) => {
        const displayValue = value === undefined || value === null || value === "" ? "(none)" : value;
        return [humanizeKey(key), displayValue];
    });

    const labelWidth = entries.reduce((max, [label]) => Math.max(max, label.length), 0);
    const rows = entries.map(([label, value]) => `${label.padEnd(labelWidth)} : ${value}`);

    const title = "Run Options (for reproducing this run)";
    const contentWidth = Math.max(title.length, ...rows.map((row) => row.length));
    const rule = `# ${"=".repeat(contentWidth)}`;

    return [
        rule,
        `# ${title}`,
        rule,
        ...rows.map((row) => `# ${row}`),
        rule,
        "",
        "",
    ].join("\n");
}

module.exports = formatRunOptionsHeader;
