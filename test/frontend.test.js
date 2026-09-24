'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { chromium } = require('playwright');
const { createApp } = require('../server');

// Deliberately use local-only fixture addresses and artificial credentials.
// This suite never opens a real system or submits real login details.
const definitions = [
  ['court-file-cabinet', '智能文件柜-法院', true],
  ['paperless-go', 'AI辅助数字化扫描加工', true],
  ['digital-archive', '档案数字化管理系统', true],
  ['dense-shelf-platform', '密集架一体化平台管理系统', true],
  ['integrated-archive', '综合档案管理系统', true],
  ['cadre-personnel-archive', '干部人事档案管理系统', false],
  ['standalone-archive', '综合单机版档案系统', true],
  ['aisou-file-agent', '艾搜文件智能体', true],
];
const systems = definitions.map(([id, name, enabled], index) => ({
  id, name, enabled,
  url: enabled ? `http://127.0.0.1:9/${id}` : '',
  username: enabled ? `demo${index + 1}` : '',
  password: enabled ? `fixture-secret-${index + 1}` : '',
  loginSelectors: {},
  unavailableMessage: id === 'cadre-personnel-archive'
    ? '该系统暂未配置网址、账号和密码，按钮已预留。'
    : '该系统暂未配置，按钮已预留。',
})).map(system => {
  if (system.id === 'dense-shelf-platform') {
    return { ...system, url: '', username: '', password: '', externalBrowser: { executable: 'C:/demo/FirefoxPortable.exe', cwd: 'C:/demo' } };
  }
  if (system.id === 'aisou-file-agent') {
    return { ...system, url: '', username: '', password: '', externalInstaller: { packagePath: 'D:/demo/aisouagentInstaller.exe' } };
  }
  return system;
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('navigation UI integrates with the real local API', { timeout: 60000 }, async t => {
  const requests = [];
  const pageErrors = [];
  const consoleErrors = [];
  const openerCalls = [];
  const jobs = new Map();
  const app = createApp({
    systems,
    openSystem: system => {
      openerCalls.push(system.id);
      const job = jobs.get(system.id);
      assert.ok(job, `Unexpected system open: ${system.id}`);
      job.started.resolve();
      return job.result.promise;
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const context = await browser.newContext({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    viewport: { width: 1440, height: 1050 },
  });
  const page = await context.newPage();
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', request => {
    if (request.method() === 'POST') requests.push(request);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });

  await t.test('renders all eight cards and seven configured systems without credentials leaking', async () => {
    assert.equal(await page.title(), '档案系统演示导航台');
    assert.equal(await page.locator('.system-card').count(), 8);
    assert.equal(await page.locator('.system-card:not(.is-reserved)').count(), 7);
    assert.equal(await page.locator('.is-reserved').count(), 1);
    assert.equal(await page.locator('#service-label').textContent(), '本地服务已连接');
    assert.equal(await page.locator('.section-kicker').count(), 0);
    assert.equal(await page.locator('.count-pill').count(), 0);
    assert.equal(await page.locator('.overview').count(), 0);
    assert.equal(await page.locator('#operation-banner').count(), 0);
    assert.equal(await page.locator('.page-footer').count(), 0);
    for (const system of systems.filter(item => item.enabled)) {
      const button = page.locator(`[data-system-id="${system.id}"] .open-button`);
      assert.match(await button.textContent(), /系统演示/);
      assert.equal(await button.getAttribute('aria-label'), `系统演示：${system.name}`);
      assert.equal(await button.locator('svg').count(), 0);
    }
    for (const system of systems) assert.equal(await page.getByRole('heading', { name: system.name, exact: true }).count(), 1);
    const installerCard = page.locator('[data-system-id="aisou-file-agent"]');
    assert.equal(await installerCard.locator('dd').first().textContent(), '本机安装包');
    assert.equal(await installerCard.locator('dd').nth(1).textContent(), '安装后运行');
    assert.ok(!(await page.content()).includes('fixture-secret'));
    const apiResponse = await page.request.get('/api/systems');
    const publicSystems = await apiResponse.json();
    assert.equal(publicSystems.length, 8);
    for (const system of publicSystems) assert.ok(!Object.hasOwn(system, 'password'));
  });

  await t.test('reserved button shows the correct message without sending POST', async () => {
    for (const system of systems.filter(item => !item.enabled)) {
      await page.locator(`[data-system-id="${system.id}"] .open-button`).click();
      assert.equal(await page.locator('#notice-dialog').isVisible(), true);
      assert.equal(await page.locator('#dialog-message').textContent(), system.unavailableMessage);
      await page.getByRole('button', { name: '我知道了', exact: true }).click();
      assert.equal(await page.locator('#notice-dialog').isVisible(), false);
    }
    assert.equal(requests.length, 0);
    assert.equal(openerCalls.length, 0);
  });

  await t.test('configured button sends JSON, remains loading, then displays success', async () => {
    const id = 'court-file-cabinet';
    const job = { started: deferred(), result: deferred() };
    jobs.set(id, job);
    const button = page.locator(`[data-system-id="${id}"] .open-button`);
    await button.click();
    await job.started.promise;
    assert.equal(await button.isDisabled(), true);
    assert.equal(await button.getAttribute('aria-busy'), 'true');
    assert.match(await button.textContent(), /正在打开/);
    assert.equal(requests.length, 1);
    assert.match(requests[0].headers()['content-type'], /^application\/json/);
    assert.deepEqual(requests[0].postDataJSON(), {});
    job.result.resolve({ success: true, message: '已打开系统，并完成自动登录。' });
    await page.locator(`[data-system-id="${id}"] .card-status[data-tone="success"]`).waitFor();
    assert.equal(await button.isEnabled(), true);
    assert.equal(await button.getAttribute('aria-busy'), 'false');
    assert.match(await page.locator(`[data-system-id="${id}"] .card-status`).textContent(), /完成自动登录/);
    assert.equal(context.pages().length, 1, 'Frontend must not open a target browser tab');
  });

  await t.test('backend failure appears in Chinese and button can be retried', async () => {
    const id = 'paperless-go';
    const job = { started: deferred(), result: deferred() };
    jobs.set(id, job);
    const button = page.locator(`[data-system-id="${id}"] .open-button`);
    await button.click();
    await job.started.promise;
    assert.equal(await button.isDisabled(), true);
    job.result.resolve({ success: false, message: '内网地址不可达，请确认当前电脑已连接同一网络。' });
    await page.locator(`[data-system-id="${id}"] .card-status[data-tone="error"]`).waitFor();
    assert.equal(await button.isEnabled(), true);
    assert.match(await page.locator(`[data-system-id="${id}"] .card-status`).textContent(), /内网地址不可达/);
    assert.equal(requests.length, 2);
  });

  await t.test('filters and search expose the expected systems and preserve operation results', async () => {
    await page.locator('[data-filter="enabled"]').click();
    assert.equal(await page.locator('.system-card').count(), 7);
    await page.locator('[data-filter="reserved"]').click();
    assert.equal(await page.locator('.system-card').count(), 1);
    await page.locator('[data-filter="all"]').click();
    await page.locator('#search-input').fill('数字化管理');
    assert.equal(await page.locator('.system-card').count(), 1);
    assert.equal(await page.locator('.system-card h3').textContent(), '档案数字化管理系统');
    await page.locator('#search-input').fill('demo2');
    assert.equal(await page.locator('.system-card').count(), 1);
    assert.equal(await page.locator('.system-card h3').textContent(), 'AI辅助数字化扫描加工');
    assert.match(await page.locator('.card-status').textContent(), /内网地址不可达/);
    await page.locator('#search-input').fill('不存在的系统');
    assert.equal(await page.locator('.system-card').count(), 0);
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    assert.match(await page.locator('#empty-title').textContent(), /没有匹配/);
    await page.locator('#search-input').fill('');
    assert.equal(await page.locator('.system-card').count(), 8);
  });

  await t.test('mobile viewport does not overflow and reserved dialog remains operable', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('.system-card').count(), 8);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const card of await page.locator('.system-card').all()) {
      const bounds = await card.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    }
    await page.locator('[data-system-id="cadre-personnel-archive"] .open-button').click();
    assert.equal(await page.locator('#notice-dialog').isVisible(), true);
    const bounds = await page.locator('#notice-dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#notice-dialog').isVisible(), false);
    assert.equal(requests.length, 2);
  });

  await t.test('has no JavaScript or unexpected browser console errors', () => {
    assert.deepEqual(pageErrors, []);
    // Chromium reports HTTP 502 as a console resource error for the deliberate
    // backend failure above. No other console errors are acceptable.
    const unexpected = consoleErrors.filter(message => !/^Failed to load resource: the server responded with a status of 502\b/.test(message));
    assert.deepEqual(unexpected, []);
    assert.ok(consoleErrors.length <= 1);
    assert.deepEqual(openerCalls, ['court-file-cabinet', 'paperless-go']);
  });
});
