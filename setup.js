import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const engineDir = path.join(__dirname, 'isl-engine');
const venvDir = path.join(engineDir, 'venv');

console.log("Setting up Python ISL environment...");

if (!fs.existsSync(venvDir)) {
    // Create the virtual environment
    execSync('python3 -m venv venv', { cwd: engineDir, stdio: 'inherit' });
}

// Install requirements using the venv's pip
const pipPath = process.platform === "win32" 
    ? path.join(venvDir, 'Scripts', 'pip') 
    : path.join(venvDir, 'bin', 'pip');

execSync(`${pipPath} install -r requirements.txt`, { cwd: engineDir, stdio: 'inherit' });

console.log("Python environment ready!");