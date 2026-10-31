#!/usr/bin/env python3
"""Long-lived worker that runs ONE custom pre-processing script.

run_pipeline.py starts this with the Python interpreter the user configured for
that script, so the script can import packages that only exist in that
environment. Protocol (one JSON object per line on stdin / stdout):

    request : {"input": "<png path>", "output": "<png path>"}
    reply   : {"ok": true}  or  {"ok": false, "error": "<message>"}

The script's own print() output is redirected to stderr so it can never corrupt
the reply stream. The worker exits when stdin closes.
"""
import argparse
import importlib.util
import json
import sys
import traceback

import cv2


def load_process(script_path):
    spec = importlib.util.spec_from_file_location("custom_step", script_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.process


def main():
    parser = argparse.ArgumentParser(description="Run one custom pre-processing script.")
    parser.add_argument("--script", required=True, help="Path of the custom script exposing process(img)")
    args = parser.parse_args()

    reply_stream = sys.stdout
    sys.stdout = sys.stderr

    process = load_process(args.script)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            img = cv2.imread(request["input"])
            if img is None:
                raise ValueError("could not read input image")
            result = process(img)
            if not cv2.imwrite(request["output"], result):
                raise ValueError("could not write output image")
            reply = {"ok": True}
        except Exception as exc:  # report to the parent, keep serving requests
            traceback.print_exc()
            reply = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        reply_stream.write(json.dumps(reply) + "\n")
        reply_stream.flush()


if __name__ == "__main__":
    main()
