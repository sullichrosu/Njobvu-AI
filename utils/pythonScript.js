const path = require("path");
const { exec } = require("child_process");



async function pythonScript(inputDir, outputDir, runType, db_name) {
    const pyScript = path.join(
        __dirname,
        "../controllers/imports/import_options.py",
    );

    const command = `${pythonPath} ${pyScript} -i ${inputDir} -o ${outputDir} -d ${db_name} -r ${runType}`;

    console.log("python", pyScript);
    console.log("command", command);

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error running python script: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.error(`stderr: ${stderr}`);
                return;
            }
            console.log(`stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}

module.exports = pythonScript;
