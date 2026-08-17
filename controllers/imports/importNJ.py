import sqlite3
import shutil
import sys
import os


def help_msg():
    print("\tThe format should be as follows\n \t\tClass X Y W H ImgName\n\t\tIf using the -c flag you can omit the class from the txt file as the flag will append a class to the DB")

    print("\n\tInsert to NJ, The structure for this python call is insertdb.py then you can use the flags below\n")
    print("\t-n\tNjobvu Decision, Example calls -n new or -n existing \n")
    print("\t-t\tBounding Box text file, Example -t <bbox.txt>, should find in {segmentation output}/measurements/{imgname}_bbox.txt\n")
    print("\t-i\tColored Images, Example -i <coloredimg.png> \n")
    print("\t-c\tInput Class Name if not included in the labels file, this will name all labels as that specific class, Example -c <Class Name?\n")
    print("\t-p\tPath to output, Example -p <./test1> \n")
    print("\t-z\tWhat you want the Zip file to be named\n")
    print("\t-C\tWhether you want to use classification, leave empty if no, EX -C <'yes'>\n")
    print("\tExample call: python3 -n <new or existing> -i <img.png> -t <bbox.txt> -p <../Njobvu-AI> -c <Class Name>\n")
    print("\n")


def insert_data(conn, data):
    cursor = conn.cursor()

    # print(data)
    cursor.execute('''
        INSERT INTO Labels (CName, X, Y, W, H, IName)
        VALUES (?, ?, ?, ?, ?, ?)
        ''', data)
    conn.commit()

def read_file_and_store_in_db(project_path, db_name, txt_file, class_label):
    conn = sqlite3.connect(os.path.join(project_path, f'{db_name}.db'))
    with open(txt_file, 'r') as file:
        for line in file:
            line = line.strip()
            if not line: # Skip empty lines
                continue

            parts = []
            try:
                if class_label != '':
                    # Format is: X Y W H IName. We expect 5 parts.
                    parts_from_file = line.split(' ', 4)
                    if len(parts_from_file) != 5:
                        print(f"WARNING: Malformed line (expected 5 parts), skipping: {line}", file=sys.stderr)
                        continue
                    parts = [class_label.replace(' ', '_')] + parts_from_file
                else:
                    # Format is: CName X Y W H IName. We expect 6 parts.
                    parts = line.split(' ', 5)
                    if len(parts) != 6:
                        print(f"WARNING: Malformed line (expected 6 parts), skipping: {line}", file=sys.stderr)
                        continue
                    parts[0] = parts[0].replace(' ', '_')
                
                insert_data(conn, parts)

            except Exception as e:
                print(f"ERROR: Could not process line '{line}'. Error: {e}", file=sys.stderr)

    conn.close()

def findNjProject(nj_project, nj_path):
    #insert based on an input for nj path
    #this might not work due to the fact there is a unique username
    base_path = nj_path

    project_path = os.path.join(base_path,"public/projects" ,nj_project)
    

    if os.path.exists(project_path) and os.path.exists(os.path.join(project_path, f'{nj_project}.db')):
        print(f"Project {nj_project} found at {project_path}")
        return project_path + ".db"
    else:
        print(f"Project {nj_project} not found at {project_path}")
        return ""


def create_project(db_name, txt_file, nj_path, class_label, img_dir, classification):
    print(f"=== create_project called with ===")
    print(f"db_name: '{db_name}'")
    print(f"txt_file: '{txt_file}'")
    print(f"nj_path: '{nj_path}'")
    print(f"class_label: '{class_label}'")
    print(f"img_dir: '{img_dir}'")
    print(f"classification: '{classification}'")
    print(f"==================================")

    # Inserts the project dir
    project_path = nj_path

    unique_classes = set()
    #not working in controller bc normal csv isnt getting class data
    #if there is not a class label set at the command line strip the first line of the txt file which should contain the classes
    if class_label == '':
        with open(txt_file, 'r') as file:
            for line in file:
                data = line.strip().split(' ')
                unique_classes.add(data[0].replace(' ', '_'))
    else:
        unique_classes.add(class_label.replace(' ', '_'))

    os.makedirs(os.path.join(project_path, 'images'), exist_ok=True)
    os.makedirs(os.path.join(project_path, 'bootstrap'), exist_ok=True)
    
    # Create training directory and its subdirectories
    training_path = os.path.join(project_path, 'training')
    os.makedirs(training_path, exist_ok=True)
    os.makedirs(os.path.join(training_path, 'logs'), exist_ok=True)
    os.makedirs(os.path.join(training_path, 'weights'), exist_ok=True)
    os.makedirs(os.path.join(training_path, 'python'), exist_ok=True)
    
    # Create empty path files
    with open(os.path.join(training_path, 'Paths.txt'), 'w') as f:
        pass  # Create empty file
    
    with open(os.path.join(training_path, 'darknetPaths.txt'), 'w') as f:
        pass

    print(f"img_dir: {img_dir}")
    print(f"classification: {classification}")
    
    if classification == '':
        print("Copying images for non-classification mode...")
        for img_name in os.listdir(img_dir):
            src = os.path.join(img_dir, img_name)
            dst = os.path.join(project_path, 'images', img_name)
            if os.path.isfile(src):
                shutil.copy(src,dst)
                print(f"Copied: {src} -> {dst}")
    else:
        print("Copying images for classification mode...")
        for dir_name in os.listdir(img_dir):
            class_path = os.path.join(img_dir, dir_name)
            if os.path.isdir(class_path):
                print(f"Processing class directory: {class_path}")
                class_name = dir_name.replace(' ', '_')
                for img in os.listdir(class_path):
                    src = os.path.join(class_path, img)
                    if os.path.isfile(src):
                        new_img_name = f"{class_name}_{img}"
                        dst = os.path.join(project_path, 'images', new_img_name)
                        shutil.copy(src,dst)
                        print(f"Copied: {src} -> {dst}")

    print(f"this is the db name", db_name);
    print(f"project_path: {project_path}");
    print(f"database file: {os.path.join(project_path, f'{db_name}.db')}");
            
    # Create and populate the database in one step
    conn = sqlite3.connect(os.path.join(project_path, f'{db_name}.db'))
    cursor = conn.cursor()

    print("Creating Classes table...")
    cursor.execute('''
    CREATE TABLE Classes (CName VARCHAR NOT NULL PRIMARY KEY)
    ''')
    #incase of multiple classes
    for val in unique_classes:
        cursor.execute('''
        INSERT INTO Classes (CName)
        VALUES (?)
        ''',(val,))
        conn.commit()
    print(f"Inserted {len(unique_classes)} classes: {list(unique_classes)}")
 
    print("Creating Images table...")
    cursor.execute('''
    CREATE TABLE Images (IName VARCHAR NOT NULL PRIMARY KEY, reviewImage INTEGER NOT NULL DEFAULT 0, validateImage INTEGER NOT NULL DEFAULT 0)
    ''')

    print("Creating Labels table...")
    cursor.execute('''
    CREATE TABLE Labels (LID INTEGER PRIMARY KEY, CName VARCHAR NOT NULL, X INTEGER NOT NULL, Y INTEGER NOT NULL, W INTEGER NOT NULL, H INTEGER NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(CName) REFERENCES Classes(CName), FOREIGN KEY(IName) REFERENCES Images(IName))
    ''')

    print("Creating Validation table...")
    cursor.execute('''
    CREATE TABLE Validation (Confidence INTEGER NOT NULL, LID INTEGER NOT NULL PRIMARY KEY, CName VARCHAR NOT NULL, IName VARCHAR NOT NULL, FOREIGN KEY(LID) REFERENCES Labels(LID), FOREIGN KEY(IName) REFERENCES Images(IName), FOREIGN KEY(CName) REFERENCES Classes(CName))
    ''')
    
    # Insert images into the Images table
    images_count = 0
    for img_name in os.listdir(os.path.join(project_path, 'images')):
        if os.path.isfile(os.path.join(project_path, 'images', img_name)):
            cursor.execute('''
            INSERT INTO Images (IName, reviewImage, validateImage)
            VALUES (?,?,?)
            ''',(img_name, 0, 0))
            conn.commit()
            images_count += 1
    print(f"Inserted {images_count} images into Images table")
    
    # Read and store labels data
    print("Reading labels file and storing data...")
    read_file_and_store_in_db(project_path, db_name, txt_file, class_label)
    
    conn.close()
    print(f"New project created with directory and database: {project_path}")

if __name__ == '__main__':

    db_name = None
    img_dir = None
    txt_file = None
    nj_decision = None
    nj_path = None
    class_label = '' 
    classification = ''
    zip_name = 'default1' 

    #getting all inputs
    for i in range(1, len(sys.argv)):
        if sys.argv[i] == '-n':
            if sys.argv[i + 1] != ("new" or "existing"):
                print("error in -n flag input: required input = 'new' or 'existing'\\n")
            else:
                nj_decision = sys.argv[i+1]
        elif sys.argv[i] == '-i':
            img_dir = sys.argv[i+1]
        elif sys.argv[i] == '-t':
            txt_file = sys.argv[i+1]
        elif sys.argv[i] == '-p':
            nj_path = sys.argv[i+1]
        elif sys.argv[i] == '-h':
            help_msg()
        elif sys.argv[i] == '-c':
            class_label = sys.argv[i+1]
        elif sys.argv[i] == '-C':
            classification = sys.argv[i+1]
        elif sys.argv[i] == '-z':
            zip_name = sys.argv[i+1]
        elif sys.argv[i] == '-d':
            db_name = sys.argv[i+1]

    #Creating new Project
    if nj_decision == "new":
            
        print(f"Using database name: {db_name}")
        create_project(db_name, txt_file, nj_path, class_label, img_dir, classification)

    #Adding to an existing project - Don't know how useful this is yet
    elif nj_decision == "existing":
        #need to enter these values beforehand either in config or cmdline
        nj_userName = input("Enter your Njobvu UserName: \\n")
        nj_project = input("Enter the name of your existing Njobvu project: ")
        result = findNjProject(nj_project,nj_path, nj_userName)
        if result != "":
            read_file_and_store_in_db(result, txt_file)

        if img_dir != None:
            for img_name in os.listdir(img_dir):
                src = os.path.join(img_dir, img_name)
                dst = os.path.join(result, 'images', image_name)
                if os.path.isfile(src):
                    shutil.copy(src,dst)
