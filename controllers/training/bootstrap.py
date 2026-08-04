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
import time
import glob
import os
import getopt
import sys
import subprocess
import unicodedata

directory_path = os.path.dirname(os.path.realpath(__file__)) + '/'
data_path = ""
cfg_path = ""
weight_path = ""
darknet_path = ""
output_path = ""
text_path = ""
python_path = ""
python_script = ""
percentage = ""
python_options = ""
model_format = "darknet"

# Remove 1st argument from the
# list of command line arguments
argumentList = sys.argv[1:]

# Options
options = "d:c:t:w:y:o:f:h"

# Long options
long_options = ["Data Path", "CFG Path", "Text Path", "Weight Path", "Darknet Path", "Output Path", "Format", "Help"]

#########################################################
# Help Information - NOT USED					#
#########################################################
def showHelpInfo(err):
	print ("")
	print ("You did not provide all the needed command line arguments")
	print("")
	print ("(N/A)Example:")
	print("")
	print ("  bootstrap.py -d <data_path> -n <name_path> -h <help>")
	print("")
	print ("  -d\tSet the path of the folder cotaining the images and their text file annotations.")
	print ("  -n\tSet the path of the names file that contains the classes.")
	print ("  -b\tSet the number of batches.")
	print ("  -s\tSet the number of sub-divisions")
	print ("  -h\tHelp message.")
	print("")
	print("")
	print ("ERROR:")
	print (err)
	print("")
	exit(1)


#########################################################
# Call command function to run the code			#
#########################################################
def call_command(final_command, debug_mode = ""):
	# """Wrapper for subprocess.check_output that implements error handling"""
	try:
		os.system(final_command + ' >/dev/null 2>&1')

	except subprocess.CalledProcessError as err:  # Return code was non-zero
		print("EXCEPTION!!!!")
		print ('Error (Return Code {})'.format(err.returncode))
		print ('Command: {}'.format(err.cmd))
		print ('Output: {}'.format(err.output))
		sys.exit(1)

#########################################################
# Main body of program with checks for options		#
#########################################################
try:
	# Parsing argument
	arguments, values = getopt.getopt(argumentList, options, long_options)
     
	# checking each argument
	for currentArgument, currentValue in arguments:
		if currentArgument in ("-h", "--Help"):
			err = "Display Help Message"
			showHelpInfo(err)
		elif currentArgument in ("-d", "--data_path"):
			data_path = currentValue
		elif currentArgument in ("-c", "--cfg_path"):
			cfg_path = currentValue
		elif currentArgument in ("-t", "--text_path"):
			text_path = currentValue
		elif currentArgument in ("-y", "--darknet_path"):
			darknet_path = currentValue
		elif currentArgument in ("-w", "--weight_path"):
			weight_path = currentValue
		elif currentArgument in ('-o', "--output_path"):
			output_path = currentValue
		elif currentArgument in ('-f', "--Format"):
			model_format = currentValue
#Generate Train.txt
	# genTraintxt(data_path)

except getopt.error as err:
	showHelpInfo(err)

else:
	is_pytorch = weight_path.endswith('.pt') or model_format == "ultralytics"
	if text_path == "":
		err = "You need more options to run the tool (text_path is required)"
		showHelpInfo(err)
	elif output_path == "":
		err = "You need more options to run the tool (output_path is required)"
		showHelpInfo(err)
	elif not is_pytorch:
		if data_path == "":
			err = "You need more options to run the tool (data_path is required for Darknet)"
			showHelpInfo(err)
		elif cfg_path == "":
			err = "You need more options to run the tool (cfg_path is required for Darknet)"
			showHelpInfo(err)

def run_ultralytics_inference(weight_path, text_path, output_path):
	try:
		from ultralytics import YOLO
		import json
		import os
	except ImportError as e:
		print("Error: Ultralytics is required for PyTorch models. Please run within a virtualenv or install it: pip install ultralytics")
		sys.exit(1)

	try:
		model = YOLO(weight_path)
		
		with open(text_path, 'r') as f:
			image_paths = [line.strip() for line in f if line.strip()]

		results_json = []

		for img_path in image_paths:
			if not os.path.exists(img_path):
				results_json.append({"objects": []})
				continue

			results = model.predict(img_path, verbose=False)
			img_objects = []

			if results and len(results) > 0:
				result = results[0]
				boxes = result.boxes
				if boxes is not None:
					for box in boxes:
						cls_id = int(box.cls[0].item())
						name = model.names.get(cls_id, f"class_{cls_id}")
						confidence = float(box.conf[0].item())
						
						xywhn = box.xywhn[0].tolist()
						
						img_objects.append({
							"class_id": cls_id,
							"name": name,
							"relative_coordinates": {
								"center_x": xywhn[0],
								"center_y": xywhn[1],
								"width": xywhn[2],
								"height": xywhn[3]
							},
							"confidence": confidence
						})

			results_json.append({
				"objects": img_objects
			})

		with open(output_path, 'w') as f:
			json.dump(results_json, f, indent=4)
			
	except Exception as e:
		print(f"Exception during Ultralytics inference: {e}")
		sys.exit(1)

is_pytorch = weight_path.endswith('.pt') or model_format == "ultralytics"
if is_pytorch:
	run_ultralytics_inference(weight_path, text_path, output_path)
else:
	#Command to start running darknet using the training files
	cmd = "cd " + darknet_path + "; ./darknet detector test " + data_path + " " + cfg_path + " " + weight_path + " -dont_show -ext_output -out " + output_path + " < " + text_path
	print(cmd)
	call_command(cmd)

# ./darknet detector test /export/labeling_tool/public/projects/cappel-Cara_Dataset/training/logs/1667329701610/obj.cfg /export/labeling_tool/public/projects/cappel-Cara_Dataset/training/logs/1667329701610/obj.data /export/labeling_tool/public/projects/cappel-Cara_Dataset/training/logs/1667329701610/obj_final.weights -dont_show -ext_output -out output.txt < train.txt

