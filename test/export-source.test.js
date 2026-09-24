'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SOURCE_FILES, exportSource } = require('../scripts/export-source');

test('导出清单排除真实配置、二进制、日志和未知文件，保留 lockfile 与 CI', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of SOURCE_FILES) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `source fixture: ${file}`);
  }
  for (const file of ['config/systems.js', '.env', 'installer.exe', 'private.conf', 'debug.log', 'public/accidental-secret.txt']) {
    fs.writeFileSync(path.join(root, file), 'fixture-private-value');
  }
  const first = exportSource(root);
  const second = exportSource(root);
  assert.notEqual(first, second);
  for (const directory of [first, second]) {
    const files = fs.readdirSync(directory, { recursive: true }).filter(file => fs.statSync(path.join(directory, file)).isFile());
    assert.deepEqual(files.map(file => file.split(path.sep).join('/')).sort(), [...SOURCE_FILES].sort());
    assert.ok(files.includes('package-lock.json'));
    for (const file of files) assert.equal(fs.readFileSync(path.join(directory, file), 'utf8').includes('fixture-private-value'), false);
  }
});

test('配置模板不含账号密码且可通过结构校验', () => {
  const systems = require('../config/systems.example');
  require('../server').validateSystems(systems);
  assert.equal(systems.length, 8);
  assert.ok(systems.every(system => system.username === '' && system.password === ''));
  assert.equal(systems.find(system => system.id === 'cadre-personnel-archive').url, 'http://a.wenzhi.icu:58817/');
});
