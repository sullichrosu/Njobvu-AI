import sys
print("Python executable:", sys.executable);
import os
from ultralytics import YOLO
from PIL import Image
import subprocess
import shutil
import json
import yaml
import sqlite3
#classes need to be of form X_Y or X or X_y_z or X-y X-y-z if there are spaces in the class name it will give errors

runs = ''
input_dir = ''
output = ''
weights_file = ''
classification_dir = ''
db_name = ''


def help():
    print('\t\tUpload CLASSIFICATION dataset')
    print('\t\texample run for classification [import_options.py -i input_dir -o output -r class]')
    print('\t\tinput should be a directory of sub directories used for classification\n')

    print('\t\tClassify + predict')
    print('\t\texample run for classification [import_options.py -i input_dir -o output -w weights_file -r ci]')
    print('\t\tinput should be a directory of sub directories used for classification\n')

    print('\t\tDetect + predict')
    print('\t\tExample run for inference [import_options.py -i input_dir -o output -w weights_file.pt -r inf]')
    print('\t\tinput should be a directory of images used for inference and the weights file should be the weights file related to your project')

def classification_plus_import(db_name, input_dir, output):
    # this function expects input_dir to be a directory of class-subdirectories.
    # it handles an optional single container directory.

    dir_to_process = input_dir
    try:
        items = os.listdir(input_dir)
        # if the input dir has only one item and it's a directory, assume it's a container and step into it.
        if len(items) == 1 and os.path.isdir(os.path.join(input_dir, items[0])):
            print(f"Found single container directory, stepping into: {items[0]}")
            dir_to_process = os.path.join(input_dir, items[0])
    except FileNotFoundError:
        print(f"FATAL: The specified import directory was not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    project_path = output
    images_path = os.path.join(output, 'images')

    # ensure images directory exists
    if not os.path.exists(images_path):
        os.makedirs(images_path)

    # create labels.txt in the project directory
    labels_path = os.path.join(output, 'labels.txt')
    with open(labels_path, 'w') as f:
        # for each directory of imgs under a class, we are going to get each img, open it get all the data and write that too labels file
        if os.path.exists(dir_to_process):
            for directory in os.listdir(dir_to_process):
                dir_path = os.path.join(dir_to_process, directory)

                if os.path.isdir(dir_path):
                    class_name = directory.replace(' ', '_')
                    for img in os.listdir(dir_path):
                        input_image_path = os.path.join(dir_path, img)

                        if os.path.isfile(input_image_path):
                            img_to_open = Image.open(input_image_path)
                            width, height = img_to_open.size
                            x = 0
                            y = 0
                            new_img_name = f"{class_name}_{img}"
                            f.write(f"{class_name} {x} {y} {width} {height} {new_img_name}\n")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    import_nj_script = os.path.join(script_dir, "importNJ.py")

    # update command to use the new labels path
    command = [
        'python3', 
        import_nj_script, 
        '-n', 'new', 
        '-i', dir_to_process, 
        '-t', labels_path, 
        '-p', project_path, 
        '-z', project_path, 
        '-C', 'yes', 
        '-d', db_name
    ]

    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)

        print(result.stdout)

        if result.stderr:
            print(f"importNJ.py stderr:\n{result.stderr}", file=sys.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Error executing importNJ.py. Return code: {e.returncode}", file=sys.stderr)
        print(f"Stdout: {e.stdout}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)

        sys.exit(1)


def inference_into_classification(db_name, input_dir, output, weights_file, classification_dir):
    print("\n--- Starting Inference into Classification ---")
    print(f"Input directory: {input_dir}")
    print(f"Weights file: {weights_file}")
    print(f"Output project path: {output}")
    print(f"Temporary classification directory: {classification_dir}")

    try:
        model = YOLO(weights_file)
        class_names = model.names
        print(f"Model loaded successfully. Class names: {class_names}")
    except Exception as e:
        print(f"FATAL: Error loading YOLO model: {e}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(classification_dir):
        os.makedirs(classification_dir)

    total_images_processed = 0
    total_detections = 0

    # recursively find all image files in the input directory
    image_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith(('.png', '.jpeg', '.jpg', '.tif')):
                image_files.append(os.path.join(root, file))

    if not image_files:
        print(f"FATAL: No image files found in {input_dir} or its subdirectories.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(image_files)} images to process in {input_dir} and its subdirectories.")

    for img_path in image_files:
        print(f"\nProcessing image: {img_path}")

        total_images_processed += 1
        try:
            # setting a low confidence threshold to maximize detections
            results = model(img_path, conf=0.1)

            img_detections = 0
            for result in results:
                for box in result.boxes:
                    img_detections += 1
                    total_detections += 1
                    x1, y1, x2, y2 = box.xyxy.tolist()[0]
                    x2 = x2 - x1
                    y2 = y2 - y1
                    class_id = int(box.cls.item())

                    class_name = class_names.get(class_id, "unknown_class").replace(' ', '_')
                    print(f"  - Detection! Class: '{class_name}'. Saving cropped image.")

                    img_obj = Image.open(img_path)

                    cropped_img = img_obj.crop((x1, y1, x1 + x2, y1 + y2))

                    cropped_img_name = os.path.basename(img_path).replace('.jpg', f'_{int(x1)}_{class_name}.jpg')

                    class_dir = os.path.join(classification_dir, class_name)
                    if not os.path.exists(class_dir):
                        os.makedirs(class_dir)

                    cropped_img_path = os.path.join(class_dir, cropped_img_name)
                    cropped_img.save(cropped_img_path)

            if img_detections == 0:
                print("  - No detections in this image.")

        except Exception as e:
            print(f"An error occurred during inference for {img_path}: {e}", file=sys.stderr)

    print("\n--- Inference Summary ---")
    print(f"Total images processed: {total_images_processed}")
    print(f"Total detections: {total_detections}")

    import_source_dir = ''
    if total_detections > 0:
        print("Detections found. Importing cropped images from temporary directory.")
        import_source_dir = classification_dir
    else:
        print("WARNING: No objects were detected. Importing original images into an 'unclassified' category.")

        # create a new temporary directory for the original images that fits the expected structure
        unclassified_import_dir = os.path.join(os.path.dirname(classification_dir), "unclassified_import")
        unclassified_subdir = os.path.join(unclassified_import_dir, "unclassified")
        os.makedirs(unclassified_subdir, exist_ok=True)

        # copy original images from their full source paths to the new structure
        for src_path in image_files:
            shutil.copy(src_path, os.path.join(unclassified_subdir, os.path.basename(src_path)))

        import_source_dir = unclassified_import_dir

    classification_plus_import(db_name, import_source_dir, output)

def inference_plus_import(input_dir, output, weights_file):
    model = YOLO(weights_file)

    with open('labels.txt', "w") as f:
        for img in os.listdir(input_dir):
            if img.lower().endswith(('.png','.jpeg','.jpg','.tif')):
                img_path = os.path.join(input_dir,img)
                results = model(img_path)
                for result in results:
                    for box in result.boxes:
                        x1, y1, x2, y2 = box.xyxy.tolist()[0]
                        # scale the box info to work for NJ input
                        x2 = x2 - x1
                        y2 = y2 - y1
                        class_id = int(box.cls.item())
                        f.write(f"{class_id} {x1} {y1} {x2} {y2} {img}\n")

    f.close()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    import_nj_script = os.path.join(script_dir, "importNJ.py")
    command = [
        'python3', 
        import_nj_script, 
        '-n', 'new', 
        '-i', input_dir, 
        '-t', 'labels.txt', 
        '-p', output, 
        '-z', output
    ]

    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        print(result.stdout)
        if result.stderr:
            print(f"importNJ.py stderr:\n{result.stderr}", file=sys.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Error executing importNJ.py. Return code: {e.returncode}", file=sys.stderr)
        print(f"Stdout: {e.stdout}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        sys.exit(1)

def yolo_archive_import(db_name, input_dir, output, weights_file=None):
    print("\n--- Starting YOLO Archive Import ---")
    print(f"Input directory: {input_dir}")
    print(f"Output project path: {output}")
    print(f"Database name: {db_name}")

    # 1. search recursively for any yaml file to extract class names
    yaml_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith(('.yaml', '.yml')):
                yaml_files.append(os.path.join(root, file))

    class_names = {}
    if yaml_files:
        for yf in sorted(yaml_files):
            try:
                with open(yf, 'r') as f:
                    data = yaml.safe_load(f)

                    if isinstance(data, dict) and 'names' in data:
                        names = data['names']

                        if isinstance(names, dict):
                            class_names = {int(k): str(v).replace(' ', '_') for k, v in names.items()}
                            print(f"Parsed class names from {yf}: {class_names}")

                            break
                        elif isinstance(names, list):
                            class_names = {i: str(v).replace(' ', '_') for i, v in enumerate(names)}
                            print(f"Parsed class names from {yf}: {class_names}")

                            break
            except Exception as e:
                print(f"Warning: Failed to parse yaml {yf}: {e}")

    # fallback to classes.txt if found
    if not class_names:
        for root, dirs, files in os.walk(input_dir):
            for file in files:
                if file.lower() == 'classes.txt':
                    try:
                        with open(os.path.join(root, file), 'r') as f:
                            lines = [line.strip().replace(' ', '_') for line in f if line.strip()]
                            class_names = {i: name for i, name in enumerate(lines)}
                            print(f"Parsed class names from classes.txt: {class_names}")
                            break
                    except Exception as e:
                        print(f"Warning: Failed to parse classes.txt: {e}")
            if class_names:
                break

    # 2. search recursively for any .pt or other weights files and copy them to training/weights/
    weights_path = os.path.join(output, 'training', 'weights')
    os.makedirs(weights_path, exist_ok=True)

    if weights_file and os.path.exists(weights_file):
        shutil.copy(weights_file, os.path.join(weights_path, os.path.basename(weights_file)))

        print(f"Copied uploaded weights file: {weights_file} -> {weights_path}")

    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith(('.pt', '.weights')):
                src = os.path.join(root, file)

                if not (weights_file and os.path.abspath(src) == os.path.abspath(weights_file)):
                    dst = os.path.join(weights_path, file)
                    shutil.copy(src, dst)

                    print(f"Found model file in archive: {src} -> {dst}")

    # 3. create sqlite3 database
    db_file_path = os.path.join(output, f'{db_name}.db')
    conn = sqlite3.connect(db_file_path)
    cursor = conn.cursor()

    cursor.execute("CREATE TABLE IF NOT EXISTS Classes (CName VARCHAR NOT NULL PRIMARY KEY)")
    cursor.execute("CREATE TABLE IF NOT EXISTS Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0, validateImage INTEGER NOT NULL DEFAULT 0)")
    cursor.execute("CREATE TABLE IF NOT EXISTS Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X VARCHAR NOT NULL, Y VARCHAR NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName))")
    cursor.execute("CREATE TABLE IF NOT EXISTS Validation (Confidence INTEGER NOT NULL, LID INTEGER NOT NULL PRIMARY KEY, CName VARCHAR NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(LID) REFERENCES Labels(LID), FOREIGN KEY(IName) REFERENCES Images(IName), FOREIGN KEY(CName) REFERENCES Classes(CName))")

    conn.commit()

    # 4. find all images recursively, copy them, and parse labels
    image_exts = ('.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff')
    images_path = os.path.join(output, 'images')
    os.makedirs(images_path, exist_ok=True)

    inserted_classes = set()
    label_id = 1

    for root, dirs, files in os.walk(input_dir):
        if '__MACOSX' in root or 'training/weights' in root:
            continue

        for file in files:
            if file.lower().endswith(image_exts):
                image_path = os.path.join(root, file)

                rel_path = os.path.relpath(image_path, input_dir)
                new_image_name = rel_path.replace(os.sep, '_')

                dst_image_path = os.path.join(images_path, new_image_name)
                shutil.copy(image_path, dst_image_path)

                cursor.execute("INSERT OR IGNORE INTO Images (IName, reviewImage, validateImage) VALUES (?, 0, 0)", (new_image_name,))

                base_name_no_ext = os.path.splitext(file)[0]
                label_txt_file = base_name_no_ext + '.txt'

                label_path = None
                path_same_folder = os.path.join(root, label_txt_file)

                if os.path.exists(path_same_folder):
                    label_path = path_same_folder
                else:
                    path_swapped = root.replace('images', 'labels')
                    path_swapped_file = os.path.join(path_swapped, label_txt_file)
                    if os.path.exists(path_swapped_file):
                        label_path = path_swapped_file

                if label_path:
                    try:
                        with Image.open(image_path) as img:
                            img_w, img_h = img.size

                        with open(label_path, 'r') as lf:
                            for line in lf:
                                parts = line.strip().split()
                                if len(parts) == 5:
                                    class_id = int(parts[0])
                                    x_center = float(parts[1])
                                    y_center = float(parts[2])
                                    w = float(parts[3])
                                    h = float(parts[4])
                                    left_x = int(round((x_center - w / 2.0) * img_w))

                                    top_y = int(round((y_center - h / 2.0) * img_h))
                                    box_w = int(round(w * img_w))
                                    box_h = int(round(h * img_h))
                                    cname = class_names.get(class_id, f"class_{class_id}").replace(' ', '_')

                                    if cname not in inserted_classes:
                                        cursor.execute("INSERT OR IGNORE INTO Classes (CName) VALUES (?)", (cname,))
                                        inserted_classes.add(cname)

                                    cursor.execute("INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                                   (label_id, cname, str(left_x), str(top_y), box_w, box_h, new_image_name))
                                    label_id += 1
                    except Exception as e:
                        print(f"Warning: Error parsing label file {label_path} for image {file}: {e}")

    conn.commit()
    conn.close()

    print("YOLO Archive Import completed successfully.")


def coco_archive_import(db_name, input_dir, output, weights_file=None):
    print("\n--- Starting COCO / KW COCO Archive Import ---")
    print(f"Input directory: {input_dir}")
    print(f"Output project path: {output}")
    print(f"Database name: {db_name}")

    # 1. search recursively for any json file containing COCO keys
    json_files = []
    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith('.json'):
                json_files.append(os.path.join(root, file))

    coco_json_path = None
    coco_data = None
    for jf in json_files:
        try:
            with open(jf, 'r') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'images' in data and 'annotations' in data:
                    coco_json_path = jf
                    coco_data = data
                    print(f"Found COCO JSON: {jf}")
                    break
        except Exception as e:
            pass

    if not coco_data:
        print("Error: No valid COCO JSON file found in the archive.", file=sys.stderr)
        sys.exit(1)

    # 2. search recursively for any weights file and copy it to training/weights/
    weights_path = os.path.join(output, 'training', 'weights')
    os.makedirs(weights_path, exist_ok=True)

    if weights_file and os.path.exists(weights_file):
        shutil.copy(weights_file, os.path.join(weights_path, os.path.basename(weights_file)))

        print(f"Copied uploaded weights file: {weights_file} -> {weights_path}")

    for root, dirs, files in os.walk(input_dir):
        for file in files:
            if file.lower().endswith(('.pt', '.weights', '.habry', '.pipe', '.conf')):
                src = os.path.join(root, file)

                if not (weights_file and os.path.abspath(src) == os.path.abspath(weights_file)):
                    dst = os.path.join(weights_path, file)
                    shutil.copy(src, dst)

                    print(f"Found model file in archive: {src} -> {dst}")

    # 3. Create sqlite3 database
    db_file_path = os.path.join(output, f'{db_name}.db')
    conn = sqlite3.connect(db_file_path)
    cursor = conn.cursor()

    cursor.execute("CREATE TABLE IF NOT EXISTS Classes (CName VARCHAR NOT NULL PRIMARY KEY)")
    cursor.execute("CREATE TABLE IF NOT EXISTS Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0, validateImage INTEGER NOT NULL DEFAULT 0)")
    cursor.execute("CREATE TABLE IF NOT EXISTS Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X VARCHAR NOT NULL, Y VARCHAR NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName))")
    cursor.execute("CREATE TABLE IF NOT EXISTS Validation (Confidence INTEGER NOT NULL, LID INTEGER NOT NULL PRIMARY KEY, CName VARCHAR NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(LID) REFERENCES Labels(LID), FOREIGN KEY(IName) REFERENCES Images(IName), FOREIGN KEY(CName) REFERENCES Classes(CName))")

    conn.commit()

    categories = coco_data.get('categories', [])
    category_map = {}
    inserted_classes = set()

    for cat in categories:
        cat_id = cat.get('id')
        cat_name = cat.get('name', f"class_{cat_id}").replace(' ', '_')
        category_map[cat_id] = cat_name

        cursor.execute("INSERT OR IGNORE INTO Classes (CName) VALUES (?)", (cat_name,))

        inserted_classes.add(cat_name)

    # 4. map images in COCO JSON to actual files
    images_path = os.path.join(output, 'images')
    os.makedirs(images_path, exist_ok=True)

    coco_images = coco_data.get('images', [])
    image_id_to_new_name = {}

    import re

    # helper function to extract trailing digits from a filename stem
    def get_digits_suffix(filename):
        stem = os.path.splitext(os.path.basename(filename))[0]
        match = re.search(r'(\d+)\s*$', stem)

        return int(match.group(1)) if match else None

    # map the isolated integer frame number to its actual disk path
    all_files_in_archive = {}
    for root, dirs, files in os.walk(input_dir):
        if '__MACOSX' in root or '.pytest_cache' in root:
            continue

        for file in files:
            if file.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff')):
                frame_num = get_digits_suffix(file)

                if frame_num is not None:
                    all_files_in_archive[frame_num] = os.path.join(root, file)

    print(f"Indexed {len(all_files_in_archive)} physical image stems via numeric frame matching.")

    for img_entry in coco_images:
        img_id = img_entry.get('id')
        file_name = img_entry.get('file_name')

        base_filename = os.path.basename(file_name)
        target_frame_num = get_digits_suffix(base_filename)

        print(f"Attempting to match JSON target '{base_filename}' using frame number ID: {target_frame_num}")

        if target_frame_num in all_files_in_archive:
            found_path = all_files_in_archive[target_frame_num]

            # use the actual filename from the JSON so the bounding boxes stay consistent
            new_image_name = base_filename

            shutil.copy(found_path, os.path.join(images_path, new_image_name))
            print(f"Successfully copied: {os.path.basename(found_path)} -> {new_image_name}")

            cursor.execute("INSERT OR IGNORE INTO Images (IName, reviewImage, validateImage) VALUES (?, 0, 0)", (new_image_name,))
            image_id_to_new_name[img_id] = new_image_name
        else:
            print(f"FATAL ERROR: Frame ID '{target_frame_num}' from JSON entry '{base_filename}' cannot be matched to any file on disk.", file=sys.stderr)
            sys.exit(1)

    # 5. populate labels
    annotations = coco_data.get('annotations', [])
    label_id = 1
    print(f"Processing {len(annotations)} bounding box annotations...")

    for ann in annotations:
        image_id = ann.get('image_id')
        cat_id = ann.get('category_id')
        bbox = ann.get('bbox')

        new_image_name = image_id_to_new_name.get(image_id)
        cname = category_map.get(cat_id)

        if new_image_name and cname and bbox and len(bbox) == 4:
            cname = cname.replace(' ', '_')
            left_x = int(round(bbox[0]))
            top_y = int(round(bbox[1]))
            box_w = int(round(bbox[2]))
            box_h = int(round(bbox[3]))

            cursor.execute("INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES (?, ?, ?, ?, ?, ?, ?)",
                           (label_id, cname, str(left_x), str(top_y), box_w, box_h, new_image_name))
            label_id += 1

    conn.commit()
    conn.close()

    print(f"COCO Archive Import completed successfully. Inserted {label_id - 1} labels.")

# main argument parsing and execution logic
if __name__ == '__main__':
    # parse all arguments first
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == '-i':
            input_dir = sys.argv[i+1]
        elif sys.argv[i] == '-w':
            weights_file = sys.argv[i+1]
        elif sys.argv[i] == '-c':
            classification_dir = sys.argv[i+1]
        elif sys.argv[i] == '-o':
            output = sys.argv[i+1]
        elif sys.argv[i] == '-d':
            db_name = sys.argv[i+1]
        elif sys.argv[i] == '-r':
            runs = sys.argv[i+1]
        elif sys.argv[i] == '-h':
            help()
            sys.exit()

    # then, after the loop, decide what to run
    if runs == 'class':
        classification_plus_import(db_name, input_dir, output)
    elif runs == 'inf':
        inference_plus_import(input_dir, output, weights_file)
    elif runs == 'ci':
        inference_into_classification(db_name, input_dir, output, weights_file, classification_dir)
    elif runs == 'yolo':
        yolo_archive_import(db_name, input_dir, output, weights_file)
    elif runs == 'coco':
        coco_archive_import(db_name, input_dir, output, weights_file)
    elif runs:
        print(f"invalid run type: {runs}")




