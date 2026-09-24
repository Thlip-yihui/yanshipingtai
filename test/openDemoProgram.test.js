'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAutomationScript, launchDemoProgram } = require('../automation/openDemoProgram');

function fileSystemFor(...paths) {
  const existing = new Set(paths);
  return {
    statSync(target) {
      if (!existing.has(target)) throw new Error('ENOENT');
      return { isFile: () => target.endsWith('.exe'), isDirectory: () => !target.endsWith('.exe') };
    },
  };
}

test('启动花都演示程序后执行隧道和平台按钮自动化', async () => {
  const executable = 'E:/demo/演示程序.exe';
  const cwd = 'E:/demo';
  const child = new EventEmitter();
  child.unref = () => {};
  let call;
  let automationConfig;
  const resultPromise = launchDemoProgram({ executable, cwd, platformButtonText: '一体化平台3.2' }, {
    fileSystem: fileSystemFor(executable, cwd),
    spawnProcess: (...args) => {
      call = args;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
    runUiAutomation: async config => {
      automationConfig = config;
      return { success: true, message: '已完成演示程序自动化' };
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { success: true, message: '已完成演示程序自动化' });
  assert.deepEqual(call, [executable, [], { cwd, detached: true, stdio: 'ignore', windowsHide: false }]);
  assert.equal(automationConfig.platformButtonText, '一体化平台3.2');
});

test('演示程序路径不存在时不启动进程', async () => {
  let called = false;
  const result = await launchDemoProgram({ executable: 'E:/missing/演示程序.exe', cwd: 'E:/missing' }, {
    fileSystem: fileSystemFor(),
    spawnProcess: () => { called = true; },
  });
  assert.equal(result.success, false);
  assert.match(result.message, /演示程序文件不存在/);
  assert.equal(called, false);
});

test('演示程序启动超时但隧道服务运行时继续打开平台', async () => {
  const executable = 'E:/demo/演示程序.exe';
  const cwd = 'E:/demo';
  const child = new EventEmitter();
  child.unref = () => {};
  let automated = false;
  const result = await launchDemoProgram({ executable, cwd }, {
    fileSystem: fileSystemFor(executable, cwd),
    spawnProcess: () => child,
    startTimeoutMs: 1,
    ensureTunnelService: async () => ({ success: true, message: '隧道服务正在运行' }),
    runUiAutomation: async () => {
      automated = true;
      return { success: false, message: '不应进入界面自动化' };
    },
  });
  assert.deepEqual(result, { success: true, message: '隧道服务正在运行' });
  assert.equal(automated, false);
});

test('生成的 Windows 自动化脚本包含稳定的窗口和演示按钮目标', () => {
  const script = createAutomationScript({
    windowTitle: 'HUA DU Platform',
    windowClass: 'HUA DU UI - Manage Tunnels',
    connectButtonText: '连接 (A)',
    platformButtonText: '一体化平台3.2',
  });
  assert.match(script, /HUA DU Platform/);
  assert.match(script, /HUA DU UI - Manage Tunnels/);
  assert.match(script, /连接 \(A\)/);
  assert.match(script, /一体化平台3\.2/);
});
