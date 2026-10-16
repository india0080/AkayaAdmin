const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');
const tempDir = path.join(__dirname, '..', 'out_temp');

if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
fs.renameSync(outDir, tempDir);

const adminDir = path.join(outDir, 'Admin');
fs.mkdirSync(adminDir, { recursive: true });

for (const item of fs.readdirSync(tempDir)) {
  fs.renameSync(path.join(tempDir, item), path.join(adminDir, item));
}

fs.rmSync(tempDir, { recursive: true });
console.log('Restructured: out/* → out/Admin/*');
