import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// If dist/client exists, copy it to build/client
const distClient = path.join(root, 'dist', 'client');
const buildClient = path.join(root, 'build', 'client');

if (fs.existsSync(distClient)) {
  console.log('Copying dist/client to build/client...');
  fs.mkdirSync(path.dirname(buildClient), { recursive: true });
  fs.cpSync(distClient, buildClient, { recursive: true });
  console.log('Done!');
}
