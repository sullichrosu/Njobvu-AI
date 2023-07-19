from PyQt5 import QtCore
from PyQt5 import QtGui
from PyQt5.QtCore import pyqtProperty
from PyQt5 import QtCore, QtWidgets
#from PyQt5.QtWidgets import QApplication, QHBoxLayout, QWidget, QPushButton
from PyQt5.QtWidgets import *
from PyQt5.QtGui import QIcon
from PyQt5.QtCore import *
from PyQt5.QtGui import QPixmap
import webbrowser
import sys,os
import subprocess

class QIComboBox(QtWidgets.QComboBox):
	def __init__(self,parent=None):
		super(QIComboBox, self).__init__(parent)


class MagicWizard(QtWidgets.QWizard):
	NUM_PAGES = 4
	(Welcome_page, Validate_page, WNode_page, wPackage_page) = range(NUM_PAGES)
	
	def __init__(self, parent=None):
		super(MagicWizard, self).__init__(parent)

		self.setPage(self.Welcome_page, Welcome(self))
		self.setPage(self.Validate_page,Validate())
		self.setPage(self.WNode_page,winNode())
		#self.setPage(self.MNode_page,macNode())
		#self.setPage(self.page_two,Page2())
		self.setPage(self.wPackage_page,install_packages())
		
		self.setStartId(self.Welcome_page)
		self.setWindowTitle("OSU Labeling-Tool Installer")
		

class Welcome(QtWidgets.QWizardPage):
	
	def __init__(self, parent=None):
		super(Welcome, self).__init__(parent)
		self.label1 = QtWidgets.QLabel()
		self.label2 = QtWidgets.QLabel()
		self.label3 = QtWidgets.QLabel()
		
		layout = QtWidgets.QVBoxLayout()
		layout.addWidget(self.label1)
		layout.addWidget(self.label2)
		layout.addWidget(self.label3)
		#self.test = subprocess.call('npm -v', shell=True, stderr=subprocess.STDOUT)
		self.setLayout(layout)

	def initializePage(self):
		self.label1.setText("Thank you for installing OSU Labeling-Tool")
		self.label2.setText("This installer has only been tesed on Windows 10 and is not guaranteed to work on other verions")
		self.label3.setText("Please select next and follow the promps to finish installation")
	
	def nextId(self):
		#test = subprocess.call('npm -v', shell=True, stderr=subprocess.STDOUT)
		#if(self.test != 0):
		#	return MagicWizard.WNode_page

		#Validate all files in main directory
		return MagicWizard.Validate_page
		
class Validate(QtWidgets.QWizardPage):
	
	def __init__(self, parent=None):
		super(Validate, self).__init__(parent)
		self.label1 = QtWidgets.QLabel()
		layout = QtWidgets.QVBoxLayout()
		layout.addWidget(self.label1)
		self.initUI()
		self.setLayout(layout)

	def initUI(self):
		print("Validate")
		#msg =  QMessageBox()
		#msg.setIcon(QMessageBox.Information)
		#msg.setDetailedText("You are missing the following files/directories: \n")
		#self.output =  QTextEdit()
		#self.setGeometry(100, 60, 1000, 800)
		#layout.addWidget(self.output)
		#centralWidget =  QWidget()
		#centralWidget.setLayout(layout)
		#self.setCentralWidget(centralWidget)
		#self.setCentralWidget(centralWidget)
		#directory_path = os.path.dirname(os.path.realpath(__file__)) + '/'
		directory_path = os.path.abspath(os.getcwd()) + '/'
		print(directory_path)
		mainFiles = ['server.js', 'package.json', 'package-lock.json', 'mkshortcut.vbs']
		mainDirs = ['controllers', 'data', 'db', 'public', 'routes', 'views']
		contDirs = ['controllers/training']
		dataFiles = ['data/colors.json']
		dbFiles = ['db/manage.db']
		publicDirs = ['public/css', 'public/js', 'public/libraries', 'public/projects']
		pubCssFiles = ['public/css/style.css']
		pubJsFiles = ['public/js/flabeling.js', 'public/js/home.js']
		routesFiles = ['routes/api.js', 'routes/pages.js']
		viewsFiles = ['views/404.ejs', 'views/config.ejs', 'views/create.ejs', 'views/download.ejs', 'views/home.ejs', 'views/labeling.ejs', 'views/login.ejs', 'views/project.ejs', 'views/signup.ejs', 'views/stats.ejs', 'views/training.ejs', 'views/yolo.ejs']
		
		files = []
		files.append(mainFiles)
		files.append(mainDirs)
		files.append(contDirs)
		files.append(dataFiles)
		files.append(dbFiles)
		files.append(publicDirs)
		files.append(pubCssFiles)
		files.append(pubJsFiles)
		files.append(routesFiles)
		files.append(viewsFiles)

		self.missingFiles = 0
		self.mFilesText = "You are missing the following files:\n"
		#cursor = self.output.textCursor()
		for i in range(len(files)):
			for j in range(len(files[i])):
				#print(directory_path + '../' + files[i][j])
				if(not os.path.exists(directory_path + files[i][j])):
					#print(directory_path + files[i][j] + " exists")
				
					self.missingFiles = 1
					#cursor.movePosition(cursor.End)
					text = "the file: " + files[i][j] + " is missing\n"
					self.mFilesText += text
					#msg.setDetailedText(text)
					#cursor.insertText(text)
					#self.output.ensureCursorVisible()
		#retval = msg.exec_()
		self.testNPM = subprocess.call('npm -v', shell=True, stderr=subprocess.STDOUT)
		self.testPython = subprocess.call('python -V', shell=True, stderr=subprocess.STDOUT)

	def initializePage(self):
		if(self.missingFiles != 0):
			self.label1.setText(self.mFilesText)
		elif(self.testNPM != 0):
			self.label1.setText("You do not have Nodejs installed or added to your path.\nPlease click Next to install Nodejs")
		elif(self.testPython != 0):
			self.label1.setText("You do not have python installed or added to your path.\nPlease install Python 3")
		else:
			self.label1.setText("All files have been validated. If installation fails, please check your c++ compiler")
	#	self.label2.setText("This installer has only been tesed on Windows 10 and is not guaranteed to work on other verions")
	#	self.label3.setText("Please select next and follow the promps to finish installation")
	
	def nextId(self):
		#Validate all files in main directory
		#files = ['server.js', 'package.json', 'package-lock.json']
		if(self.missingFiles != 0):
			return -1
		elif(self.testNPM != 0):
			return MagicWizard.WNode_page
		elif(self.testPython != 0):
			return -1
			
		return MagicWizard.wPackage_page
	

class winNode(QtWidgets.QWizardPage):

	def __init__(self, parent=None):
		super(winNode,self).__init__(parent)
		self.label1 = QtWidgets.QLabel()
		self.label2 = QtWidgets.QLabel()
		Node = QPushButton('Install Nodejs', self)
		Node.setToolTip('Install Nodejs')
		Node.move(100,70)
		Node.clicked.connect(self.on_Install)
		layout = QtWidgets.QVBoxLayout()
		layout.addWidget(self.label1)
		layout.addWidget(self.label2)	
		layout.addWidget(Node)
		self.setLayout(layout)
	def on_Install(self):
		webbrowser.open_new_tab('https://nodejs.org')
		sys.exit(app.exec_())

	def initializePage(self):
		self.label1.setText("It looks like you do not have Nodejs installed.")
		self.label2.setText("Please install Nodejs then restart this installer.")
	def nextId(self):
		return -1
		



class install_packages(QtWidgets.QWizardPage):
	def __init__(self, parent=None):
		super(install_packages,self).__init__(parent)
		self.label1 = QtWidgets.QLabel()
		
		Node = QPushButton('Install packages', self)
		Node.setToolTip('Install packages')
		Node.move(100,70)
		Node.clicked.connect(self.on_Install)
		layout = QtWidgets.QVBoxLayout()
		layout.addWidget(self.label1)	
		layout.addWidget(Node)
		self.setLayout(layout)
	
	def on_Install(self):
		os.system('npm i')
		os.system('npm i --save sqlite3')
		user = os.environ['USERPROFILE']
		os.system('mkshortcut.vbs /target:Labeling-Tool.exe /shortcut:Labeling-Tool')
		move1 = 'IF EXIST ' + user + '\Desktop' + ' (MOVE labeling-tool.lnk ' + user + '\Desktop)'
		move2 = ' ELSE IF EXIST ' + user + '\onedrive\Desktop' + ' (MOVE labeling-tool.lnk ' + user + '\onedrive\Desktop)'
		move = move1 + move2
		os.system(move)
		

	def initializePage(self):
		self.label1.setText("Please install the node packages")

	def nextId(self):
		
		return -1


if __name__ == '__main__':
	app = QtWidgets.QApplication(sys.argv)
	wizard = MagicWizard()
	wizard.show()
	sys.exit(app.exec_())