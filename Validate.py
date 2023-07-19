
# Jonathan Koning
# Validate.py
# This script will convert the classes with spaces to using an underscore syntax

# inputs: Database file,
# outputs: No output


import sys, os
import subprocess
import sqlite3
from zipfile import ZipFile
import glob 
from os.path import basename
import re

def getdbs(dir):
	dbs = []
	projDirs = []
	projs = os.listdir(dir)
	for proj in projs:
		projPath = os.path.join(dir, proj)
		#print(projPath)
		if(os.path.isdir(projPath)):
			files = os.listdir(projPath)
			for filename in files:
				#print(filename)
				if(filename.split('.').pop() == "db"):
					filePath = os.path.join(projPath, filename)
					dbs.append(filePath)
					projDirs.append(projPath)
					continue

	return dbs, projDirs


def classConvert(db):
	cmd = "SELECT CName FROM Classes"
	Classes = db.execute(cmd)
	for row in Classes:
		#print(row[0])
		cName = row[0]
		if(" " in cName):
			newC = cName.strip().replace(" ", "_")
			print(newC)
			cmd = "UPDATE Classes SET CName = '" + newC + "' WHERE CName = '" + cName + "'"
			#print(cmd)
			db.execute(cmd)
			cmd = "UPDATE Labels SET CName = '" + newC + "' WHERE CName = '" + cName + "'"
			#print(cmd)
			db.execute(cmd)
	db.commit()


def validateLabels(db):
	cmd = "SELECT * FROM Labels"
	labels = db.execute(cmd)
	id = 1
	
	newLabels = []
	for row in labels:
		#print(row)
		CName = row[1]
		X = row[2]
		Y = row[3]
		W = row[4]
		H = row[5]
		IName = row[6]
		if(W > 0 and H > 0):
			newLabels.append(row)
	
	cmd = "DELETE FROM Labels"
	db.execute(cmd)

	for label in newLabels:
		CName = label[1]
		X = label[2]
		Y = label[3]
		W = label[4]
		H = label[5]
		IName = label[6]
		cmd = "INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES (" + str(id) + ", '" + CName + "', " + str(X) + ", " + str(Y) + ", " + str(W) + ", " + str(H) + ", '" + IName + "')"
		#print(cmd)
		db.execute(cmd)
		id += 1

	db.commit()


def validateImages(db, ProjDir):
	print(ProjDir)
	imageDir = os.path.join(ProjDir, "images")
	images = os.listdir(imageDir)

	for image in images:
		change = 0
		newName = image
		if(" " in newName):
			newName = newName.replace(" ", "")
			change = 1
		if("+" in newName):
			newName = newName.replace("+", "_")
			change = 1

		if(change != 0):
			IName = os.path.join(imageDir, image)
			newIName = os.path.join(imageDir, newName)
			os.rename(IName, newIName)
			cmd = "UPDATE Images SET IName = '" + newName + "' WHERE IName = '" + image + "'"
			db.execute(cmd)
			cmd = "UPDATE Labels SET IName = '" + newName + "' WHERE IName = '" + image + "'"
			db.execute(cmd)
	
	db.commit()



if __name__ == "__main__":
	#Get paths
	projectDirs = input("Enter path to project directory: ")
	
	databases, projDirs = getdbs(projectDirs)
	
	for i, dbfile in enumerate(databases):
		print(dbfile)
		db = sqlite3.connect(dbfile)
		
		classConvert(db)
		validateLabels(db)
		validateImages(db, projDirs[i])

		db.close()
	
	print("Complete")
