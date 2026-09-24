'use strict';

const express = require('express');
const path = require('node:path');

function validateSystems(systems) {
  if (!Array.isArray(systems)) throw new Error('系统配置必须是数组');
  const ids = new Set();
  for (const system of systems) {
    if (!system || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(system.id || '') || ids.has(system.id)) {
      throw new Error('系统 id 必须唯一，且只能使用小写字母、数字和连字符');
    }
    ids.add(system.id);
    if (typeof system.name !== 'string' || !system.name.trim()) throw new Error('系统名称不能为空');
    for (const key of ['url', 'username', 'password']) {
      if (typeof system[key] !== 'string') throw new Error('系统网址、账号和密码必须为字符串');
    }
    if (typeof system.enabled !== 'boolean') throw new Error('enabled 必须为布尔值');
    if (system.loginTimeoutMs !== undefined && (!Number.isInteger(system.loginTimeoutMs) || system.loginTimeoutMs < 1000 || system.loginTimeoutMs > 60000)) {
      throw new Error('loginTimeoutMs 必须为 1000 到 60000 之间的整数毫秒数');
    }
    if (system.url) {
      let target;
      try { target = new URL(system.url); } catch { throw new Error('系统网址格式不正确'); }
      if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
        throw new Error('系统网址仅支持 HTTP/HTTPS，网址中不得包含账号密码');
      }
    }
    const selectors = system.loginSelectors;
    if (selectors != null && (typeof selectors !== 'object' || Array.isArray(selectors) ||
      Object.values(selectors).some(value => typeof value !== 'string'))) {
      throw new Error('loginSelectors 必须是字符串选择器对象');
    }
    if (system.externalBrowser !== undefined) {
      const browser = system.externalBrowser;
      if (!browser || typeof browser !== 'object' || Array.isArray(browser)) {
        throw new Error('externalBrowser 必须是对象');
      }
      if (typeof browser.executable !== 'string' || !browser.executable.trim()) {
        throw new Error('externalBrowser.executable 必须是非空文件路径');
      }
      if (browser.cwd !== undefined && (typeof browser.cwd !== 'string' || !browser.cwd.trim())) {
        throw new Error('externalBrowser.cwd 必须是非空目录路径');
      }
      if (browser.args !== undefined && (!Array.isArray(browser.args) || browser.args.some(value => typeof value !== 'string'))) {
        throw new Error('externalBrowser.args 必须是字符串数组');
      }
    }
    if (system.externalInstaller !== undefined) {
      const installer = system.externalInstaller;
      if (!installer || typeof installer !== 'object' || Array.isArray(installer)) {
        throw new Error('externalInstaller 必须是对象');
      }
      if (typeof installer.packagePath !== 'string' || !installer.packagePath.trim()) {
        throw new Error('externalInstaller.packagePath 必须是非空文件路径');
      }
      if (installer.args !== undefined && (!Array.isArray(installer.args) || installer.args.some(value => typeof value !== 'string'))) {
        throw new Error('externalInstaller.args 必须是字符串数组');
      }
    }
    if (system.externalDemo !== undefined) {
      const demo = system.externalDemo;
      if (!demo || typeof demo !== 'object' || Array.isArray(demo)) {
        throw new Error('externalDemo 必须是对象');
      }
      if (typeof demo.executable !== 'string' || !demo.executable.trim()) {
        throw new Error('externalDemo.executable 必须是非空文件路径');
      }
      if (demo.cwd !== undefined && (typeof demo.cwd !== 'string' || !demo.cwd.trim())) {
        throw new Error('externalDemo.cwd 必须是非空目录路径');
      }
      if (demo.args !== undefined && (!Array.isArray(demo.args) || demo.args.some(value => typeof value !== 'string'))) {
        throw new Error('externalDemo.args 必须是字符串数组');
      }
      for (const key of ['windowTitle', 'windowClass', 'tunnelServiceName', 'connectButtonText', 'connectedText', 'platformButtonText']) {
        if (demo[key] !== undefined && (typeof demo[key] !== 'string' || !demo[key].trim())) {
          throw new Error(`externalDemo.${key} 必须是非空字符串`);
        }
      }
      for (const key of ['tunnelTabOffset', 'platformTabOffset']) {
        if (demo[key] !== undefined && (!demo[key] || typeof demo[key] !== 'object' ||
          !Number.isFinite(demo[key].x) || !Number.isFinite(demo[key].y))) {
          throw new Error(`externalDemo.${key} 必须包含数字 x、y 坐标`);
        }
      }
      if (demo.uiTimeoutMs !== undefined && (!Number.isInteger(demo.uiTimeoutMs) || demo.uiTimeoutMs < 3000 || demo.uiTimeoutMs > 60000)) {
        throw new Error('externalDemo.uiTimeoutMs 必须为 3000 到 60000 之间的整数毫秒数');
      }
    }
  }
}

function createApp({ systems, openSystem }) {
  validateSystems(systems);
  const app = express();
  const opening = new Set();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    });
    // 仅接受导航台自身的主机名，阻止 DNS rebinding 与外部网页触发本地登录。
    const port = req.socket.localPort;
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (port === 80) { allowedHosts.add('127.0.0.1'); allowedHosts.add('localhost'); }
    if (!allowedHosts.has(req.get('host'))) {
      return res.status(403).json({ success: false, message: '仅允许从本机地址访问导航台' });
    }
    const isApi = req.path.toLowerCase().startsWith('/api/');
    if (isApi) res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && isApi) {
      const origin = req.get('origin');
      if ((origin && ![...allowedHosts].some(host => origin === `http://${host}`)) ||
        req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ success: false, message: '请从本地导航台发起操作' });
      }
      if (!req.is('application/json')) {
        return res.status(415).json({ success: false, message: '请求必须使用 application/json 格式' });
      }
    }
    next();
  });
  app.use(express.json({ limit: '2kb' }));

  app.get('/api/systems', (req, res) => {
    // 明确列出可返回的字段，避免密码、选择器或未来新增的私密配置泄漏。
    res.json(systems.map(({ id, name, url, username, enabled, unavailableMessage }) => ({
      id, name, url, username, enabled,
      unavailableMessage: unavailableMessage || '该系统暂未配置，按钮已预留。'
    })));
  });

  app.post('/api/open/:id', async (req, res) => {
    const system = systems.find(item => item.id === req.params.id);
    if (!system) return res.status(404).json({ success: false, message: '未找到该系统配置' });
    if (!system.enabled) {
      return res.status(400).json({ success: false, message: system.unavailableMessage || '该系统暂未配置，按钮已预留。' });
    }
    const hasExternalBrowser = Boolean(system.externalBrowser);
    const hasExternalInstaller = Boolean(system.externalInstaller);
    const hasExternalDemo = Boolean(system.externalDemo);
    if (!system.url.trim() && !hasExternalBrowser && !hasExternalInstaller && !hasExternalDemo) return res.status(400).json({ success: false, message: '网址未配置' });
    if (!hasExternalBrowser && !hasExternalInstaller && !hasExternalDemo && (!system.username || !system.password)) {
      return res.status(400).json({ success: false, message: '账号或密码未配置，请检查本地配置文件' });
    }
    if (opening.has(system.id)) {
      return res.status(409).json({ success: false, message: '该系统正在打开，请稍候' });
    }
    opening.add(system.id);
    console.info(`[导航台][${system.id}] 正在打开系统`);
    try {
      const result = await openSystem(system);
      res.status(result.success ? 200 : 502).json({ success: Boolean(result.success), message: result.message });
    } catch {
      // 不输出原始异常：第三方错误可能包含表单值或请求内容。
      console.error(`[导航台][${system.id}] 自动操作发生异常，已保留可用浏览器窗口`);
      res.status(500).json({ success: false, message: '自动登录发生异常；若窗口已打开，请在浏览器中人工处理' });
    } finally {
      opening.delete(system.id);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ success: false, message: '接口不存在' }));
  app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const isInputError = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
    res.status(isInputError ? 400 : 500).json({ success: false, message: isInputError ? '请求 JSON 格式错误或内容过大' : '本地服务处理请求失败' });
  });
  return app;
}

function startServer() {
  let systems;
  try { systems = require('./config/systems'); }
  catch {
    console.error('无法读取 config/systems.js。请复制 config/systems.example.js 为 systems.js，填写配置后重试。');
    process.exitCode = 1;
    return;
  }
  const { openSystem, closeBrowser } = require('./automation/openSystem');
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT 必须为 1 到 65535 之间的整数');
    process.exitCode = 1;
    return;
  }
  let app;
  try { app = createApp({ systems, openSystem }); }
  catch (error) {
    console.error(`配置错误：${error.message}`);
    process.exitCode = 1;
    return;
  }
  const server = app.listen(port, '127.0.0.1', () => {
    console.info(`档案系统演示导航台：http://127.0.0.1:${port}`);
    console.info(`共 ${systems.length} 个系统，已配置 ${systems.filter(item => item.enabled).length} 个。仅演示环境使用。`);
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请关闭已有服务或设置 PORT 环境变量。` : '本地服务启动失败，请检查端口和权限。');
    process.exitCode = 1;
  });
  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    console.info('正在停止本地服务并关闭演示浏览器…');
    server.close();
    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();
    try { await closeBrowser(); } finally { process.exit(0); }
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) startServer();
module.exports = { createApp, validateSystems, startServer };
