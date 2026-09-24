'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_FILES = Object.freeze([
  ['public/hosted.html', 'index.html'],
  ['public/hosted.js', 'hosted.js'],
  ['public/hosted.css', 'hosted.css'],
  ['public/style.css', 'style.css']
]);
const BUILD_MARKER = '.archive-demo-pages-generated';

function normalizeDesktopUrl(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.trim() !== value) throw new Error('DEMO_DESKTOP_URL 格式不正确');
  let target;
  try { target = new URL(value); } catch { throw new Error('DEMO_DESKTOP_URL 格式不正确'); }
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('DEMO_DESKTOP_URL 必须是无账号密码的 HTTPS 远程桌面地址');
  }
  return target.href;
}

function buildPages({ projectRoot = path.resolve(__dirname, '..'), outputDirectory, desktopUrl = '' } = {}) {
  const destination = outputDirectory || path.join(projectRoot, 'dist', 'pages');
  const normalizedUrl = normalizeDesktopUrl(desktopUrl);
  for (const [source] of PUBLIC_FILES) {
    if (!fs.statSync(path.join(projectRoot, source)).isFile()) throw new Error('GitHub Pages 静态文件缺失');
  }
  const configSource = path.join(projectRoot, 'public', 'hosted-config.example.json');
  if (!fs.statSync(configSource).isFile()) throw new Error('GitHub Pages 配置模板缺失');
  if (fs.existsSync(destination)) {
    const marker = path.join(destination, BUILD_MARKER);
    if (fs.lstatSync(destination).isSymbolicLink() || !fs.statSync(destination).isDirectory() ||
      !fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() || !fs.statSync(marker).isFile() ||
      fs.readFileSync(marker, 'utf8') !== 'archive-demo-nav GitHub Pages build v1\n') {
      throw new Error('GitHub Pages 输出目录已存在且不属于该构建工具，未修改现有文件');
    }
    fs.rmSync(destination, { recursive: true });
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const [source, target] of PUBLIC_FILES) {
    fs.copyFileSync(path.join(projectRoot, source), path.join(destination, target), fs.constants.COPYFILE_EXCL);
  }
  fs.writeFileSync(path.join(destination, 'demo-config.json'), `${JSON.stringify({ desktopUrl: normalizedUrl })}\n`, {
    encoding: 'utf8', flag: 'wx'
  });
  fs.writeFileSync(path.join(destination, BUILD_MARKER), 'archive-demo-nav GitHub Pages build v1\n', { encoding: 'utf8', flag: 'wx' });
  return { destination, remoteDesktopConfigured: Boolean(normalizedUrl) };
}

if (require.main === module) {
  try {
    const result = buildPages({ desktopUrl: process.env.DEMO_DESKTOP_URL || '' });
    console.info(`GitHub Pages 静态站点已构建：${result.destination}`);
    console.info(result.remoteDesktopConfigured
      ? '已配置 HTTPS 远程桌面入口。'
      : '远程桌面未配置：6 个公网网页链接仍可直达；密集架和艾搜需要专用网络或 Windows 桌面。请按需设置 DEMO_DESKTOP_URL。');
  } catch (error) {
    console.error(`GitHub Pages 构建失败：${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildPages, normalizeDesktopUrl, PUBLIC_FILES };
