import unittest
import tempfile
import os
import shutil
import numpy as np
from PIL import Image
import sys

# Add the imports directory to sys.path so we can import the script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'controllers', 'imports')))

import get_images_fromROI

class TestGetImagesFromROI(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_parse_adc(self):
        # Create a mock adc file (comma separated)
        adc_path = os.path.join(self.test_dir, "test.adc")
        with open(adc_path, "w") as f:
            f.write("1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 10, 20, 100\n")
            f.write("2, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 25, 300\n")
            f.write("\n") # empty line
            f.write("invalid row with text\n")
            f.write("3, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 30, 40, 500\n")

        data = get_images_fromROI.parse_adc(adc_path)
        self.assertEqual(data.shape, (3, 14))
        self.assertEqual(data[0, 11], 10.0)
        self.assertEqual(data[1, 12], 25.0)
        self.assertEqual(data[2, 13], 500.0)

    def test_get_image_columns_old_format(self):
        # Old format starts with "I"
        data = np.zeros((1, 14))
        data[0, 11] = 10
        data[0, 12] = 20
        data[0, 13] = 100
        x, y, startbyte = get_images_fromROI.get_image_columns("I2010123", data)
        self.assertEqual(x[0], 10)
        self.assertEqual(y[0], 20)
        self.assertEqual(startbyte[0], 100)

    def test_get_image_columns_new_format(self):
        # New format starts with "D"
        data = np.zeros((1, 18))
        data[0, 15] = 15
        data[0, 16] = 25
        data[0, 17] = 300
        x, y, startbyte = get_images_fromROI.get_image_columns("D20141203", data)
        self.assertEqual(x[0], 15)
        self.assertEqual(y[0], 25)
        self.assertEqual(startbyte[0], 300)

    def test_extract_images_old_format(self):
        # Old format starting with "I"
        basename = "I2010123"
        adc_path = os.path.join(self.test_dir, f"{basename}.adc")
        roi_path = os.path.join(self.test_dir, f"{basename}.roi")
        out_dir = os.path.join(self.test_dir, "output")

        # 14 columns for old format
        # x=2, y=3, startbyte=0
        # x=4, y=2, startbyte=6
        with open(adc_path, "w") as f:
            f.write("1,0,0,0,0,0,0,0,0,0,0,2,3,0\n")
            f.write("2,0,0,0,0,0,0,0,0,0,0,4,2,6\n")

        # roi binary contents:
        # First image: 2*3 = 6 bytes
        # Second image: 4*2 = 8 bytes
        img1_data = bytes([10, 20, 30, 40, 50, 60])
        img2_data = bytes([100, 101, 102, 103, 104, 105, 106, 107])
        with open(roi_path, "wb") as f:
            f.write(img1_data)
            f.write(img2_data)

        # Extract without outdir (returns actual images in memory)
        targets = get_images_fromROI.extract_images(roi_path, adc_path)
        self.assertEqual(len(targets), 2)
        self.assertEqual(targets[0]["targetNumber"], 1)
        self.assertEqual(targets[0]["pid"], f"{basename}_00001")
        self.assertTrue(isinstance(targets[0]["image"], np.ndarray))
        self.assertEqual(targets[0]["image"].shape, (3, 2))
        self.assertEqual(list(targets[0]["image"].flatten()), [10, 20, 30, 40, 50, 60])

        self.assertEqual(targets[1]["targetNumber"], 2)
        self.assertEqual(targets[1]["pid"], f"{basename}_00002")
        self.assertEqual(targets[1]["image"].shape, (2, 4))
        self.assertEqual(list(targets[1]["image"].flatten()), [100, 101, 102, 103, 104, 105, 106, 107])

        # Extract with outdir (uses ImagePlaceholder to preserve memory ceiling)
        targets_with_out = get_images_fromROI.extract_images(roi_path, adc_path, outdir=out_dir)
        self.assertEqual(len(targets_with_out), 2)
        self.assertTrue(isinstance(targets_with_out[0]["image"], get_images_fromROI.ImagePlaceholder))
        self.assertEqual(targets_with_out[0]["image"].shape, (3, 2))

        # Check that files were written
        self.assertTrue(os.path.exists(os.path.join(out_dir, f"{basename}_00001.png")))
        self.assertTrue(os.path.exists(os.path.join(out_dir, f"{basename}_00002.png")))

        # Verify saved PNG content matches
        img_saved1 = Image.open(os.path.join(out_dir, f"{basename}_00001.png"))
        self.assertEqual(img_saved1.size, (2, 3)) # PIL size is (width, height)
        self.assertEqual(list(img_saved1.getdata()), [10, 20, 30, 40, 50, 60])

if __name__ == "__main__":
    unittest.main()
