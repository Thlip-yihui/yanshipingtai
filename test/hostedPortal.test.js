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

async function openPortal(t, desktopUrl) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-hosted-portal-'));
  const siteDirectory = path.join(temporaryDirectory, 'site');
  buildPages({ outputDirectory: siteDirectory, desktopUrl });
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
  return { page, context, errors };
}

test('public portal links directly to public web systems and explains private app requirements', async t => {
  const { page, context, errors } = await openPortal(t, '');
  await page.getByText('公网网页入口已加载', { exact: true }).waitFor();
  assert.equal(await page.locator('.system-card').count(), 8);
  assert.equal(await page.locator('.system-card .open-button').count(), 8);
  assert.equal(await page.locator('.system-card a.open-button').count(), 6);
  assert.equal(await page.locator('.system-card button.open-button').count(), 2);
  assert.deepEqual(await page.locator('.system-card .card-badge').allTextContents(), Array(8).fill('已配置'));
  assert.equal(await page.locator('#page-title').count(), 1);
  assert.equal(await page.locator('.hero-art').count(), 1);
  assert.equal(await page.locator('[data-filter]').count(), 3);
  assert.equal(await page.locator('#search-input').count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.ok(!(await page.content()).includes('password'));
  assert.ok(!(await page.content()).includes('123456'));
  assert.deepEqual(errors, []);

  const courtUrl = 'http://47.115.224.12:8080/#/home/borrowReturn';
  const courtLink = page.locator('[data-system-id="court-file-cabinet"] a.open-button');
  assert.equal(await courtLink.getAttribute('href'), courtUrl);
  assert.equal(await courtLink.getAttribute('target'), '_blank');
  assert.match(await courtLink.getAttribute('rel'), /noopener/);
  await context.route('http://47.115.224.12:8080/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>System fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await courtLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), courtUrl);

  await page.getByRole('button', { name: '系统演示：密集架一体化平台管理系统' }).click();
  assert.equal(await page.locator('#notice-dialog').isVisible(), true);
  assert.equal(await page.locator('#dialog-title').textContent(), '需要内网或演示桌面');
  assert.match(await page.locator('#dialog-message').textContent(), /私有内网地址 192\.168\.3\.251/);
  await page.getByRole('button', { name: '我知道了' }).click();

  await page.getByRole('button', { name: '系统演示：艾搜文件智能体' }).click();
  assert.equal(await page.locator('#dialog-title').textContent(), '需要 Windows 客户端');
  assert.match(await page.locator('#dialog-message').textContent(), /GitHub Pages 无法在访问者电脑上启动/);
  await page.getByRole('button', { name: '我知道了' }).click();

  await page.getByRole('button', { name: '待配置', exact: true }).click();
  assert.equal(await page.locator('.system-card').count(), 0);
  assert.equal(await page.locator('#empty-title').textContent(), '没有匹配的系统');
  await page.getByRole('button', { name: '全部系统', exact: true }).click();
  await page.getByRole('searchbox').fill('扫描加工');
  assert.equal(await page.locator('.system-card').count(), 1);
  assert.equal(await page.locator('.system-card h3').textContent(), 'AI辅助数字化扫描加工');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: '使用说明' }).click();
  assert.equal(await page.locator('#help-dialog').isVisible(), true);
  await page.getByRole('button', { name: '开始体验' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '全部系统', exact: true }).click();
  assert.equal(await page.locator('.system-card').count(), 8);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

test('private network and Windows app cards use the configured HTTPS desktop; public web cards stay direct', async t => {
  const desktopUrl = 'https://demo.example.org/guacamole/#/client/archive';
  const { page, context, errors } = await openPortal(t, desktopUrl);
  await page.getByText('公网网页与专用桌面入口已加载', { exact: true }).waitFor();
  assert.equal(await page.locator('.system-card a[href="https://demo.example.org/guacamole/#/client/archive"]').count(), 2);
  assert.equal(await page.locator('.system-card a[href^="http://"]').count(), 6);
  assert.match(await page.locator('#hosted-note').textContent(), /公网网页系统从卡片直接打开/);
  await context.route('https://demo.example.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Demo fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '系统演示：密集架一体化平台管理系统' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), desktopUrl);
  assert.deepEqual(errors, []);
});
