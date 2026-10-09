"""Example custom pre-processing step for the Njobvu pre-processing pipeline.

Use this file as a starting point for your own step. Upload your edited copy
from the "Upload custom pipeline script (.py)" box on the Pre-processing tab,
then add it to the pipeline with "Add Custom Step".

HOW YOUR SCRIPT IS RUN
----------------------
When a pipeline is applied, controllers/preprocessing/run_pipeline.py loads
this file with importlib and, for every image in the project, calls

    process(img)

once, in the position this step has in the pipeline (steps run top to bottom;
steps whose toggle is off are skipped). The value you return becomes the
input of the next step, and the final image is written to the output folder
using the original file name.

CONTRACT
--------
  * Define a top-level function named `process` taking one argument.
  * `img` is a NumPy array as returned by cv2.imread: shape (height, width, 3),
    dtype uint8, channels in BGR order (not RGB).
  * Return an image of the same kind (NumPy uint8 array, 2 or 3 dimensions are
    both accepted by cv2.imwrite, but 3-channel BGR is safest for later steps).
  * Do not modify files on disk or touch the network. Uploads are statically
    checked and anything that imports os, subprocess, socket, shutil, ctypes
    or pty, or calls the Python built-ins that run dynamic code, is rejected.
  * Only OpenCV (cv2) and NumPy (numpy) are guaranteed to be available.
  * Per-step slider settings are not passed to custom scripts; put any
    constants you want to tune at the top of the file as shown below.

WHAT THIS EXAMPLE DOES
----------------------
It applies an unsharp mask: it blurs the image slightly, then subtracts that
blur from the original to boost edges. This is a common way to bring out
detail before labeling blurry images.
"""
import cv2
import numpy as np

# Tunable constants. Edit these and re-upload to change the behaviour.
BLUR_SIGMA = 1.5      # Std-dev of the Gaussian blur; larger = coarser detail boosted.
SHARPEN_AMOUNT = 1.0  # Strength of the effect; 0 leaves the image unchanged.


def process(img):
    # 1. Blur a copy of the image. (0, 0) as the kernel size tells OpenCV to
    #    derive the kernel from sigma, which keeps the result well-defined for
    #    images of any size.
    blurred = cv2.GaussianBlur(img, (0, 0), BLUR_SIGMA)

    # 2. Unsharp mask: original + amount * (original - blurred).
    #    addWeighted computes  a*src1 + b*src2 + gamma  and, unlike plain
    #    NumPy arithmetic on uint8, saturates at 0 and 255 instead of
    #    wrapping around.
    sharpened = cv2.addWeighted(
        img, 1.0 + SHARPEN_AMOUNT,
        blurred, -SHARPEN_AMOUNT,
        0,
    )

    # 3. Return a uint8 image so the next pipeline step (and cv2.imwrite)
    #    receives the type it expects.
    return sharpened.astype(np.uint8)
