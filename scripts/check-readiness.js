'use strict';

// 只检查配置、文件和可选 HTTP 响应；绝不启动浏览器、安装包或隧道。
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const NETWORK_TIMEOUT_MS = 12000;
const NETWORK_CONCURRENCY = 3;
const ARCHITECTURE_MESSAGE = '当前为本机桌面模式：浏览器、隧道和安装程序均在运行 Node.js 的电脑上打开。外网演示需要另行部署带身份认证的远程桌面网关及可交互的 Windows 演示主机；仅上传 GitHub 或启用 GitHub Pages 无法让同事操作这些窗口。';

function isFile(fileSystem, target) {
  try { return Boolean(target) && fileSystem.statSync(target).isFile(); } catch { return false; }
}

function isDirectory(fileSystem, target) {
  try { return Boolean(target) && fileSystem.statSync(target).isDirectory(); } catch { return false; }
}

function browserCandidates(channel, platform, env) {
  if (!['chrome', 'msedge'].includes(channel)) return [];
  if (platform === 'win32') {
    const suffix = channel === 'chrome' ? ['Google', 'Chrome', 'Application', 'chrome.exe'] : ['Microsoft', 'Edge', 'Application', 'msedge.exe'];
    return [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.ProgramFiles, env['ProgramFiles(x86)']]
      .filter(Boolean).map(root => path.win32.join(root, ...suffix));
  }
  if (platform === 'darwin') return [channel === 'chrome'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  if (platform === 'linux') return [channel === 'chrome' ? '/opt/google/chrome/chrome' : '/opt/microsoft/msedge/msedge'];
  return [];
}

function checkBrowser({ platform = process.platform, env = process.env, fileSystem = fs, loadChromium = () => require('playwright').chromium } = {}) {
  let chromium;
  try { chromium = loadChromium(); } catch {
    return { level: 'error', message: '无法加载 Playwright，请先运行 npm ci。' };
  }
  const channel = env.PLAYWRIGHT_CHANNEL;
  if (channel && !['chrome', 'msedge'].includes(channel)) {
    return { level: 'error', message: 'PLAYWRIGHT_CHANNEL 仅支持 chrome 或 msedge；请修正或清除该变量。' };
  }
  if (channel) {
    return browserCandidates(channel, platform, env).some(candidate => isFile(fileSystem, candidate))
      ? { level: 'pass', message: '已找到指定浏览器的程序文件；未验证启动权限或桌面会话。' }
      : { level: 'error', message: '未找到 PLAYWRIGHT_CHANNEL 指定的浏览器文件，请安装对应浏览器，或清除变量并安装 Playwright Chromium。' };
  }
  let executable;
  try { executable = chromium.executablePath(); } catch { /* 不输出可能包含私有路径的异常。 */ }
  return isFile(fileSystem, executable)
    ? { level: 'pass', message: '已找到 Playwright Chromium 程序文件；未验证启动权限或桌面会话。' }
    : { level: 'error', message: '未找到 Playwright Chromium，请运行 npx playwright install chromium。' };
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || /^(fc|fd)[0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254));
}

function probeUrl(rawUrl, { timeoutMs = NETWORK_TIMEOUT_MS, getHttp = http.get, getHttps = https.get } = {}) {
  let target;
  try { target = new URL(rawUrl); } catch {
    return Promise.resolve({ level: 'error', message: '网址格式错误，未发起请求。' });
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    return Promise.resolve({ level: 'error', message: '网址必须为不含账号密码的 HTTP/HTTPS 地址，未发起请求。' });
  }
  const privateHost = isPrivateHost(target.hostname);
  // GET 不携带配置账号、密码或 Cookie；不跟随重定向，不读取响应正文。
  return new Promise(resolve => {
    let request;
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish({ level: 'error', message: privateHost ? '内网地址不可达或响应超时；请检查演示主机的局域网/隧道。' : '网络请求超时；请检查目标服务器和网络。' });
      request?.destroy();
    }, timeoutMs);
    try {
      request = (target.protocol === 'https:' ? getHttps : getHttp)(target, {
        method: 'GET', agent: false, headers: { 'User-Agent': 'ArchiveDemoReadiness/1.0', Connection: 'close' }
      }, response => {
        const status = response.statusCode;
        response.on('error', () => {});
        response.destroy();
        request?.destroy();
        if (Number.isInteger(status) && status >= 200 && status < 400) {
          finish({ level: 'pass', message: `HTTP ${status} 有响应${status >= 300 ? '（未跟随跳转）' : ''}；仅验证连通性，未验证登录或业务功能。` });
        } else {
          finish({ level: 'error', message: `目标返回 HTTP ${Number.isInteger(status) ? status : '未知'}；未验证登录，请检查目标系统。` });
        }
      });
      request.on('error', () => finish({ level: 'error', message: privateHost
        ? '内网地址不可达；请检查演示主机的局域网/隧道。'
        : '网络连接失败；请检查目标服务器、DNS、防火墙或证书。' }));
    } catch {
      finish({ level: 'error', message: '网络检查失败，请检查网址和运行环境。' });
      request?.destroy();
    }
  });
}

async function mapLimited(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

async function runReadiness(options = {}, dependencies = {}) {
  const fileSystem = dependencies.fileSystem || fs;
  const platform = dependencies.platform || process.platform;
  const entries = [];
  const add = (level, subject, message) => entries.push({ level, subject, message });
  add(options.public ? 'error' : 'warning', '外网演示', ARCHITECTURE_MESSAGE);
  const result = () => ({ exitCode: entries.some(entry => entry.level === 'error') ? 1 : 0, entries });
  let systems;
  try {
    const loadSystems = dependencies.loadSystems || (() => require('../config/systems'));
    systems = loadSystems();
  } catch {
    add('error', '系统配置', '无法读取本地系统配置。请复制 config/systems.example.js 为 config/systems.js，并私下填写配置；不得提交账号密码。');
    return result();
  }
  try {
    const validate = dependencies.validateSystems || require('../server').validateSystems;
    validate(systems);
    if (!systems.length) throw new Error('empty');
  } catch {
    add('error', '系统配置', '系统配置无效或依赖未安装。请检查系统数组、唯一 id、名称、网址、enabled、登录字段和外部程序配置，并运行 npm ci。');
    return result();
  }
  add('pass', '系统配置', `已读取 ${systems.length} 项配置，其中 ${systems.filter(system => system.enabled).length} 项启用。`);
  const networkTargets = [];
  let needsChromium = false;
  for (const system of systems) {
    // 只显示系统名称与诊断，不显示网址、账号、密码、路径或原始异常。
    const subject = system.name.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 100);
    if (!system.enabled) {
      add('error', subject, '系统未启用，不能作为可演示系统验收。');
      continue;
    }
    const launchers = [system.externalDemo, system.externalBrowser, system.externalInstaller].filter(Boolean);
    if (launchers.length > 1) add('error', subject, '同时配置了多种外部启动方式，请保留一种。');
    const webLogin = !system.externalInstaller && !system.externalBrowser;
    if (webLogin) {
      needsChromium = true;
      if (!system.url.trim()) add('error', subject, '网址未配置。');
      if (!system.username.trim() || !system.password.trim()) add('error', subject, '账号或密码未配置。');
      if (system.url.trim() && system.username.trim() && system.password.trim()) add('pass', subject, '网址和登录资料已填写；未验证账号密码是否有效。');
    }
    for (const [key, label] of [['externalDemo', '演示程序'], ['externalBrowser', '专用浏览器'], ['externalInstaller', '客户端安装包']]) {
      const config = system[key];
      if (!config) continue;
      const executable = config.executable || config.packagePath;
      if (platform !== 'win32' && (key === 'externalDemo' || /\.exe$/i.test(executable))) {
        add('error', subject, `${label}依赖 Windows，当前操作系统无法按现有配置运行。`);
      }
      const fileExists = isFile(fileSystem, executable);
      add(fileExists ? 'pass' : 'error', subject, fileExists
        ? `${label}文件存在；未执行、安装或验证可用性。` : `${label}文件不存在或不可读取，请在演示主机单独配置。`);
      if (config.cwd && !isDirectory(fileSystem, config.cwd)) add('error', subject, `${label}的工作目录不存在或不可读取。`);
      if (key === 'externalDemo') add('warning', subject, '隧道服务、交互式桌面、窗口权限和自动点击需要在 Windows 演示主机实际验收；此检查不启动隧道。');
      if (key === 'externalInstaller') add('warning', subject, '安装包将在演示主机打开。供同事安装到自己电脑时，需要另行提供有权限控制的下载渠道。');
    }
    if (system.url.trim()) {
      if (isPrivateHost(new URL(system.url).hostname)) add('warning', subject, '目标为内网地址，需演示主机具备局域网或隧道连接；公网不能直接访问。');
      networkTargets.push({ url: system.url, subject });
    }
  }
  if (needsChromium) {
    const browser = checkBrowser({ platform, env: dependencies.env || process.env, fileSystem, loadChromium: dependencies.loadChromium });
    add(browser.level, '浏览器依赖', browser.message);
    if (platform === 'linux' && !(dependencies.env || process.env).DISPLAY) {
      add('error', '交互式桌面', '当前 Linux 环境未配置 DISPLAY；现有有头浏览器需要可交互桌面。');
    }
  }
  if (options.network) {
    const probe = dependencies.probeUrl || probeUrl;
    const checks = await mapLimited(networkTargets, NETWORK_CONCURRENCY, async item => {
      try { return await probe(item.url, { timeoutMs: NETWORK_TIMEOUT_MS }); }
      catch { return { level: 'error', message: '网络检查失败；未验证登录。' }; }
    });
    checks.forEach((check, index) => add(check.level, networkTargets[index].subject, check.message));
  } else add('warning', '网络', '未检查目标网站连通性；可追加 --network 执行每站最多 12 秒、并发最多 3 项的无登录 GET 检查。');
  add('warning', '验收范围', '检查通过只代表本机静态前置条件通过，不代表登录成功、安装成功、业务功能可用或外网部署完成。');
  return result();
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('用法：node scripts/check-readiness.js [--network] [--public]\n--network 检查网址 HTTP 响应，不登录。\n--public 将未完成的远程桌面部署作为失败，退出码为 1。');
    return 0;
  }
  if (args.some(arg => !['--network', '--public'].includes(arg))) {
    console.error('参数无效。支持 --network、--public、--help。');
    return 1;
  }
  const report = await runReadiness({ network: args.includes('--network'), public: args.includes('--public') });
  const labels = { pass: '通过', warning: '注意', error: '失败' };
  for (const entry of report.entries) console.log(`[${labels[entry.level]}] ${entry.subject}：${entry.message}`);
  console.log(report.exitCode ? '检查存在未满足项；请处理上述失败后重新验收。' : '本机前置条件检查通过；尚未验证登录、业务操作与外网演示。');
  return report.exitCode;
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => {
  console.error('检查未完成，请确认已安装依赖且本地配置可读取。');
  process.exitCode = 1;
});

module.exports = { runReadiness, probeUrl, checkBrowser, browserCandidates, isPrivateHost, mapLimited, main };
