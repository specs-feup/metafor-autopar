import child_process from 'child_process';

export default class ISLCaller {
    static async spawnPython(input: any) {
        return new Promise((resolve, reject) => {
            // Point this to your specific python executable/venv
            const python = child_process.spawn('/home/onso/isl-script/bin/python3', ['/home/onso/isl-script/mhmm.py']);
    
            let outputData = '';
            let errorData = '';
    
            // 1. Capture stdout
            python.stdout.on('data', (data) => {
                outputData += data.toString();
            });
    
            // 2. Capture stderr
            python.stderr.on('data', (data) => {
                errorData += data.toString();
            });
    
            // 3. Handle process completion
            python.on('close', (code) => {
                if (code !== 0) {
                    reject(`Python error (code ${code}): ${errorData}`);
                    return;
                }
                try {
                    resolve(JSON.parse(outputData));
                } catch (e) {
                    reject(`Failed to parse Python output: ${outputData}`);
                }
            });
    
            // 4. Pipe the data into Python's stdin
            python.stdin.write(JSON.stringify(input));
            python.stdin.end();
        });
    }
}