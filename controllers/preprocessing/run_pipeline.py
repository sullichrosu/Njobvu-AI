#!/usr/bin/env python3
"""Runs a pre-processing pipeline (OpenCV) against every image in a project.

Invoked by routes/api/v2/preprocessing.js's /apply endpoint as:

    python run_pipeline.py --images <dir> --manifest <manifest.json> --output <dir>

The manifest is `{"steps": [{"type", "order", "params", "scriptPath"?}]}` -
already filtered to enabled steps and sorted by order. Custom steps point at
an uploaded script that exposes `def process(img): -> img` (img is a
cv2/numpy BGR array), loaded dynamically via importlib.
"""
import argparse
import importlib.util
import json
import os
import sys

import cv2
import numpy as np


def apply_illumination_normalization(img, params):
    method = params.get("method", "clahe")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    if method == "histogram_equalization":
        normalized = cv2.equalizeHist(gray)
    else:
        clip_limit = float(params.get("clipLimit", 2.0))
        tile_grid_size = max(1, int(params.get("tileGridSize", 8)))
        clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile_grid_size, tile_grid_size))
        normalized = clahe.apply(gray)

    return cv2.cvtColor(normalized, cv2.COLOR_GRAY2BGR)


INTERPOLATIONS = {
    "linear": cv2.INTER_LINEAR,
    "nearest": cv2.INTER_NEAREST,
    "cubic": cv2.INTER_CUBIC,
}


def apply_resize(img, params):
    width = max(1, int(params.get("width", 640)))
    height = max(1, int(params.get("height", 640)))
    interpolation = INTERPOLATIONS.get(params.get("interpolation"), cv2.INTER_LINEAR)

    if params.get("keepAspectRatio"):
        h, w = img.shape[:2]
        scale = min(width / w, height / h)
        target = (max(1, int(w * scale)), max(1, int(h * scale)))
        return cv2.resize(img, target, interpolation=interpolation)

    return cv2.resize(img, (width, height), interpolation=interpolation)


def apply_rotate(img, params):
    angle = float(params.get("angle", 0))
    h, w = img.shape[:2]
    center = (w / 2, h / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)

    if params.get("expand"):
        cos = abs(matrix[0, 0])
        sin = abs(matrix[0, 1])
        new_w = int((h * sin) + (w * cos))
        new_h = int((h * cos) + (w * sin))
        matrix[0, 2] += (new_w / 2) - center[0]
        matrix[1, 2] += (new_h / 2) - center[1]
        return cv2.warpAffine(img, matrix, (new_w, new_h))

    return cv2.warpAffine(img, matrix, (w, h))


def apply_crop(img, params):
    top = float(params.get("top", 0))
    bottom = float(params.get("bottom", 0))
    left = float(params.get("left", 0))
    right = float(params.get("right", 0))
    h, w = img.shape[:2]

    y0 = int(h * top / 100)
    y1 = h - int(h * bottom / 100)
    x0 = int(w * left / 100)
    x1 = w - int(w * right / 100)

    y0, y1 = max(0, y0), max(y0 + 1, y1)
    x0, x1 = max(0, x0), max(x0 + 1, x1)

    return img[y0:y1, x0:x1]


PAD_MODES = {
    "constant": cv2.BORDER_CONSTANT,
    "reflect": cv2.BORDER_REFLECT,
    "replicate": cv2.BORDER_REPLICATE,
}


def hex_to_bgr(value):
    """Parses the UI's `<input type="color">` value ("#rrggbb") into a
    cv2-ordered (B, G, R) tuple. Falls back to black for anything else
    (an [r, g, b] array, missing/malformed input, etc.)."""
    if isinstance(value, str) and len(value) == 7 and value.startswith("#"):
        r = int(value[1:3], 16)
        g = int(value[3:5], 16)
        b = int(value[5:7], 16)
        return (b, g, r)

    if isinstance(value, (list, tuple)) and len(value) == 3:
        return tuple(value)

    return (0, 0, 0)


def apply_pad(img, params):
    top = max(0, int(params.get("top", 0)))
    bottom = max(0, int(params.get("bottom", 0)))
    left = max(0, int(params.get("left", 0)))
    right = max(0, int(params.get("right", 0)))
    mode = PAD_MODES.get(params.get("mode"), cv2.BORDER_CONSTANT)
    color = hex_to_bgr(params.get("color"))

    return cv2.copyMakeBorder(img, top, bottom, left, right, mode, value=color)


def apply_noise(img, params):
    amount = float(params.get("amount", 0.05))

    if params.get("type") == "salt_pepper":
        noisy = img.copy()
        num_pixels = int(amount * img.shape[0] * img.shape[1])

        ys = np.random.randint(0, img.shape[0], num_pixels // 2)
        xs = np.random.randint(0, img.shape[1], num_pixels // 2)
        noisy[ys, xs] = 255

        ys = np.random.randint(0, img.shape[0], num_pixels // 2)
        xs = np.random.randint(0, img.shape[1], num_pixels // 2)
        noisy[ys, xs] = 0

        return noisy

    sigma = amount * 255
    gauss = np.random.normal(0, sigma, img.shape).astype(np.float32)
    return np.clip(img.astype(np.float32) + gauss, 0, 255).astype(np.uint8)


BUILTIN_STEPS = {
    "illumination_normalization": apply_illumination_normalization,
    "resize": apply_resize,
    "rotate": apply_rotate,
    "crop": apply_crop,
    "pad": apply_pad,
    "noise": apply_noise,
}


def run_custom_script(script_path, img):
    spec = importlib.util.spec_from_file_location("custom_step", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.process(img)


def process_image(img, steps):
    for step in steps:
        step_type = step.get("type")

        if step_type == "custom":
            script_path = step.get("scriptPath")
            if script_path:
                img = run_custom_script(script_path, img)
            continue

        handler = BUILTIN_STEPS.get(step_type)
        if handler:
            img = handler(img, step.get("params") or {})

    return img


def main():
    parser = argparse.ArgumentParser(description="Apply a pre-processing pipeline to a project's images.")
    parser.add_argument("--images", required=True, help="Directory of source images")
    parser.add_argument("--manifest", required=True, help="Pipeline manifest JSON path")
    parser.add_argument("--output", required=True, help="Directory to write processed images to")
    args = parser.parse_args()

    with open(args.manifest, "r") as manifest_file:
        manifest = json.load(manifest_file)

    steps = sorted(manifest.get("steps", []), key=lambda step: step.get("order", 0))

    os.makedirs(args.output, exist_ok=True)

    processed = 0
    for name in sorted(os.listdir(args.images)):
        src_path = os.path.join(args.images, name)
        if not os.path.isfile(src_path):
            continue

        img = cv2.imread(src_path)
        if img is None:
            continue

        img = process_image(img, steps)
        cv2.imwrite(os.path.join(args.output, name), img)
        processed += 1

    print(f"Processed {processed} image(s)")


if __name__ == "__main__":
    main()
