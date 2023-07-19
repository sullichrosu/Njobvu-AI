import os, sys
import json
import webbrowser
from subprocess import call

with open('controllers/training/config.json', 'r') as file:
	data=file.read()

obj = json.loads(data)
port = obj['port']
hostname = obj['hostname']

url = str(hostname) + ":" + str(port)
#print(url)
webbrowser.open_new_tab(url)
# webbrowser.open_new_tab('http://localhost:8081')
call(["node","server.js"])