#!/usr/bin/python3
#########################################################
#  OSU Labeling Tool
#
#  Copyright 2021
#
#  John S. Koning
#  Christopher M. Sullivan
#  Pankaj Jaiswal
#  Robyn L. Tanguay
#
#  Department of Environmental and Molecular Toxicology
#  Department of Botany and Plant Pathology
#  Center for Genome Research and Biocomputing
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
python_path = ""
python_script = ""
python_options = ""
logfile_path = ""
debug_mode = ""

# Remove 1st argument from the
# list of command line arguments
argumentList = sys.argv[1:]

# Options
options = "p:s:o:l:dh"

# Long options
long_options = ["Python Path", "Python Script", "Python Options", "Log File", "Debug Mode", "Help"]

#########################################################
# Help Information					#
#########################################################
def showHelpInfo(err):
    print ("")
    print ("You did not provide all the needed command line arguments")
    print ("Example:")
    print ("  train_data_from_project.py -p <python_path> -s <python_script> -o <python_options> -d <debug_mode> -h <help>")
    print ("")
    print ("  -p\tSet the python path to be used for the script.")
    print ("  -s\tThe script you want to run through the system.")
    print ("  -o\tOptions for the script (please use \"\" around the options).")
    print ("  -l\tLog file name (include fully qualified path)")
    print ("  -d\tDebug mode - Show STDERR in output.")
    print ("  -h\tHelp message.")
    print ("")	 
    print ("ERROR:")   
    print (err)   
    print ("")	 
    print ("")
    print ("")
    exit(1)

#########################################################
# Get configuration data from file			#
#########################################################
def getVarFromFile(filename):
    import imp
    f = open(filename)
    global data
    data = imp.load_source('data', '', f)
    f.close()

#getVarFromFile(directory_path + 'LabelingTool.conf')

#########################################################
# Call command function to run the code			#
#########################################################
def call_command(*args, **kwargs):
	"""Wrapper for subprocess.check_output that implements error handling"""
	try:
		os.environ['PYTHONUNBUFFERED'] = "1"
		proc = subprocess.Popen(final_command,
					stdout = subprocess.PIPE,
					stderr = subprocess.PIPE,
					universal_newlines = True
					)
		stdout = []
		stderr = []
		mix = []
		# std_out, std_err = proc.communicate()
		
		while proc.poll() is None:
			line = proc.stdout.readline()
			if line != "":
				stdout.append(line)
				mix.append(line)
				f = open(logfile_path, "a")
				f.write(line)
				f.close()
				print(line, end='')

			if debug_mode != "":
				line = proc.stderr.readline()
				if line != "":
					stderr.append(line)
					mix.append(line)
					f = open(logfile_path, "a")
					f.write(line)
					f.close()
					print(line, end='')

		std_out, std_err = proc.communicate()
		if(proc.returncode != 0):
			print(std_err, file=sys.stderr)
		# 	err_msg = "%s. Code: %s" % (std_err.strip(), proc.returncode)
			# raise Exception(err_msg)
			#sys.exit(1)

		return proc.returncode, stdout, stderr, mix
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
		elif currentArgument in ("-p", "--python_path"):
			python_path = currentValue
		elif currentArgument in ("-s", "--python_script"):
			python_script = currentValue
		elif currentArgument in ("-o", "--python_options"):
			python_options = currentValue
		elif currentArgument in ("-l", "--logfile"):
			logfile_path = currentValue
		elif currentArgument in ("-d", "--debug_mode"):
			debug_mode = "DEBUG"
	     

except getopt.error as err:
	showHelpInfo(err)

else:
	if python_script == "":
		err = "You need more options to run the tool"
		showHelpInfo(err)
	# Build a final command that will be sent to the call_command function	
	final_command = [python_path, python_script]

	if python_options != "EMPTY":
		python_option = (python_options.split(' '))

		# Loop through the options and append them to the final command
		for option in python_option:
			final_command.append(option)
	else:
		python_option = ' '


	# If we have a python path in the config file override it from the web
	#if len(data.default_python_path) > 0:
	#	python_path = data.default_python_path

	print ("Python Path: "+str(python_path)+"\t")
	print ("Python Script: "+str(python_script)+"\t")
	if python_options != "EMPTY":
		print ("Python Option: "+str(python_option)+"\n")

	# Run the call_command function and return the output from the process
	print ("Process Output:")
	process_code,process_output,process_err,process_mix = call_command(final_command)
	print(process_code)
	print(process_output)
	print(process_err)
	print(process_mix)
	

