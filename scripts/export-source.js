'use strict';

const fs = require('node:fs');
const path = require('node:path');

// 使用明确清单，避免将真实配置、安装包、隧道密钥或日志一起打包。
// 新增交付文件后，请同步更新清单。
const SOURCE_FILES = Object.freeze([
  '.gitignore', '.github/workflows/ci.yml', '.github/workflows/pages.yml',
  'package.json', 'package-lock.json', 'server.js', 'README.md',
  'docs/DEPLOYMENT.md', 'config/systems.example.js',
  'automation/openSystem.js', 'automation/openDemoProgram.js',
  'automation/openExternalBrowser.js', 'automation/openInstaller.js',
  'public/index.html', 'public/style.css', 'public/app.js',
  'public/hosted.js', 'public/hosted.css', 'public/hosted-config.example.json',
  'public/extension-guide.html', 'public/downloads/archive-demo-login-extension.zip',
  'browser-extension/manifest.json', 'browser-extension/systems.js', 'browser-extension/background.js',
  'browser-extension/portal.js', 'browser-extension/content.js', 'browser-extension/login-runner.js',
  'browser-extension/options.html', 'browser-extension/options.js', 'browser-extension/options.css',
  'browser-extension/README.md',
  'scripts/build-extension.js', 'scripts/build-pages.js', 'scripts/check-readiness.js', 'scripts/export-source.js',
  'test/automation.test.js', 'test/externalBrowser.test.js',
  'test/frontend.test.js', 'test/installer.test.js',
  'test/openDemoProgram.test.js', 'test/server.test.js',
  'test/readiness.test.js', 'test/export-source.test.js', 'test/buildPages.test.js', 'test/hostedPortal.test.js',
  'test/browserExtension.test.js'
]);

function exportSource(root = path.resolve(__dirname, '..')) {
  // 先验证全部来源，包括目录，拒绝指向交付目录外的链接。
  for (const relative of SOURCE_FILES) {
    let current = root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('源码清单中存在符号链接，请检查交付文件。');
    }
    if (!fs.statSync(current).isFile()) throw new Error('源码清单中存在非文件项目。');
  }
  const parent = path.join(root, 'dist');
  if (fs.existsSync(parent) && (fs.lstatSync(parent).isSymbolicLink() || !fs.statSync(parent).isDirectory())) {
    throw new Error('dist 必须是项目内的普通目录。');
  }
  fs.mkdirSync(parent, { recursive: true });
  // 每次新建目录，旧文件无法混入新一次交付。
  const destination = fs.mkdtempSync(path.join(parent, 'archive-demo-nav-source-'));
  for (const relative of SOURCE_FILES) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target, fs.constants.COPYFILE_EXCL);
  }
  return destination;
}

if (require.main === module) {
  try {
    const destination = exportSource();
    console.info(`已导出 ${SOURCE_FILES.length} 个源码文件：${destination}`);
    console.info('包含依赖锁文件和 GitHub CI；不包含本机配置、安装包、隧道文件及依赖目录。');
    console.info('将此目录内的文件放在 GitHub 仓库根目录。GitHub 托管源码不会启动公网演示服务。');
  } catch {
    console.error('源码导出失败：请检查清单文件齐全、目录权限正常，且没有符号链接。');
    process.exitCode = 1;
  }
}

module.exports = { SOURCE_FILES, exportSource };
