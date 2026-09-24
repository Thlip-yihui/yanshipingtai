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

test('public portal shows all eight systems with disabled links until the gateway is configured', async t => {
  const { page } = await openPortal(t, '');
  await page.getByText('网站已发布，但 Windows 演示主机尚未接入。', { exact: false }).waitFor();
  assert.equal(await page.locator('.hosted-card').count(), 8);
  assert.equal(await page.locator('.hosted-card a[aria-disabled="true"]').count(), 8);
  assert.equal(await page.getByRole('heading', { name: '档案系统演示导航台' }).count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
});

test('configured cards open only the HTTPS desktop endpoint and describe the shared session', async t => {
  const desktopUrl = 'https://demo.example.org/guacamole/#/client/archive';
  const { page, context, errors } = await openPortal(t, desktopUrl);
  await page.getByText('受控远程桌面已配置', { exact: true }).waitFor();
  assert.equal(await page.locator('.hosted-card a[href="https://demo.example.org/guacamole/#/client/archive"]').count(), 8);
  assert.match(await page.locator('#desktop-note').textContent(), /所有入口使用同一 Windows 演示桌面/);
  await context.route('https://demo.example.org/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Demo fixture</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '进入演示桌面：密集架一体化平台管理系统' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  assert.equal(popup.url(), desktopUrl);
  assert.deepEqual(errors, []);
});
