import unittest
import tempfile
import os
import shutil
import sys

from PIL import Image

# Add the inference controllers directory to sys.path so we can import the script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'controllers', 'inference')))

import datatovalues


class TestResolveOriginalSrc(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def _make_image(self, path, fmt):
        Image.new("RGB", (10, 10), color=(255, 0, 0)).save(path, fmt)

    def test_directory_source_exact_extension_match(self):
        # A .jpg source keeps its extension in Ultralytics' output, so an
        # exact filename match should resolve directly.
        src_dir = os.path.join(self.test_dir, "images")
        os.makedirs(src_dir)
        self._make_image(os.path.join(src_dir, "cat.jpg"), "JPEG")

        resolved = datatovalues.resolve_original_src(src_dir, "cat.jpg")
        self.assertEqual(resolved, os.path.join(src_dir, "cat.jpg"))

    def test_directory_source_png_renamed_to_jpg_by_ultralytics(self):
        # Ultralytics always saves predicted images as .jpg, even when the
        # source was a .png. The output file name ("cat.jpg") won't exist in
        # the source directory (only "cat.png" does), so this must fall back
        # to a stem match instead of silently failing to resolve.
        src_dir = os.path.join(self.test_dir, "images")
        os.makedirs(src_dir)
        self._make_image(os.path.join(src_dir, "cat.png"), "PNG")

        resolved = datatovalues.resolve_original_src(src_dir, "cat.jpg")
        self.assertEqual(resolved, os.path.join(src_dir, "cat.png"))

    def test_directory_source_no_match_returns_none(self):
        src_dir = os.path.join(self.test_dir, "images")
        os.makedirs(src_dir)
        self._make_image(os.path.join(src_dir, "dog.png"), "PNG")

        resolved = datatovalues.resolve_original_src(src_dir, "cat.jpg")
        self.assertIsNone(resolved)

    def test_single_file_source_exact_extension_match(self):
        src_file = os.path.join(self.test_dir, "cat.jpg")
        self._make_image(src_file, "JPEG")

        resolved = datatovalues.resolve_original_src(src_file, "cat.jpg")
        self.assertEqual(resolved, src_file)

    def test_single_file_source_extension_changed_by_ultralytics(self):
        # A single uploaded .png file run through inference: Ultralytics'
        # output is named "cat.jpg", which must still resolve back to the
        # uploaded "cat.png" via a stem match.
        src_file = os.path.join(self.test_dir, "cat.png")
        self._make_image(src_file, "PNG")

        resolved = datatovalues.resolve_original_src(src_file, "cat.jpg")
        self.assertEqual(resolved, src_file)

    def test_single_file_source_stem_mismatch_returns_none(self):
        src_file = os.path.join(self.test_dir, "dog.png")
        self._make_image(src_file, "PNG")

        resolved = datatovalues.resolve_original_src(src_file, "cat.jpg")
        self.assertIsNone(resolved)


class TestCopyRawImage(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_same_extension_is_a_plain_copy(self):
        src = os.path.join(self.test_dir, "cat.jpg")
        Image.new("RGB", (10, 10), color=(0, 255, 0)).save(src, "JPEG")
        dest = os.path.join(self.test_dir, "raw", "cat.jpg")
        os.makedirs(os.path.dirname(dest))

        datatovalues.copy_raw_image(src, dest)

        self.assertTrue(os.path.exists(dest))
        self.assertEqual(os.path.getsize(src), os.path.getsize(dest))

    def test_different_extension_is_reencoded_not_mislabeled(self):
        # Destination must actually be valid JPEG content, not PNG bytes
        # wearing a .jpg name.
        src = os.path.join(self.test_dir, "cat.png")
        Image.new("RGB", (10, 10), color=(0, 0, 255)).save(src, "PNG")
        dest = os.path.join(self.test_dir, "raw", "cat.jpg")
        os.makedirs(os.path.dirname(dest))

        datatovalues.copy_raw_image(src, dest)

        self.assertTrue(os.path.exists(dest))
        with Image.open(dest) as im:
            im.load()
            self.assertEqual(im.format, "JPEG")
            self.assertEqual(im.size, (10, 10))


if __name__ == "__main__":
    unittest.main()
