// OpenCV (cv2) code generators for each built-in step type. Each entry
// receives the step's `params` and returns a snippet operating on `img`
// (a numpy/cv2 BGR array) inside `process_image`.
const BUILTIN_STEP_TEMPLATES = {
    illumination_normalization: (params) => {
        const method = params.method === "histogram_equalization" ? "histogram_equalization" : "clahe";
        const clipLimit = Number(params.clipLimit) || 2.0;
        const tileGridSize = Math.max(1, parseInt(params.tileGridSize, 10) || 8);

        if (method === "histogram_equalization") {
            return [
                "gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img",
                "img = cv2.cvtColor(cv2.equalizeHist(gray), cv2.COLOR_GRAY2BGR)",
            ].join("\n");
        }

        return [
            "gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img",
            `clahe = cv2.createCLAHE(clipLimit=${clipLimit}, tileGridSize=(${tileGridSize}, ${tileGridSize}))`,
            "img = cv2.cvtColor(clahe.apply(gray), cv2.COLOR_GRAY2BGR)",
        ].join("\n");
    },
    resize: (params) => {
        const width = Math.max(1, parseInt(params.width, 10) || 640);
        const height = Math.max(1, parseInt(params.height, 10) || 640);
        const interpMap = { linear: "cv2.INTER_LINEAR", nearest: "cv2.INTER_NEAREST", cubic: "cv2.INTER_CUBIC" };
        const interp = interpMap[params.interpolation] || interpMap.linear;

        if (params.keepAspectRatio) {
            return [
                "h, w = img.shape[:2]",
                `scale = min(${width} / w, ${height} / h)`,
                `img = cv2.resize(img, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=${interp})`,
            ].join("\n");
        }

        return `img = cv2.resize(img, (${width}, ${height}), interpolation=${interp})`;
    },
    rotate: (params) => {
        const angle = Number(params.angle) || 0;
        const lines = [
            "h, w = img.shape[:2]",
            "center = (w / 2, h / 2)",
            `matrix = cv2.getRotationMatrix2D(center, ${angle}, 1.0)`,
        ];

        if (params.expand) {
            lines.push(
                "cos = abs(matrix[0, 0])",
                "sin = abs(matrix[0, 1])",
                "new_w = int((h * sin) + (w * cos))",
                "new_h = int((h * cos) + (w * sin))",
                "matrix[0, 2] += (new_w / 2) - center[0]",
                "matrix[1, 2] += (new_h / 2) - center[1]",
                "img = cv2.warpAffine(img, matrix, (new_w, new_h))",
            );
        } else {
            lines.push("img = cv2.warpAffine(img, matrix, (w, h))");
        }

        return lines.join("\n");
    },
    crop: (params) => {
        const top = Number(params.top) || 0;
        const bottom = Number(params.bottom) || 0;
        const left = Number(params.left) || 0;
        const right = Number(params.right) || 0;

        return [
            "h, w = img.shape[:2]",
            `y0 = int(h * ${top} / 100)`,
            `y1 = h - int(h * ${bottom} / 100)`,
            `x0 = int(w * ${left} / 100)`,
            `x1 = w - int(w * ${right} / 100)`,
            "img = img[max(0, y0):max(y0 + 1, y1), max(0, x0):max(x0 + 1, x1)]",
        ].join("\n");
    },
    pad: (params) => {
        const top = Math.max(0, parseInt(params.top, 10) || 0);
        const bottom = Math.max(0, parseInt(params.bottom, 10) || 0);
        const left = Math.max(0, parseInt(params.left, 10) || 0);
        const right = Math.max(0, parseInt(params.right, 10) || 0);
        const modeMap = {
            constant: "cv2.BORDER_CONSTANT",
            reflect: "cv2.BORDER_REFLECT",
            replicate: "cv2.BORDER_REPLICATE",
        };
        const mode = modeMap[params.mode] || modeMap.constant;
        const color = Array.isArray(params.color) && params.color.length === 3 ? params.color : [0, 0, 0];

        return `img = cv2.copyMakeBorder(img, ${top}, ${bottom}, ${left}, ${right}, ${mode}, value=(${color.join(", ")}))`;
    },
    noise: (params) => {
        const amount = Number(params.amount) || 0.05;

        if (params.type === "salt_pepper") {
            return [
                "noisy = img.copy()",
                `amount = ${amount}`,
                "num_pixels = int(amount * img.shape[0] * img.shape[1])",
                "ys = np.random.randint(0, img.shape[0], num_pixels // 2)",
                "xs = np.random.randint(0, img.shape[1], num_pixels // 2)",
                "noisy[ys, xs] = 255",
                "ys = np.random.randint(0, img.shape[0], num_pixels // 2)",
                "xs = np.random.randint(0, img.shape[1], num_pixels // 2)",
                "noisy[ys, xs] = 0",
                "img = noisy",
            ].join("\n");
        }

        return [
            `sigma = ${amount} * 255`,
            "gauss = np.random.normal(0, sigma, img.shape).astype(np.float32)",
            "img = np.clip(img.astype(np.float32) + gauss, 0, 255).astype(np.uint8)",
        ].join("\n");
    },
};

function indent(code, spaces) {
    const pad = " ".repeat(spaces);
    return code
        .split("\n")
        .map((line) => pad + line)
        .join("\n");
}

// Custom steps are expected to point at a previously uploaded .py file that
// exposes `def process(img): -> img` (img is a cv2/numpy BGR array) — see
// utils/sandboxedPythonRunner.js's contract for uploaded scripts elsewhere
// in this codebase.
function buildStepBlock(step, index) {
    if (step.type === "custom") {
        return [
            `# Step ${index + 1}: custom script (id=${step.scriptId})`,
            `img = run_custom_script(${JSON.stringify(step.scriptPath || "")}, img)`,
        ].join("\n");
    }

    const template = BUILTIN_STEP_TEMPLATES[step.type];
    if (!template) {
        return `# Step ${index + 1}: unknown step type "${step.type}", skipped`;
    }

    return [`# Step ${index + 1}: ${step.type}`, template(step.params || {})].join("\n");
}

function generatePipelineScript(pipeline) {
    const enabledSteps = (pipeline || [])
        .filter((step) => step.enabled)
        .slice()
        .sort((a, b) => a.order - b.order);

    const stepBlocks = enabledSteps.map(buildStepBlock);

    return [
        "import os",
        "import sys",
        "import importlib.util",
        "import cv2",
        "import numpy as np",
        "",
        "",
        "def run_custom_script(script_path, img):",
        "    spec = importlib.util.spec_from_file_location('custom_step', script_path)",
        "    module = importlib.util.module_from_spec(spec)",
        "    spec.loader.exec_module(module)",
        "    return module.process(img)",
        "",
        "",
        "def process_image(img):",
        stepBlocks.length ? indent(stepBlocks.join("\n\n"), 4) : "    pass",
        "    return img",
        "",
        "",
        "def main(images_dir, output_dir):",
        "    os.makedirs(output_dir, exist_ok=True)",
        "    processed = 0",
        "    for name in sorted(os.listdir(images_dir)):",
        "        src_path = os.path.join(images_dir, name)",
        "        if not os.path.isfile(src_path):",
        "            continue",
        "        img = cv2.imread(src_path)",
        "        if img is None:",
        "            continue",
        "        img = process_image(img)",
        "        cv2.imwrite(os.path.join(output_dir, name), img)",
        "        processed += 1",
        "    print(processed)",
        "",
        "",
        "if __name__ == '__main__':",
        "    main(sys.argv[1], sys.argv[2])",
        "",
    ].join("\n");
}

module.exports = { generatePipelineScript, BUILTIN_STEP_TEMPLATES };
