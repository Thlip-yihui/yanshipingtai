'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildPages, normalizeDesktopUrl } = require('../scripts/build-pages');

test('GitHub Pages builds the shared local interface with a credential-free system list', t => {
  const projectRoot = path.resolve(__dirname, '..');
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-pages-test-'));
  fs.rmdirSync(outputDirectory);
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  const result = buildPages({ projectRoot, outputDirectory, desktopUrl: 'https://demo.example.org/guacamole/#/client/1' });
  assert.equal(result.remoteDesktopConfigured, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'demo-config.json'), 'utf8')),
    { desktopUrl: 'https://demo.example.org/guacamole/#/client/1' });
  const outputHtml = fs.readFileSync(path.join(outputDirectory, 'index.html'), 'utf8');
  const sourceHtml = fs.readFileSync(path.join(projectRoot, 'public', 'index.html'), 'utf8');
  assert.equal(outputHtml, sourceHtml
    .replace('<!-- GITHUB_PAGES_SYSTEMS -->', '<script src="./hosted.js" defer></script>')
    .replace('<!-- GITHUB_PAGES_SETUP_LINK -->', '<a class="nav-link" id="extension-settings-link" href="./extension-guide.html">配置自动登录</a>'));
  assert.match(outputHtml, /id="system-grid"/);
  assert.match(outputHtml, /id="search-input"/);
  assert.ok(fs.existsSync(path.join(outputDirectory, 'hosted.js')));
  assert.ok(fs.existsSync(path.join(outputDirectory, 'app.js')));
  assert.ok(fs.existsSync(path.join(outputDirectory, 'style.css')));
  assert.ok(fs.existsSync(path.join(outputDirectory, 'extension-guide.html')));
  assert.ok(fs.existsSync(path.join(outputDirectory, 'downloads', 'archive-demo-login-extension.zip')));
  assert.ok(!fs.existsSync(path.join(outputDirectory, 'config')));
  const staticScripts = `${fs.readFileSync(path.join(outputDirectory, 'hosted.js'), 'utf8')}\n${fs.readFileSync(path.join(outputDirectory, 'app.js'), 'utf8')}`;
  assert.doesNotMatch(staticScripts, /password\s*:/i);
});

test('unconfigured Pages build stays accessible but leaves remote demonstration unavailable', t => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-pages-test-'));
  fs.rmdirSync(outputDirectory);
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  const result = buildPages({ outputDirectory });
  assert.equal(result.remoteDesktopConfigured, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'demo-config.json'), 'utf8')), { desktopUrl: '' });
});

test('rebuilding a managed Pages output replaces stale settings without removing unrelated directories', t => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-pages-test-'));
  fs.rmdirSync(outputDirectory);
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  buildPages({ outputDirectory, desktopUrl: 'https://first.example.org/' });
  buildPages({ outputDirectory, desktopUrl: 'https://second.example.org/' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'demo-config.json'), 'utf8')),
    { desktopUrl: 'https://second.example.org/' });
  const unrelatedDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-pages-owned-test-'));
  t.after(() => fs.rmSync(unrelatedDirectory, { recursive: true, force: true }));
  assert.throws(() => buildPages({ outputDirectory: unrelatedDirectory }), /未修改现有文件/);
});

test('remote desktop URL must be HTTPS and cannot contain credentials', () => {
  assert.throws(() => normalizeDesktopUrl('http://demo.example.org/'), /HTTPS/);
  assert.throws(() => normalizeDesktopUrl('https://person:secret@demo.example.org/'), /HTTPS/);
  assert.equal(normalizeDesktopUrl(''), '');
});
