import sys
from unittest.mock import MagicMock, mock_open, patch

# Mock third-party libraries that might not be installed
mock_ultralytics = MagicMock()
mock_yolo = MagicMock()
mock_ultralytics.YOLO = mock_yolo
sys.modules['ultralytics'] = mock_ultralytics

mock_pil = MagicMock()
mock_image = MagicMock()
mock_pil.Image = mock_image
sys.modules['PIL'] = mock_pil

import unittest
import os
import shutil
import sqlite3
import json
import yaml

# Add the directory containing import_options to the path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'controllers', 'imports')))
import import_options
import importNJ

class TestImportSpaceReplacement(unittest.TestCase):
    def setUp(self):
        self.test_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'temp_test_imports'))
        os.makedirs(self.test_dir, exist_ok=True)
        self.input_dir = os.path.join(self.test_dir, 'input')
        self.output_dir = os.path.join(self.test_dir, 'output')
        os.makedirs(self.input_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_yolo_archive_import_space_replacement(self):
        # Create a mock yaml with class names containing spaces
        yaml_content = {
            'names': {
                0: 'class one',
                1: 'class two'
            }
        }
        yaml_path = os.path.join(self.input_dir, 'data.yaml')
        with open(yaml_path, 'w') as f:
            yaml.dump(yaml_content, f)

        # Create mock images and labels
        os.makedirs(os.path.join(self.input_dir, 'images'), exist_ok=True)
        os.makedirs(os.path.join(self.input_dir, 'labels'), exist_ok=True)
        
        # Create a dummy image file
        with open(os.path.join(self.input_dir, 'images', 'img_1.jpg'), 'wb') as f:
            f.write(b'\x00' * 100) # dummy bytes
        
        # Create label file with both classes
        with open(os.path.join(self.input_dir, 'labels', 'img_1.txt'), 'w') as f:
            f.write("0 0.5 0.5 0.2 0.2\n")
            f.write("1 0.3 0.3 0.1 0.1\n")

        # Mock PIL.Image.open
        class MockImage:
            def __init__(self):
                self.size = (100, 100)
            def __enter__(self):
                return self
            def __exit__(self, exc_type, exc_val, exc_tb):
                pass
        mock_image.open.return_value = MockImage()

        import_options.yolo_archive_import('test_yolo', self.input_dir, self.output_dir)

        # Check DB
        db_path = os.path.join(self.output_dir, 'test_yolo.db')
        self.assertTrue(os.path.exists(db_path))
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT CName FROM Classes")
        classes = [r[0] for r in cursor.fetchall()]
        conn.close()

        self.assertIn('class_one', classes)
        self.assertIn('class_two', classes)
        self.assertNotIn('class one', classes)

    def test_coco_archive_import_space_replacement(self):
        # Create mock COCO JSON with spaces in category names
        coco_data = {
            'images': [
                {'id': 1, 'file_name': 'frame_001.jpg'}
            ],
            'categories': [
                {'id': 1, 'name': 'coco class one'},
                {'id': 2, 'name': 'coco class two'}
            ],
            'annotations': [
                {'image_id': 1, 'category_id': 1, 'bbox': [10, 20, 30, 40]}
            ]
        }
        
        json_path = os.path.join(self.input_dir, 'annotations.json')
        with open(json_path, 'w') as f:
            json.dump(coco_data, f)
            
        # Create a dummy physical image file in the archive matching the naming pattern
        # The COCO loader looks for images whose stem ends with frame number digits (e.g. frame_001.jpg -> 1)
        with open(os.path.join(self.input_dir, 'frame_001.jpg'), 'wb') as f:
            f.write(b'\x00' * 100)

        import_options.coco_archive_import('test_coco', self.input_dir, self.output_dir)

        # Check DB
        db_path = os.path.join(self.output_dir, 'test_coco.db')
        self.assertTrue(os.path.exists(db_path))
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT CName FROM Classes")
        classes = [r[0] for r in cursor.fetchall()]
        
        cursor.execute("SELECT CName FROM Labels")
        label_classes = [r[0] for r in cursor.fetchall()]
        conn.close()

        self.assertIn('coco_class_one', classes)
        self.assertIn('coco_class_two', classes)
        self.assertNotIn('coco class one', classes)
        self.assertIn('coco_class_one', label_classes)

if __name__ == '__main__':
    unittest.main()
