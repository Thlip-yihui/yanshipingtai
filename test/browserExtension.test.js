'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { buildExtension } = require('../scripts/build-extension');

const root = path.resolve(__dirname, '..');
const systems = require('../browser-extension/systems.js');
let server;
let browser;
let baseUrl;

function pageHtml({ captcha = false, mode = 'success' } = {}) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>
    <form><input id="user" type="text" name="username" placeholder="账号">
    <input id="pass" type="password" name="password">
    ${captcha ? '<label>验证码<input name="captcha" placeholder="请输入验证码"></label>' : ''}
    <button type="submit">登录</button></form>
    <script>
      window.events = { input: 0, change: 0 };
      for (const type of ['input', 'change']) document.querySelector('#user').addEventListener(type, () => window.events[type]++);
      document.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        window.submitCount = (window.submitCount || 0) + 1;
        window.submitted = { user: document.querySelector('#user').value, password: document.querySelector('#pass').value };
        if (${JSON.stringify(mode === 'success')}) {
          document.querySelector('form').remove();
          history.replaceState({}, '', '/home');
        } else if (${JSON.stringify(mode === 'failure')}) {
          const message = document.createElement('p');
          message.textContent = '账号或密码错误';
          document.body.append(message);
        }
      });
    </script>
  </body></html>`;
}

before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/captcha') return res.end(pageHtml({ captcha: true }));
    if (req.url === '/failure') return res.end(pageHtml({ mode: 'failure' }));
    res.end(pageHtml());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
});

after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test('extension build contains no credentials and grants only the configured demo hosts', () => {
  const output = buildExtension();
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  const bundled = fs.readFileSync(path.join(output, 'systems.js'), 'utf8');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(systems.length, 7);
  assert.match(manifest.host_permissions.join('\n'), /thlip-yihui\.github\.io/);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.doesNotMatch(bundled, /"password"\s*:/);
  assert.equal(fs.existsSync(path.join(output, 'config')), false);
});

test('GitHub Pages dense-shelf button opens its fixed private-system URL', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.open = url => { window.openedDemoUrl = url; return null; };
  });
  await page.route('https://thlip-yihui.github.io/yanshipingtai/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><article data-system-id="dense-shelf-platform"><button type="button">系统演示</button></article></body></html>'
  }));
  await page.goto('https://thlip-yihui.github.io/yanshipingtai/');
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'systems.js') });
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'portal.js') });
  await page.locator('button').evaluate(button => button.addEventListener('click', () => { window.pageHandlerRan = true; }));
  await page.locator('button').click();
  assert.equal(await page.evaluate(() => window.openedDemoUrl), 'http://192.168.3.251/#/home');
  assert.equal(await page.evaluate(() => Boolean(window.pageHandlerRan)), false);
  await page.close();
});

test('GitHub Pages dense-shelf link opens its configured private-system URL', async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.open = url => { window.openedDemoUrl = url; return null; };
  });
  await page.route('https://thlip-yihui.github.io/yanshipingtai/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><article data-system-id="dense-shelf-platform"><a class="open-button" href="http://192.168.3.251/#/home">系统演示</a></article></body></html>'
  }));
  await page.goto('https://thlip-yihui.github.io/yanshipingtai/');
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'systems.js') });
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'portal.js') });
  await page.locator('a').click();
  assert.equal(await page.evaluate(() => window.openedDemoUrl), 'http://192.168.3.251/#/home');
  await page.close();
});

test('failed logins are not resubmitted after a page reload in the same tab', async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/failure`);
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'login-runner.js') });
  const options = {
    system: { id: 'fixture', selectors: {} },
    credentials: { username: 'demo-user', password: 'demo-password' },
    waitMs: 100,
    postSubmitWaitMs: 300
  };
  const first = await page.evaluate(async options => window.ArchiveDemoLogin.run({ ...options, document, window }), options);
  const second = await page.evaluate(async options => window.ArchiveDemoLogin.run({ ...options, document, window }), options);
  assert.equal(first.status, 'login-rejected');
  assert.equal(second.status, 'already-attempted');
  assert.equal(await page.evaluate(() => window.submitCount), 1);
  await page.close();
});

test('login runner fills username and password, emits input/change, and submits the form', async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'login-runner.js') });
  const result = await page.evaluate(async () => window.ArchiveDemoLogin.run({
    system: { id: 'fixture', selectors: {} },
    credentials: { username: 'demo-user', password: 'demo-password' },
    document, window, waitMs: 100, postSubmitWaitMs: 300
  }));
  assert.equal(result.status, 'success');
  assert.deepEqual(await page.evaluate(() => window.submitted), { user: 'demo-user', password: 'demo-password' });
  assert.deepEqual(await page.evaluate(() => window.events), { input: 1, change: 1 });
  await page.close();
});

test('login runner stops at a verification challenge without submitting credentials', async () => {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/captcha`);
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'login-runner.js') });
  const result = await page.evaluate(async () => window.ArchiveDemoLogin.run({
    system: { id: 'fixture', selectors: {} },
    credentials: { username: 'demo-user', password: 'demo-password' },
    document, window, waitMs: 100, postSubmitWaitMs: 300
  }));
  assert.equal(result.status, 'manual-verification');
  assert.equal(await page.evaluate(() => window.submitted), undefined);
  await page.close();
});

test('configured selectors skip hidden duplicate IDs and submit through the visible standalone login form', async () => {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  await page.setContent(`<!doctype html><html><body>
    <section style="display:none">
      <input id="txtaccount" type="text">
      <input id="txtpassword" type="password">
      <div id="btlogin">旧表单登录</div>
    </section>
    <section id="loginBox">
      <input id="txtaccount" type="text" placeholder="请输入账号">
      <input id="txtpassword" type="password" placeholder="请输入密码">
      <div id="btlogin">登录</div>
    </section>
    <script>
      document.querySelectorAll('#btlogin')[1].addEventListener('click', () => {
        window.submitted = {
          username: document.querySelectorAll('#txtaccount')[1].value,
          password: document.querySelectorAll('#txtpassword')[1].value
        };
        document.querySelector('#loginBox').remove();
      });
    </script>
  </body></html>`);
  await page.addScriptTag({ path: path.join(root, 'browser-extension', 'login-runner.js') });
  const result = await page.evaluate(async () => window.ArchiveDemoLogin.run({
    system: { id: 'standalone-fixture', selectors: {
      username: '#txtaccount', password: '#txtpassword', submit: '#btlogin'
    } },
    credentials: { username: 'demo-user', password: 'demo-password' },
    document, window, waitMs: 100, postSubmitWaitMs: 300
  }));
  assert.equal(result.status, 'success');
  assert.deepEqual(await page.evaluate(() => window.submitted), {
    username: 'demo-user', password: 'demo-password'
  });
  await page.close();
});
