import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const winVenvPython = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
const unixVenvPython = path.join(rootDir, '.venv', 'bin', 'python');

const pythonBin = fs.existsSync(winVenvPython)
  ? winVenvPython
  : fs.existsSync(unixVenvPython)
  ? unixVenvPython
  : 'python3';

const scriptPath = path.join(__dirname, 'generate-audio.py');
const result = spawnSync(pythonBin, [scriptPath, ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (result.error) {
  console.error('[audio:generate] Erreur lors du lancement de Python :', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
