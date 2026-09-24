'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { EventEmitter } = require('node:events');
const { runReadiness, probeUrl, checkBrowser, isPrivateHost } = require('../scripts/check-readiness');
const { validateSystems } = require('../server');

function system(overrides = {}) {
  return {
    id: 'demo-system', name: '测试档案系统', url: 'http://127.0.0.1:4567/',
    username: 'private-fixture-user', password: 'private-fixture-password',
    enabled: true, loginSelectors: {}, ...overrides
  };
}

function dependencies(systems = [system()], overrides = {}) {
  return {
    platform: 'win32', env: {}, validateSystems,
    loadSystems: () => systems,
    loadChromium: () => ({ executablePath: () => 'C:\\private-browser.exe', launch: () => { throw new Error('must not launch'); } }),
    fileSystem: { statSync: () => ({ isFile: () => true, isDirectory: () => true }) },
    ...overrides
  };
}

function output(report) { return report.entries.map(entry => `${entry.subject} ${entry.message}`).join('\n'); }

async function localServer(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('默认检查只读前置条件，不联网、不启动浏览器、不输出私密配置', async () => {
  let networkCalls = 0;
  const report = await runReadiness({}, dependencies([system()], {
    probeUrl: async () => { networkCalls++; throw new Error('must not request'); }
  }));
  assert.equal(report.exitCode, 0);
  assert.equal(networkCalls, 0);
  assert.match(output(report), /本机桌面模式/);
  assert.match(output(report), /远程桌面网关/);
  assert.match(output(report), /未验证账号密码是否有效/);
  for (const privateText of ['private-fixture-user', 'private-fixture-password', 'C:\\private-browser.exe', 'http://127.0.0.1:4567/']) {
    assert.equal(output(report).includes(privateText), false);
  }
});

test('公网检查即使本机全部满足也失败，不能以静态检查保证公网演示', async () => {
  const report = await runReadiness({ public: true }, dependencies());
  assert.equal(report.exitCode, 1);
  assert.equal(report.entries.find(entry => entry.subject === '外网演示').level, 'error');
  assert.match(output(report), /仅上传 GitHub 或启用 GitHub Pages 无法/);
});

test('缺失配置与无效配置均安全失败，不泄露异常中的路径或凭据', async () => {
  for (const overrides of [
    { loadSystems: () => { throw new Error('C:\\private\\secret-password.js'); } },
    { validateSystems: () => { throw new Error('private-secret-configuration'); } },
    { loadSystems: () => [] }
  ]) {
    const report = await runReadiness({}, dependencies([], overrides));
    assert.equal(report.exitCode, 1);
    assert.equal(output(report).includes('private'), false);
    assert.match(output(report), /系统配置/);
  }
});

test('停用系统、缺网址、缺账号或缺密码均不能通过全系统前置检查', async () => {
  const targets = [
    system({ id: 'disabled', enabled: false }), system({ id: 'no-url', url: '' }),
    system({ id: 'no-user', username: '' }), system({ id: 'no-password', password: ' ' })
  ];
  const report = await runReadiness({}, dependencies(targets));
  assert.equal(report.exitCode, 1);
  assert.match(output(report), /系统未启用/);
  assert.match(output(report), /网址未配置/);
  assert.equal(report.entries.filter(entry => /账号或密码未配置/.test(entry.message)).length, 2);
});

test('Windows 外部程序缺失、工作目录失效及多种启动器冲突均被检测', async () => {
  const target = system({ externalDemo: { executable: 'C:\\secret\\demo.exe', cwd: 'C:\\secret' }, externalBrowser: { executable: 'C:\\secret\\firefox.exe' } });
  const report = await runReadiness({}, dependencies([target], {
    platform: 'linux', env: { DISPLAY: ':1' },
    fileSystem: { statSync: () => { throw new Error('C:\\secret path rejected'); } }
  }));
  assert.equal(report.exitCode, 1);
  assert.match(output(report), /依赖 Windows/);
  assert.match(output(report), /工作目录不存在/);
  assert.match(output(report), /同时配置了多种外部启动方式/);
  assert.equal(output(report).includes('secret'), false);
});

test('安装包无需网站登录资料，但文件存在不冒称安装成功', async () => {
  const report = await runReadiness({}, dependencies([system({
    url: '', username: '', password: '', externalInstaller: { packagePath: 'C:\\private\\setup.exe' }
  })], { loadChromium: () => { throw new Error('should not inspect Chromium'); } }));
  assert.equal(report.exitCode, 0);
  assert.match(output(report), /未执行、安装或验证可用性/);
  assert.match(output(report), /需要另行提供有权限控制的下载渠道/);
});

test('Chromium 缺失、未知频道以及命名浏览器缺失给出可操作中文提示', () => {
  const absent = { statSync: () => { throw new Error('private-path'); } };
  const chromium = () => ({ executablePath: () => '/private/executable' });
  for (const env of [{}, { PLAYWRIGHT_CHANNEL: 'unknown' }, { PLAYWRIGHT_CHANNEL: 'msedge', PROGRAMFILES: 'C:\\Programs' }]) {
    const result = checkBrowser({ platform: 'win32', env, fileSystem: absent, loadChromium: chromium });
    assert.equal(result.level, 'error');
    assert.equal(result.message.includes('private'), false);
  }
  const result = checkBrowser({ platform: 'win32', env: { PLAYWRIGHT_CHANNEL: 'chrome', PROGRAMFILES: 'C:\\Programs' },
    fileSystem: { statSync: target => ({ isFile: () => target === 'C:\\Programs\\Google\\Chrome\\Application\\chrome.exe' }) },
    loadChromium: chromium });
  assert.equal(result.level, 'pass');
  assert.match(result.message, /未验证启动权限/);
});

test('Linux 无图形桌面不能通过有头浏览器前置检查', async () => {
  const report = await runReadiness({}, dependencies([system()], { platform: 'linux', env: {} }));
  assert.equal(report.exitCode, 1);
  assert.match(output(report), /未配置 DISPLAY/);
});

test('可选网络检查限制三个并发且异常消息不会透出配置', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const targets = Array.from({ length: 8 }, (_, index) => system({ id: `system-${index}` }));
  const report = await runReadiness({ network: true }, dependencies(targets, {
    probeUrl: async (url, options) => {
      assert.equal(options.timeoutMs, 12000);
      active++;
      calls++;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      throw new Error('private-network-credential');
    }
  }));
  assert.equal(calls, 8);
  assert.equal(maxActive, 3);
  assert.equal(report.exitCode, 1);
  assert.equal(output(report).includes('private-network-credential'), false);
});

test('HTTP 检查仅无凭据 GET，HTTP 200 明确不等于登录或业务通过', { timeout: 3000 }, async t => {
  let headers;
  let method;
  const base = await localServer(t, (req, res) => {
    headers = req.headers;
    method = req.method;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>login form</html>');
  });
  const result = await probeUrl(base, { timeoutMs: 1000 });
  assert.equal(result.level, 'pass');
  assert.match(result.message, /HTTP 200/);
  assert.match(result.message, /未验证登录或业务功能/);
  assert.equal(method, 'GET');
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.cookie, undefined);
});

test('HTTP 检查不跟随跳转，服务端失败不被报为可演示', { timeout: 3000 }, async t => {
  let followed = false;
  const base = await localServer(t, (req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end(); }
    else { followed = true; res.writeHead(503); res.end(); }
  });
  const redirect = await probeUrl(`${base}/redirect`, { timeoutMs: 1000 });
  assert.match(redirect.message, /未跟随跳转/);
  assert.equal(followed, false);
  const failure = await probeUrl(`${base}/target`, { timeoutMs: 1000 });
  assert.equal(failure.level, 'error');
  assert.match(failure.message, /HTTP 503/);
});

test('收到响应头后销毁响应，不收集或下载响应正文', async () => {
  let responseDestroyed = false;
  let requestDestroyed = false;
  const response = new EventEmitter();
  response.statusCode = 200;
  response.destroy = () => { responseDestroyed = true; };
  const request = new EventEmitter();
  request.destroy = () => { requestDestroyed = true; };
  const result = await probeUrl('http://example.test/', { getHttp: (url, options, callback) => {
    setImmediate(() => callback(response));
    return request;
  } });
  assert.equal(result.level, 'pass');
  assert.equal(responseDestroyed, true);
  assert.equal(requestDestroyed, true);
  assert.equal(response.listenerCount('data'), 0);
});

test('总超时覆盖完全无响应连接并销毁请求，内网原因明确', { timeout: 3000 }, async t => {
  const base = await localServer(t, () => {});
  const started = Date.now();
  const result = await probeUrl(base, { timeoutMs: 80 });
  assert.equal(result.level, 'error');
  assert.match(result.message, /内网地址不可达或响应超时/);
  assert.ok(Date.now() - started < 1500);
});

test('拒绝带凭据 URL 或其他协议，不发出网络请求', async () => {
  for (const url of ['http://secret:password@example.test/', 'file:///private/secret', 'broken']) {
    const result = await probeUrl(url, { getHttp: () => { throw new Error('must not call'); } });
    assert.equal(result.level, 'error');
    assert.equal(result.message.includes('secret'), false);
    assert.match(result.message, /未发起请求/);
  }
});

test('检测常见内网 IPv4 和 IPv6 地址，公网地址保持区分', () => {
  for (const host of ['192.168.3.251', '172.16.0.1', '172.31.255.1', '10.2.3.4', '127.0.0.1', '[::1]', '[fd12::1]', 'localhost']) assert.equal(isPrivateHost(host), true);
  for (const host of ['47.113.229.248', 'a.wenzhi.icu', '172.32.0.1', '999.168.3.1']) assert.equal(isPrivateHost(host), false);
});
