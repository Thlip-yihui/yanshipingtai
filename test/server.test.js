'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../server');

const publicKeys = ['enabled', 'id', 'name', 'unavailableMessage', 'url', 'username'];

function system(overrides = {}) {
  return {
    id: 'test-archive',
    name: '本地测试档案系统',
    url: 'http://127.0.0.1:8080/login',
    username: 'fixture-user',
    password: 'fixture-only-password',
    enabled: true,
    loginSelectors: { username: '#account', password: '#password' },
    ...overrides
  };
}

async function start(t, systems, openSystem = async () => ({ success: true, message: '已打开' })) {
  const server = http.createServer(createApp({ systems, openSystem }));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    // 即使断言失败或请求仍在处理中，也不遗留监听器与连接。
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function request(base, path, options = {}) {
  return fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000), ...options });
}

function open(base, id, options = {}) {
  return request(base, `/api/open/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    ...options
  });
}

function requestWithHost(base, host) {
  // Node fetch 会自行设置 Host，此处用原生 HTTP 验证真实的 Host 防护。
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/systems`, { headers: { Host: host } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Host 测试请求超时')));
  });
}

test('系统列表展示全部 8 项测试配置，严格过滤密码、选择器与私密字段', { timeout: 10000 }, async t => {
  // GitHub 克隆不含本机 systems.js；测试只使用虚构凭据和回环地址。
  const configured = Array.from({ length: 8 }, (_, index) => system({
    id: `fixture-system-${index + 1}`,
    name: `测试系统 ${index + 1}`,
    username: `fixture-user-${index + 1}`,
    password: `fixture-only-password-${index + 1}`,
    enabled: index < 6,
    internalToken: `fixture-private-token-${index + 1}`
  }));
  const base = await start(t, configured);
  const response = await request(base, '/api/systems');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.length, 8);
  assert.equal(data.filter(item => item.enabled).length, 6);
  assert.equal(data.filter(item => !item.enabled).length, 2);
  for (let i = 0; i < data.length; i++) {
    assert.deepEqual(Object.keys(data[i]).sort(), publicKeys);
    for (const key of ['id', 'name', 'url', 'username', 'enabled']) {
      assert.equal(data[i][key], configured[i][key]);
    }
    assert.equal(typeof data[i].unavailableMessage, 'string');
  }
  // 同时校验字段名和字段值，防止凭据换名后泄露。
  const serialized = JSON.stringify(data);
  for (const item of configured) {
    if (item.password) assert.ok(!serialized.includes(item.password), '公开响应不得包含配置中的密码值');
    assert.ok(!serialized.includes(item.internalToken), '公开响应不得包含私密字段值');
  }
});

test('打开接口向自动化传入完整目标配置，响应仅包含状态与中文消息', { timeout: 10000 }, async t => {
  const target = system({ internalToken: 'fixture-private-token' });
  let received;
  const base = await start(t, [target], async config => {
    received = config;
    return { success: true, message: '已打开并完成自动登录', password: 'internal-secret', debug: { selectors: 'private' } };
  });
  const response = await open(base, target.id);
  assert.equal(response.status, 200);
  assert.strictEqual(received, target);
  assert.deepEqual(await response.json(), { success: true, message: '已打开并完成自动登录' });
  const listed = await (await request(base, '/api/systems')).json();
  assert.deepEqual(Object.keys(listed[0]).sort(), publicKeys);
});

test('未知系统和未知接口返回中文 404，不调用自动化', { timeout: 10000 }, async t => {
  let calls = 0;
  const base = await start(t, [system()], async () => { calls++; });
  const response = await open(base, 'does-not-exist');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, message: '未找到该系统配置' });
  const unknown = await request(base, '/api/unknown');
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { success: false, message: '接口不存在' });
  assert.equal(calls, 0);
});

test('预留系统使用指定提示，服务端拒绝触发自动化', { timeout: 10000 }, async t => {
  let calls = 0;
  const reserved = system({ enabled: false, unavailableMessage: '该系统暂未配置网址、账号和密码，按钮已预留。' });
  const base = await start(t, [reserved], async () => { calls++; });
  const response = await open(base, reserved.id);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, message: reserved.unavailableMessage });
  assert.equal(calls, 0);
});

test('网址缺失时返回网址未配置，不调用自动化', { timeout: 10000 }, async t => {
  let calls = 0;
  const target = system({ url: '' });
  const base = await start(t, [target], async () => { calls++; });
  const response = await open(base, target.id);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, message: '网址未配置' });
  assert.equal(calls, 0);
});

test('账号或密码缺失均拒绝自动化并返回中文配置提示', { timeout: 10000 }, async t => {
  let calls = 0;
  const targets = [system({ id: 'missing-user', username: '' }), system({ id: 'missing-password', password: '' })];
  const base = await start(t, targets, async () => { calls++; });
  for (const target of targets) {
    const response = await open(base, target.id);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { success: false, message: '账号或密码未配置，请检查本地配置文件' });
  }
  assert.equal(calls, 0);
});

test('同一系统同时打开返回 409，自动化失败后释放锁并允许重试', { timeout: 10000 }, async t => {
  const target = system();
  let calls = 0;
  let signalEntered;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  let finishFirst;
  const pending = new Promise(resolve => { finishFirst = resolve; });
  t.after(() => finishFirst({ success: false, message: '测试结束' }));
  const base = await start(t, [target], async () => {
    calls++;
    if (calls === 1) {
      signalEntered();
      return pending;
    }
    return { success: true, message: '重试已打开' };
  });
  const firstResponse = open(base, target.id);
  // 立即登记拒绝处理，防止失败清理关闭连接时产生未处理拒绝。
  firstResponse.catch(() => {});
  await entered;
  const duplicate = await open(base, target.id);
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { success: false, message: '该系统正在打开，请稍候' });
  assert.equal(calls, 1);
  finishFirst({ success: false, message: '未找到账号输入框' });
  const failed = await firstResponse;
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), { success: false, message: '未找到账号输入框' });
  const retry = await open(base, target.id);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { success: true, message: '重试已打开' });
  assert.equal(calls, 2);
});

test('自动化异常返回安全中文 500，不暴露原始异常，异常后仍可重试', { timeout: 10000 }, async t => {
  const target = system();
  const secret = 'fixture-secret-that-must-stay-private';
  let calls = 0;
  const loggedErrors = [];
  t.mock.method(console, 'error', (...args) => loggedErrors.push(args.join(' ')));
  const base = await start(t, [target], async () => {
    if (++calls === 1) throw new Error(`third-party failure: ${secret}`);
    return { success: true, message: '已打开' };
  });
  const response = await open(base, target.id);
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes(secret));
  assert.deepEqual(JSON.parse(body), { success: false, message: '自动登录发生异常；若窗口已打开，请在浏览器中人工处理' });
  assert.equal(loggedErrors.length, 1);
  assert.ok(loggedErrors.every(message => !message.includes(secret)));
  const retry = await open(base, target.id);
  assert.equal(retry.status, 200);
  await retry.json();
  assert.equal(calls, 2);
});

test('拒绝外部 Host、Origin 和跨站操作，允许导航台自身 Origin', { timeout: 10000 }, async t => {
  let calls = 0;
  const target = system();
  const base = await start(t, [target], async () => { calls++; return { success: true, message: '已打开' }; });
  const badHost = await requestWithHost(base, 'untrusted.example');
  assert.equal(badHost.status, 403);
  assert.deepEqual(JSON.parse(badHost.body), { success: false, message: '仅允许从本机地址访问导航台' });
  for (const extra of [{ Origin: 'https://untrusted.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const response = await open(base, target.id, { headers: { 'Content-Type': 'application/json', ...extra } });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { success: false, message: '请从本地导航台发起操作' });
  }
  assert.equal(calls, 0);
  const local = await open(base, target.id, { headers: { 'Content-Type': 'application/json', Origin: base } });
  assert.equal(local.status, 200);
  await local.json();
  assert.equal(calls, 1);
});

test('大写及混合大小写 API 路径不能绕过来源防护与 JSON 限制', { timeout: 10000 }, async t => {
  let calls = 0;
  const target = system();
  const base = await start(t, [target], async () => {
    calls++;
    return { success: true, message: '已打开' };
  });
  for (const prefix of ['/API/open', '/ApI/OpEn']) {
    const path = `${prefix}/${target.id}`;
    for (const extra of [
      { Origin: 'https://untrusted.example' },
      { 'Sec-Fetch-Site': 'cross-site' }
    ]) {
      const response = await request(base, path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: '{}'
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { success: false, message: '请从本地导航台发起操作' });
    }
    const crossSiteForm = await request(base, path, {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        'Sec-Fetch-Site': 'cross-site',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'open=true'
    });
    assert.equal(crossSiteForm.status, 403);
    assert.deepEqual(await crossSiteForm.json(), { success: false, message: '请从本地导航台发起操作' });
    const localForm = await request(base, path, {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'open=true'
    });
    assert.equal(localForm.status, 415);
    assert.deepEqual(await localForm.json(), { success: false, message: '请求必须使用 application/json 格式' });
  }
  assert.equal(calls, 0, '所有被拒绝的大小写路径请求均不得启动自动化');

  const localJson = await request(base, `/API/open/${target.id}`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(localJson.status, 200);
  assert.deepEqual(await localJson.json(), { success: true, message: '已打开' });
  assert.equal(calls, 1);
  const listed = await request(base, '/API/systems');
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys((await listed.json())[0]).sort(), publicKeys);
});

test('打开接口强制 JSON，拒绝缺失类型和表单提交', { timeout: 10000 }, async t => {
  let calls = 0;
  const target = system();
  const base = await start(t, [target], async () => { calls++; });
  for (const options of [
    { method: 'POST' },
    { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' },
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'open=true' }
  ]) {
    const response = await request(base, `/api/open/${target.id}`, options);
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { success: false, message: '请求必须使用 application/json 格式' });
  }
  assert.equal(calls, 0);
});

test('无效和超限 JSON 返回中文 400，配置文件不能通过静态文件接口读取', { timeout: 10000 }, async t => {
  let calls = 0;
  const target = system();
  const base = await start(t, [target], async () => { calls++; });
  for (const body of ['{"invalid":', JSON.stringify({ oversized: 'x'.repeat(3000) })]) {
    const response = await open(base, target.id, { body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { success: false, message: '请求 JSON 格式错误或内容过大' });
  }
  assert.equal(calls, 0);
  for (const path of ['/config/systems.js', '/.gitignore', '/server.js']) {
    const response = await request(base, path);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes(target.password));
  }
});
