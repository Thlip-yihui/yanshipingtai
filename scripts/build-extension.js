'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'browser-extension');
const destination = path.join(root, 'dist', 'archive-demo-login-extension');
const files = [
  'manifest.json', 'systems.js', 'background.js', 'portal.js', 'content.js',
  'login-runner.js', 'options.html', 'options.js', 'options.css', 'README.md'
];

function buildExtension() {
  for (const file of files) {
    const fullPath = path.join(source, file);
    if (!fs.statSync(fullPath).isFile()) throw new Error('扩展构建文件缺失');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || manifest.content_scripts.length !== 2) {
    throw new Error('扩展清单无效');
  }
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(source, file), path.join(destination, file));
  return destination;
}

if (require.main === module) {
  try {
    const output = buildExtension();
    console.info(`已构建无密码扩展目录：${output}`);
  } catch {
    console.error('扩展构建失败，请检查清单和源文件。');
    process.exitCode = 1;
  }
}

module.exports = { buildExtension, files };
