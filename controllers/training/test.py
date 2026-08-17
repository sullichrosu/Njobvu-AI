#!/usr/bin/python
import time
import glob
import os
import sys

try:
        sys.argv[1]
        sys.argv[2]
        sys.argv[3]

except:
        print ("")
        print ("You did not provide all the needed command line arguments")
        print ("Example:")
        print (" Test.py <1> <2> <3>")
        print ("")

else:
	one = sys.argv[1]
	two = sys.argv[2]
	three = sys.argv[3]

	print ("Test Python 1: " + str(one)+"\t")
	print ("Test Python 2: " + str(two)+"\t")
	print ("Test Python 3: " + str(three)+"\n")



