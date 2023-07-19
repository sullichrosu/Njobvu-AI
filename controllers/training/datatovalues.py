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
image_path = ""
name_path = ""
weight_path = ""
darknet_path = ""
log_file = ""
batch = ""
subdiv = ""
width = ""
height = ""
python_path = ""
python_script = ""
percentage = ""
python_options = ""

# Remove 1st argument from the
# list of command line arguments
argumentList = sys.argv[1:]

# Options
options = "d:i:n:p:l:y:w:b:s:x:t:h"

# Long options
long_options = ["Data Path", "Images Path", "Name Path", "Percentage", "Log Path", "Darknet Path", "Weight Path", "Batch", "Subdivision", "Width", "Height", "Help"]

#########################################################
# Help Information - NOT USED					#
#########################################################
def showHelpInfo(err):
	print ("")
	print ("You did not provide all the needed command line arguments")
	print("")
	print ("Example:")
	print("")
	print ("  datatovalues.py -d <data_path> -n <name_path> -h <help>")
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
	#Finds the number of classes
	z = open(name_path, 'r')
	for line in z:
		classAmount = classAmount + 1
	z.close()

	#Creates template files to overwrite
	objdata = data_path + '/obj.data'
	dataTemp = data_path + '/dataTemplate.txt'
	#Creates obj.data file #################
	# directory = os.listdir('data')
	f = open(objdata, 'w+')
	g = open(dataTemp, 'r')
	#Iterates through every line in the config file and replaces holders with updated information
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


	#Creates yolov4-obj.cfg file #################
	#These are the typical settings needed to run darknet
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
def call_command(final_command, debug_mode = ""):
	# """Wrapper for subprocess.check_output that implements error handling"""
	try:
		os.system(final_command)

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
		elif currentArgument in ("-n", "--name_path"):
			name_path = currentValue
		elif currentArgument in ("-i", "--image_path"):
			image_path = currentValue
		elif currentArgument in ("-p", "--percentage"):
			percentage = currentValue
		elif currentArgument in ("-l", "--log"):
			log_file = currentValue
		elif currentArgument in ("-y", "--darknet_path"):
			darknet_path = currentValue
		elif currentArgument in ("-w", "--weight_path"):
			weight_path = currentValue
		elif currentArgument in ("-b", "--batch"):
			batch = currentValue
		elif currentArgument in ("-s", "--subdiv"):
			subdiv = currentValue
		elif currentArgument in ("-x", "--width"):
			width = currentValue
		elif currentArgument in ("-t", "--height"):
			height = currentValue
#Generate Train.txt
	# genTraintxt(data_path)

except getopt.error as err:
	showHelpInfo(err)

else:
	if data_path == "":
		err = "You need more options to run the tool"
		showHelpInfo(err)
	elif image_path == "":
		err = "You need more options to run the tool"
		showHelpInfo(err)
	elif batch == "":
		err = "You need more options to run the tool"
		showHelpInfo(err)
	elif subdiv == "":
		err = "You need more options to run the tool"
		showHelpInfo(err)

#Generates a train.txt file with all filenames
genTraintxt(data_path, image_path, percentage)
#Generates the appropriate configuration Files needed to run Darknet
createConfig(data_path, batch, subdiv, width, height)

#Command to start running darknet using the training files
objData = data_path + '/obj.data'
objCfg = data_path + '/obj.cfg'

cmd = "cd " + darknet_path + "; ./darknet detector train " + objData + " " + objCfg + " " + weight_path + " -dont_show 2>&1 > " + log_file
print("cd " + darknet_path + "; ./darknet detector train " + objData + " " + objCfg + " " + weight_path + " -dont_show")


# process_code,process_output,process_err,process_mix = call_command(cmd)
call_command(cmd)

	

