import json
import os
import shutil
import sys
import tempfile
import unittest

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'controllers', 'preprocessing')))

if cv2 is not None:
    import run_pipeline


@unittest.skipIf(cv2 is None, "opencv-python-headless is not installed in this environment")
class TestRunPipeline(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.img = (np.random.rand(50, 80, 3) * 255).astype(np.uint8)

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_process_image_chains_all_builtin_steps(self):
        steps = [
            {"type": "illumination_normalization", "order": 0, "params": {"method": "clahe", "clipLimit": 2.0, "tileGridSize": 8}},
            {"type": "resize", "order": 1, "params": {"width": 40, "height": 40, "keepAspectRatio": True}},
            {"type": "rotate", "order": 2, "params": {"angle": 10, "expand": True}},
            {"type": "crop", "order": 3, "params": {"top": 5, "bottom": 5, "left": 5, "right": 5}},
            {"type": "pad", "order": 4, "params": {"top": 4, "bottom": 4, "left": 4, "right": 4, "mode": "constant", "color": [0, 0, 0]}},
            {"type": "noise", "order": 5, "params": {"type": "gaussian", "amount": 0.05}},
        ]

        result, _ = run_pipeline.process_image(self.img.copy(), steps)

        self.assertIsNotNone(result)
        self.assertEqual(result.shape[2], 3)

    def test_process_image_routes_custom_step_through_process_contract(self):
        custom_script = os.path.join(self.test_dir, "flip.py")
        with open(custom_script, "w") as f:
            f.write("import cv2\n\ndef process(img):\n    return cv2.flip(img, 1)\n")

        steps = [{"type": "custom", "order": 0, "params": {}, "scriptPath": custom_script}]
        result, _ = run_pipeline.process_image(self.img.copy(), steps)

        np.testing.assert_array_equal(result, cv2.flip(self.img, 1))

    def test_custom_step_with_python_path_runs_in_worker_subprocess(self):
        custom_script = os.path.join(self.test_dir, "flip.py")
        with open(custom_script, "w") as f:
            f.write("import cv2\n\ndef process(img):\n    print('noise on stdout')\n    return cv2.flip(img, 1)\n")

        steps = [{"type": "custom", "order": 0, "params": {}, "scriptPath": custom_script, "pythonPath": sys.executable}]
        external = run_pipeline.ExternalStepWorkers()
        try:
            first, _ = run_pipeline.process_image(self.img.copy(), steps, external)
            second, _ = run_pipeline.process_image(self.img.copy(), steps, external)
        finally:
            external.close()

        np.testing.assert_array_equal(first, cv2.flip(self.img, 1))
        np.testing.assert_array_equal(second, cv2.flip(self.img, 1))

    def test_external_worker_surfaces_script_errors(self):
        custom_script = os.path.join(self.test_dir, "boom.py")
        with open(custom_script, "w") as f:
            f.write("def process(img):\n    raise ValueError('boom')\n")

        steps = [{"type": "custom", "order": 0, "params": {}, "scriptPath": custom_script, "pythonPath": sys.executable}]
        external = run_pipeline.ExternalStepWorkers()
        try:
            with self.assertRaises(RuntimeError) as ctx:
                run_pipeline.process_image(self.img.copy(), steps, external)
        finally:
            external.close()

        self.assertIn("boom", str(ctx.exception))

    def test_main_processes_every_image_in_directory(self):
        images_dir = os.path.join(self.test_dir, "images")
        output_dir = os.path.join(self.test_dir, "output")
        os.makedirs(images_dir)
        cv2.imwrite(os.path.join(images_dir, "a.png"), self.img)
        cv2.imwrite(os.path.join(images_dir, "b.png"), self.img)

        manifest_path = os.path.join(self.test_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"steps": [{"type": "resize", "order": 0, "params": {"width": 20, "height": 20}}]}, f)

        sys.argv = ["run_pipeline.py", "--images", images_dir, "--manifest", manifest_path, "--output", output_dir]
        run_pipeline.main()

        self.assertEqual(sorted(os.listdir(output_dir)), ["a.png", "b.png", "transforms.json"])
        out_img = cv2.imread(os.path.join(output_dir, "a.png"))
        self.assertEqual(out_img.shape[:2], (20, 20))

    def test_main_reports_progress_to_the_status_file(self):
        images_dir = os.path.join(self.test_dir, "images")
        output_dir = os.path.join(self.test_dir, "output")
        os.makedirs(images_dir)
        cv2.imwrite(os.path.join(images_dir, "a.png"), self.img)
        cv2.imwrite(os.path.join(images_dir, "b.png"), self.img)
        with open(os.path.join(images_dir, "corrupt.png"), "w") as f:
            f.write("named like an image but not decodable")
        with open(os.path.join(images_dir, "a.txt"), "w") as f:
            f.write("label file: not counted at all")

        manifest_path = os.path.join(self.test_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"steps": [{"type": "resize", "order": 0, "params": {"width": 20, "height": 20}}]}, f)
        status_path = os.path.join(self.test_dir, "status.json")

        sys.argv = [
            "run_pipeline.py", "--images", images_dir, "--manifest", manifest_path,
            "--output", output_dir, "--status", status_path,
        ]
        run_pipeline.main()

        with open(status_path) as f:
            status = json.load(f)
        self.assertEqual(status, {"state": "completed", "total": 3, "processed": 2, "skipped": 1})

    def test_apply_resize_keeps_aspect_ratio_when_requested(self):
        result = run_pipeline.apply_resize(self.img, {"width": 40, "height": 40, "keepAspectRatio": True})

        self.assertLessEqual(result.shape[0], 40)
        self.assertLessEqual(result.shape[1], 40)

    def test_hex_to_bgr_parses_the_color_input_as_bgr(self):
        # The UI's <input type="color"> sends "#rrggbb"; cv2 images are BGR.
        self.assertEqual(run_pipeline.hex_to_bgr("#ff0000"), (0, 0, 255))
        self.assertEqual(run_pipeline.hex_to_bgr("#00ff00"), (0, 255, 0))
        self.assertEqual(run_pipeline.hex_to_bgr([1, 2, 3]), (1, 2, 3))
        self.assertEqual(run_pipeline.hex_to_bgr(None), (0, 0, 0))

    def test_apply_pad_uses_the_hex_fill_color(self):
        img = np.zeros((10, 10, 3), dtype=np.uint8)
        result = run_pipeline.apply_pad(img, {"top": 2, "bottom": 0, "left": 0, "right": 0, "color": "#ff0000"})

        np.testing.assert_array_equal(result[0, 0], [0, 0, 255])

    def test_apply_noise_treats_explicit_zero_amount_as_no_noise(self):
        result = run_pipeline.apply_noise(self.img.copy(), {"type": "gaussian", "amount": 0})

        np.testing.assert_array_equal(result, self.img)


if __name__ == "__main__":
    unittest.main()


    def test_transform_maps_original_pixels_to_final_pixels(self):
        steps = [
            {"type": "crop", "order": 0, "params": {"top": 10, "bottom": 0, "left": 25, "right": 0}},
            {"type": "pad", "order": 1, "params": {"top": 3, "left": 7}},
            {"type": "resize", "order": 2, "params": {"width": 140, "height": 100}},
        ]
        out, m = run_pipeline.process_image(self.img.copy(), steps)  # 50x80 -> crop 45x60 -> pad 48x67 -> 100x140
        self.assertEqual(out.shape[:2], (100, 140))

        # Original (x=40, y=25) -> crop (-20, -5) => (20, 20) -> pad (+7, +3) => (27, 23) -> scale
        x, y, _ = m @ np.array([40.0, 25.0, 1.0])
        self.assertAlmostEqual(x, 27 * 140 / 67)
        self.assertAlmostEqual(y, 23 * 100 / 48)

    def test_rotate_transform_matches_cv2_warp(self):
        params = {"angle": 90, "expand": True}
        out, m = run_pipeline.process_image(self.img.copy(), [{"type": "rotate", "order": 0, "params": params}])
        self.assertEqual(out.shape[:2], (80, 50))
        x, y, _ = m @ np.array([0.0, 0.0, 1.0])  # top-left corner of the source
        # Counter-clockwise 90 degrees: the top-left corner ends up at the bottom-left.
        self.assertAlmostEqual(x, 0.0, places=5)
        self.assertAlmostEqual(y, 80.0, places=5)

    def test_main_writes_transforms_for_each_image(self):
        images_dir = os.path.join(self.test_dir, "images")
        output_dir = os.path.join(self.test_dir, "output")
        os.makedirs(images_dir)
        cv2.imwrite(os.path.join(images_dir, "a.png"), self.img)
        manifest_path = os.path.join(self.test_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump({"steps": [{"type": "resize", "order": 0, "params": {"width": 20, "height": 20}}]}, f)

        sys.argv = ["run_pipeline.py", "--images", images_dir, "--manifest", manifest_path, "--output", output_dir]
        run_pipeline.main()

        with open(os.path.join(output_dir, "transforms.json")) as f:
            entry = json.load(f)["a.png"]
        self.assertEqual((entry["srcWidth"], entry["srcHeight"], entry["width"], entry["height"]), (80, 50, 20, 20))
        self.assertAlmostEqual(entry["matrix"][0], 20 / 80)
        self.assertAlmostEqual(entry["matrix"][4], 20 / 50)

    def test_list_images_ignores_labels_and_hidden_files(self):
        for name in ["a.jpg", "B.PNG", "a.txt", "._a.jpg", ".DS_Store", "notes.md"]:
            with open(os.path.join(self.test_dir, name), "w") as f:
                f.write("x")
        os.makedirs(os.path.join(self.test_dir, "sub.jpg"))

        self.assertEqual(run_pipeline.list_images(self.test_dir), ["B.PNG", "a.jpg"])
