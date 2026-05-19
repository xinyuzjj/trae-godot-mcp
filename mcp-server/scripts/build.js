import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const buildDir = path.join(__dirname, '..', 'build');
const addonsDir = path.join(buildDir, 'addons', 'trae_mcp');
const sourceAddons = path.join(__dirname, '..', '..', 'godot_plugin', 'addons', 'trae_mcp');

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Copy addon files to build output
if (fs.existsSync(sourceAddons)) {
  if (!fs.existsSync(addonsDir)) {
    fs.mkdirSync(addonsDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceAddons);
  for (const file of files) {
    fs.copyFileSync(
      path.join(sourceAddons, file),
      path.join(addonsDir, file)
    );
  }
  
  console.log('Godot plugin files copied to build output.');
} else {
  console.log('Warning: Godot plugin source not found at', sourceAddons);
}

console.log('Build complete.');
