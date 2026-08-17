import os
import sys
import argparse
import csv
import zipfile
import json
from pathlib import Path
import numpy as np
from PIL import Image

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras.applications.inception_v3 import (
        InceptionV3,
        preprocess_input
    )
except ImportError:
    print("Error: TensorFlow is required. Install with: pip install tensorflow[and-cuda]")
    sys.exit(1)


# ---------------------------------------------------
# Argument Parsing
# ---------------------------------------------------

parser = argparse.ArgumentParser(
    description="Run inference using InceptionV3-based models"
)
parser.add_argument("-i", "--image_path", required=True,
                    help="Path to images folder")
parser.add_argument("-n", "--name_path", required=True,
                    help="Path to classes file (txt or json)")
parser.add_argument("-w", "--weight_path", required=True,
                    help="Path to model weights (.h5 or SavedModel)")
parser.add_argument("-o", "--output_path", required=True,
                    help="Output directory")
parser.add_argument("-k", "--top_k", type=int, default=3,
                    help="Top K predictions per image")

args = parser.parse_args()

# ---------------------------------------------------
# Loading & Setup
# ---------------------------------------------------

def load_class_names(name_path):
    if name_path.endswith(".json"):
        import json

        with open(name_path, "r") as f:
            return json.load(f)
    else:
        with open(name_path, "r") as f:
            return [line.strip() for line in f]


class_names = load_class_names(args.name_path)
num_classes = len(class_names)

def load_model(weight_path, num_classes):
    if weight_path == "imagenet":
        base_model = InceptionV3(
            weights="imagenet",
            include_top=False,
            input_shape=(299, 299, 3)
        )

        x = keras.layers.GlobalAveragePooling2D()(base_model.output)
        outputs = keras.layers.Dense(num_classes, activation="softmax")(x)

        return keras.Model(inputs=base_model.input, outputs=outputs)

    if os.path.isdir(weight_path):
        print("Loading full SavedModel...")

        return keras.models.load_model(weight_path)

    elif weight_path.endswith(".h5"):
        print("Building InceptionV3 architecture + loading weights...")

        base_model = InceptionV3(
            weights=None,
            include_top=False,
            input_shape=(299, 299, 3)
        )

        x = keras.layers.GlobalAveragePooling2D()(base_model.output)
        outputs = keras.layers.Dense(num_classes, activation="softmax")(x)

        model = keras.Model(inputs=base_model.input, outputs=outputs)
        model.load_weights(weight_path)

        return model

    else:
        raise ValueError("Unsupported weight format")

model = load_model(args.weight_path, num_classes)


def preprocess_image(img_path):
    img = Image.open(img_path).convert("RGB")
    img = img.resize((299, 299))

    img_array = np.array(img)
    img_array = preprocess_input(img_array)

    return np.expand_dims(img_array, axis=0)

# ---------------------------------------------------
# Inference
# ---------------------------------------------------

image_files = [
    f for f in os.listdir(args.image_path)
    if f.lower().endswith((".jpg", ".jpeg", ".png", ".bmp"))
]

os.makedirs(args.output_path, exist_ok=True)

stats_csv = os.path.join(args.output_path, "inference_stats.csv")
detail_csv = os.path.join(args.output_path, "inference_predictions.csv")

with open(stats_csv, "w", newline="") as stats_file, \
     open(detail_csv, "w", newline="") as detail_file:

    stats_writer = csv.writer(stats_file)
    detail_writer = csv.writer(detail_file)

    stats_writer.writerow(["Image Name", "File Size (KB)", "Top Prediction", "Confidence"])
    detail_writer.writerow(["Image Name", "Rank", "Class", "Confidence"])

    for img_file in image_files:
        img_path = os.path.join(args.image_path, img_file)

        file_size = os.path.getsize(img_path) / 1024  # KB

        input_tensor = preprocess_image(img_path)

        preds = model.predict(input_tensor, verbose=0)[0]

        top_indices = np.argsort(preds)[::-1][:args.top_k]
        top_class = class_names[top_indices[0]]
        top_conf = float(preds[top_indices[0]])

        stats_writer.writerow([
            img_file,
            f"{file_size:.2f}",
            top_class,
            f"{top_conf:.4f}"
        ])

        for rank, idx in enumerate(top_indices, start=1):
            detail_writer.writerow([
                img_file,
                rank,
                class_names[idx],
                f"{float(preds[idx]):.4f}"
            ])

# ---------------------------------------------------
# Zip Results
# ---------------------------------------------------

zip_path = os.path.join(args.output_path, "inference_results.zip")

with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    zipf.write(stats_csv, arcname="inference_stats.csv")
    zipf.write(detail_csv, arcname="inference_predictions.csv")

print(f"Created zip archive: {zip_path}")
print("Inference complete.")
