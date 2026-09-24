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

test('public portal mirrors the navigation UI and explains the unconnected demo host', async t => {
  const { page, errors } = await openPortal(t, '');
  await page.getByText('演示主机尚未接入', { exact: true }).waitFor();
  assert.equal(await page.locator('.system-card').count(), 8);
  assert.equal(await page.locator('.system-card .open-button').count(), 8);
  assert.equal(await page.locator('.system-card button.open-button').count(), 8);
  assert.deepEqual(await page.locator('.system-card .card-badge').allTextContents(), Array(8).fill('已配置'));
  assert.equal(await page.locator('#page-title').count(), 1);
  assert.equal(await page.locator('.hero-art').count(), 1);
  assert.equal(await page.locator('[data-filter]').count(), 3);
  assert.equal(await page.locator('#search-input').count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.ok(!(await page.content()).includes('password'));
  assert.ok(!(await page.content()).includes('123456'));
  assert.deepEqual(errors, []);

  await page.getByRole('button', { name: '系统演示：密集架一体化平台管理系统' }).click();
  assert.equal(await page.locator('#notice-dialog').isVisible(), true);
  assert.match(await page.locator('#dialog-message').textContent(), /GitHub Pages 只能托管导航页面/);
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

test('configured cards open only the HTTPS desktop endpoint and describe the shared session', async t => {
  const desktopUrl = 'https://demo.example.org/guacamole/#/client/archive';
  const { page, context, errors } = await openPortal(t, desktopUrl);
  await page.getByText('受控演示桌面已接入', { exact: true }).waitFor();
  assert.equal(await page.locator('.system-card a[href="https://demo.example.org/guacamole/#/client/archive"]').count(), 8);
  assert.match(await page.locator('#hosted-note').textContent(), /各系统入口共用授权 Windows 演示桌面/);
  await context.route('https://demo.example.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Demo fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '系统演示：密集架一体化平台管理系统' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), desktopUrl);
  assert.deepEqual(errors, []);
});
