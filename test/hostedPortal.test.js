'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { chromium } = require('playwright');
const { buildPages } = require('../scripts/build-pages');

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || undefined });
});

after(async () => browser?.close());

async function openPortal(t) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-hosted-portal-'));
  const siteDirectory = path.join(temporaryDirectory, 'site');
  buildPages({ outputDirectory: siteDirectory });
  const server = http.createServer(express.static(siteDirectory, { index: ['index.html'] }));
  t.after(async () => {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('.system-card').first().waitFor();
  return { page, context, errors };
}

test('GitHub Pages reuses the local portal layout, controls, and system order', async t => {
  const { page, errors } = await openPortal(t);
  assert.equal(await page.locator('.system-card').count(), 8);
  assert.deepEqual(await page.locator('.system-card h3').allTextContents(), [
    '智能文件柜-法院', 'AI辅助数字化扫描加工', '档案数字化管理系统', '密集架一体化平台管理系统',
    '综合档案管理系统', '干部人事档案管理系统', '综合单机版档案系统', '艾搜文件智能体'
  ]);
  assert.equal(await page.locator('.system-card .open-button').first().textContent(), '系统演示');
  assert.equal(await page.locator('#service-label').textContent(), '公网系统入口已加载');
  assert.equal(await page.locator('#search-input').count(), 1);
  assert.equal(await page.locator('[data-filter]').count(), 3);
  assert.equal(await page.locator('.system-card[data-system-id="paperless-go"] .detail-row dd').first().textContent(), 'http://47.113.229.248:4000/');
  assert.equal(await page.locator('.system-card[data-system-id="paperless-go"] .detail-row dd').nth(1).textContent(), 'admin');
  assert.doesNotMatch(await page.locator('body').innerText(), /Admin@123|123456|a123456\./);

  await page.locator('#search-input').fill('AI辅助数字化扫描');
  assert.equal(await page.locator('.system-card').count(), 1);
  assert.equal(await page.locator('.system-card h3').textContent(), 'AI辅助数字化扫描加工');
  await page.locator('#search-input').fill('');
  await page.getByRole('button', { name: '待配置', exact: true }).click();
  assert.equal(await page.locator('.system-card').count(), 0);
  await page.getByRole('button', { name: '全部系统' }).click();

  await page.getByRole('button', { name: '使用说明' }).click();
  assert.equal(await page.getByRole('heading', { name: '首次设置登录信息' }).count(), 1);
  assert.match(await page.locator('#help-dialog').innerText(), /每位用户在自己的浏览器中安装一次/);
  const guideLink = page.getByRole('link', { name: '查看安装说明' });
  assert.equal(await guideLink.getAttribute('href'), './extension-guide.html');
  assert.equal(await guideLink.evaluate(element => getComputedStyle(element).textDecorationLine), 'none');
  assert.deepEqual(errors, []);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  await page.setViewportSize({ width: 360, height: 780 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

test('hosted system action opens the configured target and local-only client explains its limitation', async t => {
  const { page, context, errors } = await openPortal(t);
  await context.route('http://47.113.229.248:4000/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<title>Demo fixture</title>'
  }));
  const popupPromise = page.waitForEvent('popup');
  await page.locator('.system-card[data-system-id="paperless-go"] .open-button').click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), 'http://47.113.229.248:4000/');

  await page.locator('.system-card[data-system-id="aisou-file-agent"] .open-button').click();
  assert.equal(await page.getByRole('heading', { name: '艾搜客户端需在本机运行' }).count(), 1);
  assert.match(await page.locator('#dialog-message').textContent(), /无法启动访问者电脑上的 Windows 程序/);

  await page.goto(new URL('/extension-guide.html', page.url()).href);
  assert.equal(await page.getByRole('heading', { name: '自动登录扩展' }).count(), 1);
  assert.match(await page.locator('main').textContent(), /每个浏览器首次填写并保存.*密码一次/);
  assert.equal(await page.getByRole('link', { name: '下载扩展 ZIP' }).getAttribute('href'), './downloads/archive-demo-login-extension.zip');
  await page.setViewportSize({ width: 360, height: 780 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
});
