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
import shutil

directory_path = os.path.dirname(os.path.realpath(__file__)) + '/'
data_path = ""
image_path = ""
name_path = ""
weight_path = ""
darknet_path = ""
log_file = ""
batch = ""
subdiv = ""
width = ""
height = ""
yolo_task = ""
yolo_version = 3
epochs = 100
imgsz = 640
device = "cpu"
adv_options = ""
python_path = ""
python_script = ""
percentage = ""
python_options = ""

# Remove 1st argument from the
# list of command line arguments
argumentList = sys.argv[1:]

# Options
options = "d:f:t:m:i:n:p:l:f:w:b:s:x:y:v:e:I:D:o:h"

# Long options
long_options = ["Data Path", "Images Path", "Name Path", "YOLO Task", "YOLO Mode", "Percentage", "Log Path", "Darknet Path",
                "Weight Path", "Batch", "Subdivision", "Width", "Height", "YOLO Version", "EPOCHS", "Image Size", "Device", "Advanced Options", "Help"]

#########################################################
# Help Information - NOT USED					#
#########################################################


def showHelpInfo(err):
    print("")
    print("You did not provide all the needed command line arguments")
    print("")
    print("Example:")
    print("")
    print("  datatovalues.py -d <data_path> -n <name_path> -h <help>")
    print("")
    print("  -d\tSet the path of the folder cotaining the images and their text file annotations.")
    print("  -n\tSet the path of the names file that contains the classes.")
    print("  -f\tSet the darknet/ultralytics folder path.")
    print("  -b\tSet the number of batches.")
    print("  -s\tSet the number of sub-divisions")
    print("  -x\tSet the width value")
    print("  -y\tSet the height value")
    print("  -v\tSet the YOLO version number")
    print("  -t\tSet the YOLO Task")
    print("  -m\tSet the YOLO Mode")
    print("  -e\tSet the EPOCH value (default 100)")
    print("  -I\tSet the Image Size value (default 640)")
    print("  -D\tSet the Device value (cpu, gpu#, mps)")
    print("  -o\tAdvanced YOLO Options (patience=2 seed=3 etc)")
    print("  -h\tHelp message.")
    print("")
    print("")
    print("ERROR:")
    print(err)
    print("")
    exit(1)


#########################################################
# Generate train.txt file			#
#########################################################
def genTraintxt(data_path, image_path, percentage):
    directory = os.listdir(image_path)
    images = []
    print("Total number of files: ", len(directory))
    for file in directory:
        if (file.endswith('.jpg') or file.endswith('.JPG') or file.endswith('.jpeg') or file.endswith('.JPEG') or file.endswith('.png') or file.endswith('.PNG') or file.endswith('.tiff') or file.endswith('.TIFF')):
            images.append(file)

    print("Total number of image files: ", len(images))

    length = int((int(percentage) * len(images))/100)
    print("percentage: ", percentage)
    print("Length: ", length)
    files = images[:length]
    print("training files: ", len(files))
    train_path = data_path + '/train.txt'
    f = open(train_path, 'w+')

    for file in files:
        if (file.endswith('.jpg') or file.endswith('.JPG') or file.endswith('.jpeg') or file.endswith('.JPEG') or file.endswith('.png') or file.endswith('.PNG') or file.endswith('.tiff') or file.endswith('.TIFF')):
            f.write(image_path + '/' + file + '\n')
    f.close()

    files = images[length:]
    print("validation files: ", len(files))
    valid_path = data_path + '/validation.txt'
    f = open(valid_path, 'w+')
    for file in files:
        if (file.endswith('.jpg') or file.endswith('.JPG') or file.endswith('.jpeg') or file.endswith('.JPEG') or file.endswith('.png') or file.endswith('.PNG') or file.endswith('.tiff') or file.endswith('.TIFF')):
            f.write(image_path + '/' + file + '\n')
    f.close()


#########################################################
# Creates relavent configuration files			#
#########################################################
def createConfig(data_path, batch, subdiv, width, height):
    name_path = data_path + '/classes.txt'
    classAmount = 0
    # Finds the number of classes
    z = open(name_path, 'r')
    for line in z:
        classAmount = classAmount + 1
    z.close()

    # Creates template files to overwrite
    objdata = data_path + '/obj.data'
    dataTemp = data_path + '/dataTemplate.txt'
    # Creates obj.data file #################
    # directory = os.listdir('data')
    f = open(objdata, 'w+')
    g = open(dataTemp, 'r')
    # Iterates through every line in the config file and replaces holders with updated information
    for line in g:
        for word in line.split():
            if word == '<class_num>':
                f.write(line.replace('<class_num>', str(classAmount)))
            elif word == '<train>':
                f.write(line.replace('<train>', data_path + '/train.txt'))
            elif word == '<valid>':
                f.write(line.replace('<valid>', data_path + '/validation.txt'))
            elif word == '<names>':
                f.write(line.replace('<names>', name_path))
            elif word == '<backup>':
                f.write(line.replace('<backup>', os.path.dirname(log_file)))
    f.close()
    g.close()
    ########################################

    # Creates yolov4-obj.cfg file #################
    # These are the typical settings needed to run darknet
    max_batches = classAmount * 2000
    step80 = max_batches * 0.8
    step90 = max_batches * 0.9
    filters = (classAmount + 5) * 3

    objcfg = data_path + "/obj.cfg"
    cfgTemp = data_path + '/cfgTemplate.txt'
    f = open(objcfg, 'w+')
    g = open(cfgTemp, 'r')

    for line in g:
        for word in line.split():
            if word == '<max_batches>':
                line = line.replace('<max_batches>', str(max_batches))
            elif word == '<batch>':
                line = line.replace('<batch>', str(batch))
            elif word == '<subdivisions>':
                line = line.replace('<subdivisions>', str(subdiv))
            elif word == '<step80>':
                line = line.replace('<step80>', str(step80))
            elif word == '<step90>':
                line = line.replace('<step90>', str(step90))
            elif word == '<class_num>':
                line = line.replace('<class_num>', str(classAmount))
            elif word == '<filters>':
                line = line.replace('<filters>', str(filters))
            elif word == '<width>':
                line = line.replace('<width>', str(width))
            elif word == '<height>':
                line = line.replace('<height>', str(height))
            elif word == '<yolo_version>':
                line = line.replace('<yolo_version>', int(yolo_version))
        f.write(line)
    ########################################
    print("")
    print("\tSetup Complete!")
    print("")
    # print("cd " + darknet_path + "; ./darknet detector train " + objData + " " + objCfg + " " + weight_path + " -dont_show")
    print("")

#########################################################
# Call command function to run the code			#
#########################################################


def call_command(final_command, debug_mode=""):
    """Wrapper for subprocess.check_output that implements error handling"""
    print(f"=== EXECUTING COMMAND ===")
    print(f"Command: {final_command}")
    print(f"=== COMMAND OUTPUT START ===")

    try:
        # Use subprocess to capture output and show it in real-time
        process = subprocess.Popen(final_command, shell=True, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, universal_newlines=True)

        # Print output in real-time
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                print(output.strip())

        # Wait for process to complete
        process.wait()

        print(f"=== COMMAND OUTPUT END ===")
        print(f"Return code: {process.returncode}")

        if process.returncode != 0:
            print(f"Command failed with return code: {process.returncode}")
            sys.exit(1)

    except Exception as err:
        print("EXCEPTION!!!!")
        print('Error (Return Code {})'.format(err.returncode))
        print('Command: {}'.format(err.cmd))
        print('Output: {}'.format(err.output))
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
        elif currentArgument in ("-n", "--name_path"):
            name_path = currentValue
        elif currentArgument in ("-i", "--image_path"):
            image_path = currentValue
        elif currentArgument in ("-p", "--percentage"):
            percentage = currentValue
        elif currentArgument in ("-l", "--log"):
            log_file = currentValue
        elif currentArgument in ("-f", "--darknet_folder"):
            darknet_path = currentValue
        elif currentArgument in ("-w", "--weight_path"):
            weight_path = currentValue
        elif currentArgument in ("-b", "--batch"):
            batch = currentValue
        elif currentArgument in ("-s", "--subdiv"):
            subdiv = currentValue
        elif currentArgument in ("-x", "--width"):
            width = currentValue
        elif currentArgument in ("-y", "--height"):
            height = currentValue
        elif currentArgument in ("-e", "--epochs"):
            epochs = currentValue
        elif currentArgument in ("-I", "--imgsz"):
            imgsz = currentValue
        elif currentArgument in ("-D", "--device"):
            device = currentValue
        elif currentArgument in ("-o", "--adv_options"):
            adv_options = currentValue
        elif currentArgument in ("-t", "--yolo_task"):
            yolo_task = currentValue
        elif currentArgument in ("-m", "--yolo_mode"):
            yolo_mode = currentValue
        elif currentArgument in ("-v", "--yolo_version"):
            yolo_version = int(currentValue)
# Generate Train.txt
    # genTraintxt(data_path)

except getopt.error as err:
    showHelpInfo(err)

else:
    if darknet_path:
        darknet_path = os.path.normpath(darknet_path)
    if data_path:
        data_path = os.path.normpath(data_path)
    if name_path:
        name_path = os.path.normpath(name_path)
    if weight_path:
        weight_path = os.path.normpath(weight_path)
    if log_file:
        log_file = os.path.normpath(log_file)

    print(f"=== VALIDATION CHECKS ===")
    print(f"data_path: {data_path}")
    print(f"yolo_version: {yolo_version}")
    print(f"yolo_task: {yolo_task}")
    print(f"yolo_mode: {yolo_mode}")
    if data_path == "":
        err = "You need more options to run the tool"
        showHelpInfo(err)

if yolo_version == 3:
    if image_path == "":
        err = "You need more options to run the tool"
        showHelpInfo(err)
    elif batch == "":
        err = "You need more options to run the tool"
        showHelpInfo(err)
    elif subdiv == "":
        err = "You need more options to run the tool"
        showHelpInfo(err)
    print("Darknet Version of YOLO Requested:")
    # Generates a train.txt file with all filenames
    genTraintxt(data_path, image_path, percentage)
    # Generates the appropriate configuration Files needed to run Darknet
    createConfig(data_path, batch, subdiv, width, height)

    # Command to start running darknet using the training files
    objData = data_path + '/obj.data'
    objCfg = data_path + '/obj.cfg'

    cmd = "cd " + darknet_path + "; ./darknet detector train " + objData + \
        " " + objCfg + " " + weight_path + " -dont_show 2>&1 >> " + log_file

    print("Darknet Command: ", cmd)
    # process_code,process_output,process_err,process_mix = call_command(cmd)
    call_command(cmd)

elif yolo_version == 5:
    print(f"=== YOLO VERSION 5 PROCESSING ===")
    print(f"darknet_path: {darknet_path}")
    print(f"name_path: {name_path}")
    print(f"data_path: {data_path}")
    print(f"epochs: {epochs}")
    print(f"imgsz: {imgsz}")
    print(f"device: {device}")
    print(f"weight_path: {weight_path}")
    print(f"adv_options: {adv_options}")
    print(f"log_file: {log_file}")
    cmd = ""
    print("Ultralytics Version of YOLO Requested:")

    if weight_path and ("-cls" in os.path.basename(weight_path).lower() or "classify" in os.path.basename(weight_path).lower()):
        if yolo_task != "classify":
            print(f"Auto-correcting yolo_task from '{yolo_task}' to 'classify' based on classification model weights: {weight_path}")
            yolo_task = "classify"

    if yolo_task == "detect":
        # Command to start running ultralytics using the training files
        cmd = darknet_path + " detect train data=" + name_path + " project=" + data_path + " epochs=" + str(epochs) + \
            " imgsz=" + str(imgsz) + " device=" + str(device) + " model=" + \
            weight_path + " " + adv_options + (" 2>&1 >> " + log_file if log_file else "")

    elif yolo_task == "classify":
        cmd = darknet_path + " classify train data=" + data_path + " project=" + data_path + " epochs=" + str(epochs) + \
            " imgsz=" + str(imgsz) + " device=" + str(device) + " model=" + \
            weight_path + " " + adv_options + (" 2>&1 >> " + log_file if log_file else "")
        print(f"Classify command constructed: {cmd}")

    elif yolo_task == "pose":
        cmd = darknet_path + " pose train data=" + name_path + " project=" + data_path + " epochs=" + epochs + \
            " imgsz=" + imgsz + " device=" + device + " model=" + \
            weight_path + " " + adv_options + " 2>&1 >> " + log_file

    elif yolo_task == "segment":
        cmd = darknet_path + " segment train data=" + name_path + " project=" + data_path + " epochs=" + epochs + \
            " imgsz=" + imgsz + " device=" + device + " model=" + \
            weight_path + " " + adv_options + " 2>&1 >> " + log_file

    elif yolo_task == "obb":
        cmd = darknet_path + " obb train data=" + name_path + " project=" + data_path + " epochs=" + epochs + \
            " imgsz=" + imgsz + " device=" + device + " model=" + \
            weight_path + " " + adv_options + " 2>&1 >> " + log_file

    print("YOLO Command: ", cmd)
    print("Running YOLO Task: ", yolo_task)
    # process_code,process_output,process_err,process_mix = call_command(cmd)
    call_command(cmd)

    destination_dir = data_path

    yolo_project_base_dir = data_path

    run_dirs_pattern = os.path.join(yolo_project_base_dir, "train*")
    found_run_dirs = sorted(glob.glob(run_dirs_pattern))

    if not found_run_dirs:
        print(f"""Error: No YOLO run directories (e.g., 'train', 'train2') found in {
              yolo_project_base_dir}. Cannot locate weights.""")
        sys.exit(1)

    latest_yolo_run_dir = found_run_dirs[-1]

    source_weights_dir = os.path.join(latest_yolo_run_dir, "weights")

    if not os.path.exists(source_weights_dir):
        print(f"Error: Weights directory not found: {source_weights_dir}")
        sys.exit(1)

    files_to_move = os.listdir(source_weights_dir)

    for file_name in files_to_move:
        source_path = os.path.join(source_weights_dir, file_name)
        destination_path = os.path.join(destination_dir, file_name)
        shutil.move(source_path, destination_path)

    files_to_move_artifacts = os.listdir(latest_yolo_run_dir)
    excluded_items = ["weights", "args.yaml", "results.csv"]

    for file_name in files_to_move_artifacts:
        if file_name not in excluded_items:
            source_path = os.path.join(latest_yolo_run_dir, file_name)
            destination_path = os.path.join(destination_dir, file_name)

            if os.path.isfile(source_path):
                shutil.move(source_path, destination_path)
            elif os.path.isdir(source_path):
                try:
                    shutil.move(source_path, destination_path)
                except shutil.Error as e:
                    print(f"""Warning: Could not move directory {
                          source_path} to {destination_path}: {e}""")
                    print(
                        "This often happens if the destination directory already exists. Skipping move for this directory.")
            else:
                print(f"Skipping unknown item type: {source_path}")
