'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const { createAutomation } = require('../automation/openSystem');

let fixtureServer;
let base;
let browser;
let automation;

function form({ button = true, captcha = false, mode = 'success', custom = false, enterSupport = true } = {}) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本地登录测试</title>
    <body><h1>档案系统登录</h1><form>
    <input type="hidden" name="hidden" value="ignore">
    <input type="text" id="username" placeholder="账号" autocomplete="username">
    <input type="${custom ? 'text' : 'password'}" id="password" autocomplete="current-password">
    ${captcha ? '<label>验证码<input id="captcha" placeholder="请输入验证码"></label>' : ''}
    ${button ? '<button type="submit">登 录</button>' : ''}
    <a href="#help">忘记密码？使用短信找回</a></form>
    <script>
      window.events = { username: { input: 0, change: 0 }, password: { input: 0, change: 0 } };
      for (const id of ['username', 'password']) for (const type of ['input', 'change']) {
        document.getElementById(id).addEventListener(type, () => window.events[id][type]++);
      }
      // A SPA may bind Enter directly without rendering a native submit button.
      if (${JSON.stringify(!button && enterSupport)}) {
        document.getElementById('password').addEventListener('keydown', event => {
          if (event.key === 'Enter') {
            event.preventDefault(); document.querySelector('form').requestSubmit();
          }
        });
      }
      document.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        window.submission = { username: document.getElementById('username').value, password: document.getElementById('password').value };
        const mode = ${JSON.stringify(mode)};
        if (mode === 'disabled') {
          document.getElementById('password').disabled = true;
          document.querySelector('button').disabled = true;
        } else if (mode === 'failure') {
          const message = document.createElement('p'); message.setAttribute('role', 'alert');
          message.textContent = '账号或密码错误'; document.body.append(message);
        } else if (mode === 'otp') {
          document.querySelector('form').innerHTML = '<label>短信验证码<input autocomplete="one-time-code" placeholder="请输入短信验证码"></label><button>验证</button>';
        } else if (mode === 'url-success') {
          history.replaceState({}, '', '/System/views/mainpage/index.jsp');
          document.querySelector('form').remove();
        } else {
          document.cookie = 'session=' + window.submission.username + '; path=/';
          document.querySelector('form').remove();
          const dashboard = document.createElement('main'); dashboard.id = 'dashboard';
          dashboard.textContent = '欢迎进入档案工作台'; document.body.append(dashboard);
          history.replaceState({}, '', '/dashboard');
        }
      });
    </script></body></html>`;
}

before(async () => {
  fixtureServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route === '/never') return;
    if (route === '/delay-data') return void setTimeout(() => res.end('ready'), 1400);
    if (route === '/delayed') return res.end('<html><body><h1>档案系统</h1><script>fetch("/delay-data").then(() => { document.body.innerHTML = "<input type=text><input type=password><button>登录</button>"; });</script></body></html>');
    if (route === '/timeout') return res.end('<html><body>加载中<script src="/never"></script></body></html>');
    if (route === '/blank') return res.end('<html><body></body></html>');
    if (route === '/unavailable') { res.statusCode = 503; return res.end('<h1>服务暂不可用</h1>'); }
    if (route === '/dashboard') return res.end('<h1>档案工作台</h1><p>无需登录的演示页面</p>');
    if (route === '/iframe') return res.end('<h1>统一登录</h1><iframe src="/login" title="登录表单"></iframe>');
    if (route === '/other-confirm') return res.end(form().replace('<body>', '<body><button onclick="window.otherClicked = true">确定</button>'));
    if (route === '/missing-user') return res.end('<h1>登录</h1><input type="password"><button>登录</button>');
    if (route === '/custom') return res.end(form({ custom: true }));
    if (route === '/url-success') return res.end(form({ mode: 'url-success' }));
    if (route === '/enter') return res.end(form({ button: false }));
    if (route === '/no-submit') return res.end(form({ button: false, enterSupport: false }));
    if (route === '/captcha') return res.end(form({ captcha: true }));
    if (route === '/failure') return res.end(form({ mode: 'failure' }));
    if (route === '/disabled') return res.end(form({ mode: 'disabled' }));
    if (route === '/otp') return res.end(form({ mode: 'otp' }));
    res.end(form());
  });
  await new Promise(resolve => fixtureServer.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${fixtureServer.address().port}`;
  automation = createAutomation({
    chromium: { launch: async options => {
      assert.equal(options.headless, false, '生产默认必须启动有头浏览器');
      browser = await chromium.launch({ ...options, headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
      return browser;
    } },
    navigationTimeoutMs: 2000,
    networkIdleTimeoutMs: 600,
    spaWaitMs: 0,
    postSubmitWaitMs: 800
  });
});

after(async () => {
  if (automation) await automation.closeBrowser();
  if (fixtureServer) {
    fixtureServer.closeAllConnections();
    await new Promise(resolve => fixtureServer.close(resolve));
  }
});

async function open(route, overrides = {}) {
  const beforeCount = browser ? browser.contexts().length : 0;
  const result = await automation.openSystem({
    id: 'fixture-login', name: '本地测试', url: base + route,
    username: 'local-demo', password: 'local-demo-secret', enabled: true, loginSelectors: {}, ...overrides
  });
  const contexts = browser.contexts();
  assert.equal(contexts.length, beforeCount + 1, '每次打开均创建并保留独立上下文');
  const context = contexts.at(-1);
  const page = context.pages()[0];
  assert.equal(page.isClosed(), false, '成功或失败后均保留页面');
  return { result, context, page };
}

test('自动填写账号密码、触发 input/change 并点击中文登录按钮', async () => {
  const { result, page } = await open('/login');
  assert.equal(result.success, true, result.message);
  const values = await page.evaluate(() => ({ submission: window.submission, events: window.events }));
  assert.deepEqual(values.submission, { username: 'local-demo', password: 'local-demo-secret' });
  for (const id of ['username', 'password']) {
    assert.ok(values.events[id].input > 0);
    assert.ok(values.events[id].change > 0);
  }
  assert.equal(await page.locator('#dashboard').count(), 1);
});

test('每次打开独立 context，Cookie 不串号', async () => {
  const one = await open('/login', { username: 'first-demo' });
  const two = await open('/dashboard');
  assert.notEqual(one.context, two.context);
  assert.ok((await one.context.cookies()).some(cookie => cookie.name === 'session'));
  assert.equal((await two.context.cookies()).length, 0);
});

test('表单没有按钮时可按回车提交', async () => {
  const { result, page } = await open('/enter');
  assert.equal(result.success, true, result.message);
  assert.equal(await page.locator('#dashboard').count(), 1);
});

test('没有登录按钮且页面不支持回车时，返回明确失败', async () => {
  const { result } = await open('/no-submit');
  assert.equal(result.success, false);
  assert.match(result.message, /未找到登录按钮/);
});

test('优先使用自定义账号、密码、提交及成功选择器', async () => {
  const { result, page } = await open('/custom', { loginSelectors: {
    username: '#username', password: '#password', submit: 'button', success: '#dashboard'
  } });
  assert.equal(result.success, true, result.message);
  assert.equal((await page.evaluate(() => window.submission)).password, 'local-demo-secret');
});

test('可使用目标系统登录后的跳转地址确认成功', async () => {
  const { result, page } = await open('/url-success', { loginSelectors: {
    successUrl: '/System/views/mainpage/index.jsp'
  } });
  assert.equal(result.success, true, result.message);
  assert.match(page.url(), /System\/views\/mainpage\/index\.jsp/);
});

test('支持 iframe 中可见登录表单', async () => {
  const { result, page } = await open('/iframe');
  assert.equal(result.success, true, result.message);
  assert.equal(await page.frames()[1].locator('#dashboard').count(), 1);
});

test('优先提交密码框所在表单，不点击页面其他确定按钮', async () => {
  const { result, page } = await open('/other-confirm');
  assert.equal(result.success, true, result.message);
  assert.equal(await page.evaluate(() => window.otherClicked), undefined);
  assert.equal(await page.locator('#dashboard').count(), 1);
});

test('慢速挂载登录表单不能提前误报无需登录', async () => {
  const { result } = await open('/delayed');
  assert.equal(result.success, false);
  assert.match(result.message, /页面加载超时|未确认/);
});

test('无密码框的已加载页面按无需登录处理', async () => {
  const { result } = await open('/dashboard');
  assert.equal(result.success, true, result.message);
});

test('检测到验证码时停止，不输入或提交任何凭据', async () => {
  const { result, page } = await open('/captcha');
  assert.equal(result.success, false);
  assert.match(result.message, /需要人工处理验证码\/二次验证/);
  assert.equal(await page.locator('#username').inputValue(), '');
  assert.equal(await page.locator('#password').inputValue(), '');
  assert.equal(await page.evaluate(() => window.submission), undefined);
});

test('登录后出现短信验证，返回人工处理而非成功', async () => {
  const { result } = await open('/otp');
  assert.equal(result.success, false);
  assert.match(result.message, /需要人工处理验证码\/二次验证/);
});

test('登录拒绝时返回中文失败并保留浏览器窗口', async () => {
  const { result, page } = await open('/failure');
  assert.equal(result.success, false);
  assert.match(result.message, /失败|错误|未.*成功/);
  assert.equal(await page.locator('input[type="password"]').isVisible(), true);
});

test('提交时暂时禁用密码框，不能误报登录成功', async () => {
  const { result, page } = await open('/disabled');
  assert.equal(result.success, false);
  assert.equal(await page.locator('#password').isVisible(), true);
  assert.equal(await page.locator('#password').isDisabled(), true);
});

test('自定义密码选择器失效时准确报错', async () => {
  const { result } = await open('/dashboard', { loginSelectors: { password: '#required-password' } });
  assert.equal(result.success, false);
  assert.match(result.message, /未找到密码输入框/);
});

test('空白页面不能当作无需登录成功', async () => {
  const { result } = await open('/blank');
  assert.equal(result.success, false);
  assert.match(result.message, /超时|内容为空/);
});

test('找不到账号输入框时返回准确错误', async () => {
  const { result } = await open('/missing-user');
  assert.equal(result.success, false);
  assert.match(result.message, /未找到账号输入框/);
});

test('HTTP 错误页不误判为无需登录成功', async () => {
  const { result } = await open('/unavailable');
  assert.equal(result.success, false);
  assert.match(result.message, /网络错误|503|服务/);
});

test('页面加载超时返回中文原因并保留页面', async () => {
  const { result } = await open('/timeout');
  assert.equal(result.success, false);
  assert.match(result.message, /页面加载超时/);
});
