#! python3
# Jonathan Koning
# dbconverter.py
# This script will convert the old labeling tool database with login to the new multi-db format
# into an importable format for the latest version of the labeling tool

# inputs: Database file, path to old projects
# outputs: A zip file for each project. Each zip file will contain the images and dump file for each project


import sys, os
import subprocess
import sqlite3
from zipfile import ZipFile
import glob 
from os.path import basename

def getInput():
	#get database file
	check = ""
	db = ""
	while(check != "yes" and check != "y" and check != "Y" and check != "Yes"):
		db = input("Enter path to .db file: ")
		check = input(db+ "\nIs this the database you want to convert? (yes/no): ")
	
	#get path to projects directory
	check = ""
	path = ""
	while(check != "yes" and check != "y" and check != "Y" and check != "Yes"):
		path = input("Enter path to old projects directory: ")
		check = input(path + "\nIs this the correct path? (yes/no): ")

	last_project = input("Enter the name of the last project made (leave blank to make all projects): ")

	return db, path, last_project


def createDB(PName):
	newDB = PName + '.db'
	f = open(newDB, "w+")
	f.close()
	print("db created")
	return newDB

	
def createTables(newDB):
	newDB.execute('''CREATE TABLE Classes (CName VARCHAR NOT NULL PRIMARY KEY);''')
	newDB.execute('''CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0);''')
	newDB.execute('''CREATE TABLE Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X INTEGER NOT NULL, Y INTEGER NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName));''')
	print("tables Created")


def addData(oldDB, newDB, PID):
	# Classes Table
	cmd = "SELECT CName from Classes where PID = " + str(PID)
	Classes = oldDB.execute(cmd)
	
	for row in Classes:
		cmd = "INSERT INTO Classes (CName) VALUES ("+row[0]+");"
		#print(cmd)
		newDB.execute("INSERT INTO Classes (CName) VALUES ('"+str(row[0])+"');")
		#print(row[0] + " class added")
	print("Classes added")

	#Images Table
	cmd = "SELECT IName, IID from Images where PID = " + str(PID)
	Images = oldDB.execute(cmd)
	LID = 1
	for row in Images:
		IName = row[0]
		IID = row[1]
	
		cmd = "INSERT INTO Images (IName) VALUES ('"+str(IName)+"');"
		newDB.execute(cmd)

		#Labels Table
		cmd = "SELECT X, Y, W, H, CStaticID, CID from Labels where IID = " + str(IID)
		Labels = oldDB.execute(cmd)
		for lrow in Labels:
			X = lrow[0]
			Y = lrow[1]
			W = lrow[2]
			H = lrow[3]
			CStaticID = lrow[4]
			CID = lrow[5]
			cmd = "SELECT CName from Classes where CID = " + str(CID)
			Class = oldDB.execute(cmd)
			for crow in Class:
				CName = crow[0]
				cmd = "INSERT INTO Labels (LID, CName, X, Y, W, H, IName) VALUES(" +str(LID)+ ", '" +str(CName)+"', " +str(X)+ ", " +str(Y)+ ", " +str(W)+ ", " +str(H)+ ", '" +IName+ "');"
				
				try:
					newDB.execute(cmd)
				except:
					print("An error occured at: ", cmd)
					quit()
			LID += 1

	newDB.commit()

'''
def createDump(dbfile, PName):
	dump = PName + ".dump"
	#subprocess.call(["sqlite3", dbfile, ".dump", ">", dump])
	cmd = "sqlite3 " + dbfile + " .dump > " + dump
	os.system(cmd)
	print("dump created")
'''

def getFiles(dir):
	filePaths = []
	for root, directories, files in os.walk(dir):
		for filename in files:
			filePath = os.path.join(root, filename)
			filePaths.append(filePath)
	return filePaths

def compress(files, PName, db, pPath):
	#dump = PName + ".dump"
	zfile = ZipFile(PName + ".zip", 'w')
	
	lenDirPath = len(pPath)
	#write zipfile
	with zfile:
		for file in files:
			zfile.write(file, file[lenDirPath :])
		zfile.write(db, basename(db))
	'''
	with ZipFile(zfile, 'r') as zip:
		for info in zip.infolist():
			print(info.filename)
	'''
	#print("Success. You can now import " + zfile)


if __name__ == "__main__":
	#Get paths
	dbfile, pDirectory, last_project = getInput()
	print("last_project: ", last_project)
	found = 0
	if(len(last_project) == 0):
		found = 1

	oldDB = sqlite3.connect(dbfile)

	Projects = oldDB.execute("SELECT PID, PName from Projects")
	for row in Projects:
		PID = row[0]
		PName = row[1]
		
		print("PName: ", PName)
		if(found == 0):
			print("found = 0")
			if(PName == last_project):
				found = 1
				print("found = 1")
			continue
		#Creat new database file for project
		newDBfile = createDB(PName)
		newDB = sqlite3.connect(newDBfile)
		#newDB.cursor()

		#Add the tables
		createTables(newDB)
		
		#Copy data from old database to new database
		addData(oldDB, newDB, PID)
		newDB.close()
		#createDump(newDBfile, PName) #Labeling tool no longer uses dumpfiles
		
		#Create new directory structure
		pPath = os.path.join(pDirectory, str(PID))
		files = getFiles(pPath)
		compress(files, PName, newDBfile, pPath)
	
	oldDB.close()
	print("All projects converted")


		






















