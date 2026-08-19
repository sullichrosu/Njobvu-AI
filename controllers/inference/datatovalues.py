#!/usr/bin/python3
#########################################################
#  OSU Pipeline Tool
#
#  Copyright 2021
#
#  Ashwin Subramanian
#  John S. Koning
#  Christopher M. Sullivan
#
#  Department of Environmental and Molecular Toxicology
#  Department of Botany and Plant Pathology
#  Center for Genome Research and Biocomputing
#  United States Forest Serice
#  Department of Fish and Wildlife
#  Oregon State University
#  Corvallis, OR 97331
#
#  chris@cgrb.oregonstate.edu
#
# This program is not free software; you can not redistribute it and/or
# modify it at all.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
#
#########################################################

#########################################################
# Global Stuff						#
#########################################################
import os
import sys
import subprocess
import shutil
import argparse
import csv
import zipfile
import yaml
from pathlib import Path
from PIL import Image

#########################################################
# Call command function to run the code			#
#########################################################


def call_command(final_command, debug_mode=""):
    # """Wrapper for subprocess.check_output that implements error handling"""
    try:
        os.system(final_command)

    except subprocess.CalledProcessError as err:  # Return code was non-zero
        print("EXCEPTION!!!!")
        print("Error (Return Code {})".format(err.returncode))
        print("Command: {}".format(err.cmd))
        print("Output: {}".format(err.output))
        sys.exit(1)

#########################################################
# Parse YOLO labels for detection info 			#
#########################################################
def parse_yolo_labels(label_path: str, class_names: list[str], task: str = 'detect'):
    """Parse YOLO format label file & return detection info"""
    detections = []

    if not os.path.exists(label_path):
        return detections

    with open(label_path, "r") as f:
        for line in f:
            parts = line.strip().split()

            if len(parts) < 2:
                continue

            # ultralytics with save_conf=True:
            # detect: class x y w h conf
            # segment: class x1 y1 x2 y2 ... xn yn conf
            # obb: class x1 y1 x2 y2 x3 y3 x4 y4 conf
            # classify: conf class_name

            if task == 'classify' or (len(parts) == 2 and parts[0].replace('.', '', 1).isdigit()):
                try:
                    confidence = float(parts[0])
                except ValueError:
                    continue

                class_name = parts[1]
                class_id = class_names.index(class_name) if class_name in class_names else -1

                detections.append({
                    'class': class_name,
                    'class_id': class_id,
                    'confidence': confidence,
                    'bbox': ['', '', '', ''],
                    'x_pts': [],
                    'y_pts': []
                })
                continue

            try:
                class_id = int(parts[0])
            except ValueError:
                continue

            if task == 'detect':
                if len(parts) < 5: continue
                bbox = parts[1:5]
                confidence = float(parts[5]) if len(parts) > 5 else None
                x_pts = []
                y_pts = []
            elif task in ['segment', 'obb']:
                coords = parts[1:]
                # check if last element is confidence (float, and remaining coords are even)
                if len(coords) % 2 != 0:
                    confidence = float(coords[-1])
                    coords = coords[:-1]
                else:
                    confidence = None

                x_pts = coords[0::2]
                y_pts = coords[1::2]

                if not x_pts: continue

                # calculate bbox
                try:
                    fx = [float(x) for x in x_pts]
                    fy = [float(y) for y in y_pts]
                    min_x = min(fx)
                    max_x = max(fx)
                    min_y = min(fy)
                    max_y = max(fy)

                    width = max_x - min_x
                    height = max_y - min_y
                    x_center = min_x + width / 2
                    y_center = min_y + height / 2

                    bbox = [f"{x_center:.6f}", f"{y_center:.6f}", f"{width:.6f}", f"{height:.6f}"]
                except ValueError:
                    continue
            else:
                # fallback for other tasks
                if len(parts) < 5: continue
                bbox = parts[1:5]
                confidence = float(parts[5]) if len(parts) > 5 else None
                x_pts = []
                y_pts = []

            class_name = class_names[class_id] if class_id < len(class_names) else f"class_{class_id}"

            detections.append({
                'class': class_name,
                'class_id': class_id,
                'confidence': confidence,
                'bbox': bbox,
                'x_pts': x_pts,
                'y_pts': y_pts
            })

    return detections

def load_class_names(name_path):
    """Load class names from YAML or text file"""
    class_names = []

    try:
        if name_path.endswith('.yaml') or name_path.endswith('.yml'):
            with open(name_path, 'r') as f:
                data = yaml.safe_load(f)
                class_names = data.get('names', [])
        else:
            with open(name_path, 'r') as f:
                class_names = [line.strip() for line in f if line.strip()]
    except Exception as e:
        print(f"Warning: Could not load class names: {e}")

    return class_names


#########################################################
# Resolve/copy the pre-inference (raw) source image	#
#########################################################
def resolve_original_src(image_path: str, file_name: str):
    """Find the pre-inference source file that produced an Ultralytics output file.

    Ultralytics always saves predicted images with a `.jpg` extension (via
    `cv2.imwrite(save_path.with_suffix(".jpg"), im)`), even when the source
    file had a different extension such as `.png`, `.bmp`, or `.tif`. An
    exact filename match is tried first (covers `.jpg`/`.jpeg` sources, whose
    extension is unchanged), then a match by filename stem is used as a
    fallback so raw images with other extensions still resolve.
    """
    file_stem = os.path.splitext(file_name)[0]

    if os.path.isdir(image_path):
        exact_src = os.path.join(image_path, file_name)
        if os.path.exists(exact_src):
            return exact_src

        for candidate in os.listdir(image_path):
            candidate_path = os.path.join(image_path, candidate)
            if os.path.isfile(candidate_path) and os.path.splitext(candidate)[0] == file_stem:
                return candidate_path
    elif os.path.isfile(image_path):
        base_name = os.path.basename(image_path)
        if base_name == file_name or os.path.splitext(base_name)[0] == file_stem:
            return image_path

    return None


def copy_raw_image(original_src: str, dest_path: str):
    """Copy the raw source image to dest_path.

    If the destination extension differs from the source's (because
    Ultralytics renamed the output to `.jpg`), the image is re-encoded so the
    file's content actually matches its extension instead of copying
    mismatched bytes under the wrong name.
    """
    src_ext = os.path.splitext(original_src)[1].lower()
    dest_ext = os.path.splitext(dest_path)[1].lower()

    if src_ext == dest_ext:
        shutil.copy2(original_src, dest_path)
    else:
        with Image.open(original_src) as im:
            im.convert("RGB").save(dest_path, "JPEG")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run YOLO predictions with Ultralytics"
    )
    parser.add_argument("-d", "--data_path",    required=True,
                        help="Path to data folder")
    parser.add_argument("-i", "--image_path",
                        required=True, help="Path to images")
    parser.add_argument("-n", "--name_path",    required=True,
                        help="Path to classes file")
    parser.add_argument("-l", "--log",          required=True,
                        help="Log file path")
    parser.add_argument("-f", "--darknet_folder", required=True,
                        help="Darknet/Ultralytics path")
    parser.add_argument("-w", "--weight_path",  required=True,
                        help="Model weights file")
    parser.add_argument("-D", "--device",       default="cpu",
                        help="Device (cpu, cuda:0, mps, etc.)")
    parser.add_argument("-o", "--adv_options",  default="",
                        help="Advanced YOLO options")
    parser.add_argument("-t", "--task",         required=True, choices=["detect", "segment", "classify", "pose", "obb"],
                        help="YOLO task to run")
    parser.add_argument("-m", "--mode", default="predict", choices=["predict", "track"],
                        help="YOLO mode to run")
    args = parser.parse_args()

    data_path = args.data_path
    image_path = args.image_path
    name_path = args.name_path
    log_file = args.log
    darknet_path = args.darknet_folder
    weight_path = args.weight_path
    device = args.device
    adv_options = args.adv_options
    yolo_task = args.task
    yolo_mode = args.mode

    #########################################################
    # Main body of program with checks for options		#
    #########################################################
    if data_path == "":
        err = "You need more options to run the tool"
        print(err)

    if image_path == "":
        err = "You need more options to run the tool"
        print(err)

    print("Ultralytics Version of YOLO Requested:")

    # Command to start running ultralytics using the training files
    # cmd = darknet_path + " detect predict data=" + name_path + " project=" + data_path + " epochs=" + epochs + " imgsz=" + imgsz + " device=" + device + " model=" + weight_path + " " + adv_options + " 2>&1 > " + log_file
    # yolo predict model=/Users/sullichr/Njobvu-AI/Njobvu-AI-tankit03/Njobvu-AI/public/projects/bennyb-ZebFish/training/logs/1735510402147/train/weights/best.pt source='https://speakingofresearch.com/wp-content/uploads/2011/02/zebrafish.jpg' device=mps
    cmd = (
        darknet_path
        + f" {yolo_task}"
        + f" {yolo_mode}"
        + " model="
        + weight_path
        + " source="
        + image_path
        + " project="
        + data_path
        + " name=output device="
        + device
        + " save_txt=True save_conf=True"
        + " "
        + adv_options
        + " 2>&1 >> "
        + log_file
    )

    print(cmd)

    # process_code,process_output,process_err,process_mix = call_command(cmd)
    call_command(cmd)

    destination_dir = data_path
    source_dir = os.path.join(data_path, "output")

    # create a directory for original images
    raw_images_dir = os.path.join(destination_dir, "raw")
    os.makedirs(raw_images_dir, exist_ok=True)

    files = os.listdir(source_dir) if os.path.exists(source_dir) else []
    for file_name in files:
        source_path = os.path.join(source_dir, file_name)
        destination_path = os.path.join(destination_dir, file_name)

        shutil.move(source_path, destination_path)

        if file_name.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp')):
            original_src = resolve_original_src(image_path, file_name)

            if original_src:
                try:
                    copy_raw_image(original_src, os.path.join(raw_images_dir, file_name))
                except Exception as e:
                    print(f"Warning: could not copy raw image {file_name}: {e}")

    class_names = load_class_names(name_path)

    print(class_names)

    image_files = [f for f in files if f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))]

    csv_path = os.path.join(destination_dir, 'inference_stats.csv')
    detailed_csv_path = os.path.join(destination_dir, 'inference_detections.csv')

    with open(csv_path, 'w', newline='') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['Image Name', 'File Size (KB)', 'Detection Count', 'Avg Confidence', 'Max Confidence', 'Min Confidence'])

        with open(detailed_csv_path, 'w', newline='') as detail_csvfile:
            detail_writer = csv.writer(detail_csvfile)
            detail_writer.writerow(['Image Name', 'Detection #', 'Class', 'Class ID', 'Confidence', 'X Center', 'Y Center', 'Width', 'Height', 'X Points', 'Y Points'])

            for img_file in image_files:
                img_path = os.path.join(destination_dir, img_file)

                if not os.path.exists(img_path):
                    continue

                file_size = os.path.getsize(img_path) / 1024 # KB

                label_file = os.path.splitext(img_file)[0] + '.txt'
                label_path = os.path.join(destination_dir, 'labels', label_file)

                detections = parse_yolo_labels(label_path, class_names, yolo_task)
                detection_count = len(detections)

                confidences = [d['confidence'] for d in detections if d['confidence'] is not None]

                avg_conf = sum(confidences) / len(confidences) if confidences else 0
                max_conf = max(confidences) if confidences else 0
                min_conf = min(confidences) if confidences else 0

                writer.writerow([
                    img_file,
                    f'{file_size:.2f}',
                    detection_count,
                    f'{avg_conf:.4f}' if avg_conf > 0 else 'N/A',
                    f'{max_conf:.4f}' if max_conf > 0 else 'N/A',
                    f'{min_conf:.4f}' if min_conf > 0 else 'N/A'
                ])

                for idx, det in enumerate(detections, 1):
                    detail_writer.writerow([
                        img_file,
                        idx,
                        det['class'],
                        det['class_id'],
                        f"{det['confidence']:.4f}" if det['confidence'] else 'N/A',
                        det['bbox'][0],
                        det['bbox'][1],
                        det['bbox'][2],
                        det['bbox'][3],
                        ",".join(det['x_pts']),
                        ",".join(det['y_pts'])
                    ])

    zip_path = os.path.join(destination_dir, 'inference_images.zip')
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_name in image_files:
            file_path = os.path.join(destination_dir, file_name)

            if os.path.isfile(file_path):
                zipf.write(file_path, arcname=file_name)

        zipf.write(csv_path, arcname="inference_stats.csv")
        zipf.write(detailed_csv_path, arcname="inference_detections.csv")

    print(f"Created zip archive: {zip_path}")
    print(f"Created statistics CSV: {csv_path}")
    print(f"Created detailed detections CSV: {detailed_csv_path}")

    print("Cleaning up...")
    moved_count = 0

    images_path = os.path.join(destination_dir, "images")

    try:
        os.mkdir(images_path)
    except FileExistsError:
        print("Could not create the output directory because it already exists.")
    except FileNotFoundError:
        print("Parent directory does not exist.")
    except OSError as e:
        print(f"An OS error occurred: {e}")

    for img_file in image_files:
        img_path = os.path.join(destination_dir, img_file)

        if not os.path.isfile(img_path):
            continue

        try:
            os.rename(img_path, os.path.join(images_path, img_path.split("/")[-1]))
            moved_count += 1
        except Exception as e:
            print(f"Warning: could not delete {img_file}: {e}")

    print(f"Moved {moved_count} image files from output directory into a clean directory")

    labels_dir = os.path.join(destination_dir, 'labels')

    if os.path.exists(labels_dir) and os.path.isdir(labels_dir):
        try:
            shutil.rmtree(labels_dir)
            print("Deleted labels directory")
        except Exception as e:
            print(f"Warning: Could not delete labels directory: {e}")
