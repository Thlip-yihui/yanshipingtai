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

test('public portal shows seven direct web links and leaves the Windows client reserved', async t => {
  const { page } = await openPortal(t, '');
  await page.getByText('7 个网页系统入口', { exact: true }).waitFor();
  assert.equal(await page.locator('.hosted-card').count(), 8);
  assert.equal(await page.locator('.hosted-card a[aria-disabled="true"]').count(), 1);
  assert.equal(await page.locator('.hosted-card a.open-button:not([aria-disabled="true"])').count(), 7);
  assert.equal(await page.locator('.hosted-card[data-system-id="paperless-go"] a').getAttribute('href'), 'http://47.113.229.248:4000/');
  assert.equal(await page.locator('.hosted-card[data-system-id="dense-shelf-platform"] a').getAttribute('href'), 'http://192.168.3.251/#/home');
  assert.equal(await page.locator('.hosted-card[data-system-id="aisou-file-agent"] a').getAttribute('aria-disabled'), 'true');
  assert.equal(await page.getByRole('link', { name: '下载自动登录扩展' }).getAttribute('href'), './downloads/archive-demo-login-extension.zip');
  assert.equal(await page.getByRole('link', { name: '安装说明' }).getAttribute('href'), './extension-guide.html');
  assert.equal(await page.getByRole('heading', { name: '档案系统演示导航台' }).count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 360, height: 780 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

test('configured portal keeps public websites direct and routes private desktop systems to HTTPS', async t => {
  const desktopUrl = 'https://demo.example.org/guacamole/#/client/archive';
  const { page, context, errors } = await openPortal(t, desktopUrl);
  await page.getByText('公网入口及演示桌面可用', { exact: true }).waitFor();
  assert.equal(await page.locator('.hosted-card a[href="https://demo.example.org/guacamole/#/client/archive"]').count(), 2);
  assert.equal(await page.locator('.hosted-card a[href="http://47.113.229.248:4000/"]').count(), 1);
  assert.match(await page.locator('#desktop-note').textContent(), /六个公网网页系统直接打开/);
  await context.route('https://demo.example.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Demo fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '进入演示桌面：密集架一体化平台管理系统' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), desktopUrl);
  await page.goto(new URL('/extension-guide.html', page.url()).href);
  assert.equal(await page.getByRole('heading', { name: '自动登录扩展' }).count(), 1);
  await page.setViewportSize({ width: 360, height: 780 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(errors, []);
});
