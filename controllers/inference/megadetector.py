#!/usr/bin/python3
#########################################################
#  MegaDetector Inference Script
#
#  Runs Microsoft's MegaDetector (camera trap animal
#  detector) on an image, a folder of images, or a video.
#
#  Requires the `megadetector` python package:
#      pip install megadetector
#
#########################################################
import os
import sys
import csv
import json
import shutil
import argparse
import subprocess
import tempfile
import zipfile
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

parser = argparse.ArgumentParser(
    description="Run inference using Microsoft MegaDetector"
)
parser.add_argument("-i", "--image_path", required=True,
                    help="Path to an image, a folder of images, or a video file")
parser.add_argument("-m", "--model", default="MDV5A",
                    help="MegaDetector model name (e.g. MDV5A, MDV5B, "
                         "MDv1000-redwood) or path to a .pt/.pb model file")
parser.add_argument("-o", "--output_path", required=True,
                    help="Output directory")
parser.add_argument("-t", "--threshold", type=float, default=0.2,
                    help="Confidence threshold (0.0 to 1.0)")
parser.add_argument("-f", "--fps", type=float, default=1.0,
                    help="Frames per second to sample when input is a video")
args = parser.parse_args()

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".gif")
VIDEO_EXTENSIONS = (".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v")

# MegaDetector category colors for rendering
CATEGORY_COLORS = {
    "1": (0, 200, 0),      # animal  -> green
    "2": (220, 40, 40),    # person  -> red
    "3": (40, 80, 220),    # vehicle -> blue
}

CATEGORY_NAMES = {
    "1": "animal",
    "2": "person",
    "3": "vehicle",
}


def is_video(path):
    return path.lower().endswith(VIDEO_EXTENSIONS)


def is_image(path):
    return path.lower().endswith(IMAGE_EXTENSIONS)


def extract_frames(video_path, output_dir, fps):
    """Extract frames from a video using ffmpeg, fall back to cv2."""
    os.makedirs(output_dir, exist_ok=True)

    frame_pattern = os.path.join(output_dir, "frame_%06d.jpg")

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        cmd = [
            ffmpeg, "-y", "-i", video_path,
            "-vf", f"fps={fps}",
            "-qscale:v", "2", frame_pattern,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return True

        print(f"ffmpeg failed ({result.stderr.strip()}); trying cv2 fallback...")

    try:
        import cv2
    except ImportError:
        print("Error: could not extract frames. Install ffmpeg or opencv-python (cv2).")
        sys.exit(1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print("Error: could not open video file.")
        sys.exit(1)

    frame_rate = cap.get(cv2.CAP_PROP_FPS) or fps
    interval = max(1, int(round(frame_rate / fps)))
    count = 0
    saved = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if count % interval == 0:
            out_path = os.path.join(output_dir, f"frame_{saved + 1:06d}.jpg")
            cv2.imwrite(out_path, frame)
            saved += 1
        count += 1

    cap.release()
    return saved > 0


def render_annotations(result, image_dir, output_dir, raw_dir):
    """Draw bounding boxes onto images and save annotated copies."""
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(raw_dir, exist_ok=True)

    rendered = []

    for img in result.get("images", []):
        rel_path = img.get("file", "")
        src_path = rel_path if os.path.isabs(rel_path) else os.path.join(image_dir, rel_path)

        if not os.path.exists(src_path):
            print(f"Warning: source image not found: {src_path}")
            continue

        base_name = os.path.basename(src_path)
        if not is_image(base_name):
            continue

        try:
            pil_img = Image.open(src_path).convert("RGB")
        except Exception as e:
            print(f"Warning: could not open image {src_path}: {e}")
            continue

        draw = ImageDraw.Draw(pil_img)
        w, h = pil_img.size

        for det in img.get("detections", []):
            conf = det.get("conf", 0.0)
            if conf < args.threshold:
                continue

            category = str(det.get("category", "1"))
            bbox = det.get("bbox", [0, 0, 0, 0])

            if len(bbox) != 4:
                continue

            x1 = int(bbox[0] * w)
            y1 = int(bbox[1] * h)
            box_w = int(bbox[2] * w)
            box_h = int(bbox[3] * h)
            x2 = x1 + box_w
            y2 = y1 + box_h

            color = CATEGORY_COLORS.get(category, (255, 255, 0))
            label = f"{CATEGORY_NAMES.get(category, 'unknown')} {conf:.2f}"

            draw.rectangle([x1, y1, x2, y2], outline=color, width=max(2, int(w / 400)))
            draw.rectangle([x1, y1 - 18, x1 + 110, y1], fill=color)
            draw.text((x1 + 4, y1 - 17), label, fill=(0, 0, 0))

        annotated_path = os.path.join(output_dir, base_name)
        pil_img.save(annotated_path)

        try:
            shutil.copy2(src_path, os.path.join(raw_dir, base_name))
        except Exception as e:
            print(f"Warning: could not copy raw image {base_name}: {e}")

        rendered.append(base_name)

    return rendered


def write_csvs(result, image_dir, output_dir):
    """Write stats + detections CSVs, matching the app's expected format."""
    stats_csv = os.path.join(output_dir, "inference_stats.csv")
    detail_csv = os.path.join(output_dir, "inference_detections.csv")

    with open(stats_csv, "w", newline="") as stats_file, \
         open(detail_csv, "w", newline="") as detail_file:

        stats_writer = csv.writer(stats_file)
        detail_writer = csv.writer(detail_file)

        stats_writer.writerow(["Image Name", "File Size (KB)", "Detection Count",
                               "Avg Confidence", "Max Confidence", "Min Confidence"])
        detail_writer.writerow(["Image Name", "Detection #", "Class", "Class ID",
                                "Confidence", "X Center", "Y Center", "Width", "Height",
                                "X Points", "Y Points"])

        for img in result.get("images", []):
            rel_path = img.get("file", "")
            src_path = rel_path if os.path.isabs(rel_path) else os.path.join(image_dir, rel_path)

            if not os.path.exists(src_path):
                continue

            base_name = os.path.basename(src_path)
            if not is_image(base_name):
                continue

            file_size = os.path.getsize(src_path) / 1024.0
            detections = [
                d for d in img.get("detections", [])
                if d.get("conf", 0.0) >= args.threshold
            ]

            confs = [float(d["conf"]) for d in detections if "conf" in d]
            avg_conf = sum(confs) / len(confs) if confs else 0
            max_conf = max(confs) if confs else 0
            min_conf = min(confs) if confs else 0

            stats_writer.writerow([
                base_name,
                f"{file_size:.2f}",
                len(detections),
                f"{avg_conf:.4f}" if confs else "N/A",
                f"{max_conf:.4f}" if confs else "N/A",
                f"{min_conf:.4f}" if confs else "N/A",
            ])

            for idx, det in enumerate(detections, 1):
                category = str(det.get("category", "1"))
                bbox = det.get("bbox", [0, 0, 0, 0])

                if len(bbox) != 4:
                    bbox = [0, 0, 0, 0]

                x_center = bbox[0] + bbox[2] / 2
                y_center = bbox[1] + bbox[3] / 2

                detail_writer.writerow([
                    base_name,
                    idx,
                    CATEGORY_NAMES.get(category, f"class_{category}"),
                    category,
                    f"{float(det.get('conf', 0)):.4f}",
                    f"{x_center:.6f}",
                    f"{y_center:.6f}",
                    f"{bbox[2]:.6f}",
                    f"{bbox[3]:.6f}",
                    "",
                    "",
                ])

    return stats_csv, detail_csv


# ---------------------------------------------------
# Main
# ---------------------------------------------------
os.makedirs(args.output_path, exist_ok=True)

input_path = args.image_path
temp_dir = None
image_dir = input_path

if os.path.isdir(input_path):
    image_dir = input_path
elif is_video(input_path):
    if not os.path.exists(input_path):
        print(f"Error: input video not found: {input_path}")
        sys.exit(1)
    temp_dir = tempfile.mkdtemp(prefix="megadetector_frames_")
    image_dir = os.path.join(temp_dir, "frames")
    print(f"Extracting frames from video at {args.fps} fps...")
    extract_frames(input_path, image_dir, args.fps)
    print(f"Frames extracted to {image_dir}")
elif is_image(input_path):
    if not os.path.exists(input_path):
        print(f"Error: input image not found: {input_path}")
        sys.exit(1)
    temp_dir = tempfile.mkdtemp(prefix="megadetector_single_")
    image_dir = os.path.join(temp_dir, "single")
    os.makedirs(image_dir, exist_ok=True)
    shutil.copy2(input_path, os.path.join(image_dir, os.path.basename(input_path)))
else:
    print(f"Error: unsupported input type: {input_path}")
    sys.exit(1)

images_found = [
    f for f in os.listdir(image_dir) if is_image(f)
]
if len(images_found) == 0:
    print(f"Error: no images found in input {input_path}")
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)
    sys.exit(1)

print(f"Found {len(images_found)} images to process.")

output_json = os.path.join(args.output_path, "inference_results.json")

cmd = [
    sys.executable,
    "-m", "megadetector.detection.run_detector_batch",
    args.model,
    image_dir,
    output_json,
    "--output_relative_filenames",
    "--recursive",
    "--threshold", str(args.threshold),
]

print("Running MegaDetector...")
print(" ".join(cmd))

result = subprocess.run(cmd, capture_output=True, text=True)
print(result.stdout)

if result.returncode != 0:
    print("MegaDetector failed with the following error:")
    print(result.stderr)
    if temp_dir:
        shutil.rmtree(temp_dir, ignore_errors=True)
    sys.exit(1)

with open(output_json, "r") as f:
    detector_results = json.load(f)

# Save a human-readable copy of the results JSON
pretty_json = os.path.join(args.output_path, "inference_results.json")
with open(pretty_json, "w") as f:
    json.dump(detector_results, f, indent=2)

# Render annotated images
annotated_dir = os.path.join(args.output_path, "images")
raw_dir = os.path.join(args.output_path, "raw")
rendered = render_annotations(detector_results, image_dir, annotated_dir, raw_dir)
print(f"Rendered {len(rendered)} annotated images.")

# Write CSVs
stats_csv, detail_csv = write_csvs(detector_results, image_dir, args.output_path)
print(f"Created statistics CSV: {stats_csv}")
print(f"Created detections CSV: {detail_csv}")

# Zip results
zip_path = os.path.join(args.output_path, "inference_results.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    if os.path.exists(pretty_json):
        zipf.write(pretty_json, arcname="inference_results.json")
    zipf.write(stats_csv, arcname="inference_stats.csv")
    zipf.write(detail_csv, arcname="inference_detections.csv")
    for file_name in rendered:
        file_path = os.path.join(annotated_dir, file_name)
        if os.path.isfile(file_path):
            zipf.write(file_path, arcname=os.path.join("images", file_name))

print(f"Created zip archive: {zip_path}")
print("Inference complete.")

if temp_dir:
    shutil.rmtree(temp_dir, ignore_errors=True)
