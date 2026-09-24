'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { launchExternalBrowser } = require('../automation/openExternalBrowser');

function fileSystemFor(...paths) {
  const existing = new Set(paths);
  return {
    statSync(target) {
      if (!existing.has(target)) throw new Error('ENOENT');
      return { isFile: () => target.endsWith('.exe'), isDirectory: () => !target.endsWith('.exe') };
    },
  };
}

test('启动便携 Firefox 时使用配置的程序、工作目录和独立进程', async () => {
  const executable = 'C:/demo/FirefoxPortable.exe';
  const cwd = 'C:/demo';
  const child = new EventEmitter();
  let unrefCalled = false;
  child.unref = () => { unrefCalled = true; };
  let call;
  const resultPromise = launchExternalBrowser({ executable, cwd, args: ['-private-window'] }, {
    fileSystem: fileSystemFor(executable, cwd),
    spawnProcess: (...args) => {
      call = args;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { success: true, message: '已启动密集架专用 Firefox 浏览器，请在浏览器书签中进入密集架平台。' });
  assert.deepEqual(call, [executable, ['-private-window'], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }]);
  assert.equal(unrefCalled, true);
});

test('便携 Firefox 路径不存在时不启动进程并返回中文原因', async () => {
  let called = false;
  const result = await launchExternalBrowser({ executable: 'C:/missing/FirefoxPortable.exe', cwd: 'C:/missing' }, {
    fileSystem: fileSystemFor(),
    spawnProcess: () => { called = true; },
  });
  assert.equal(result.success, false);
  assert.match(result.message, /程序文件不存在/);
  assert.equal(called, false);
});

test('便携 Firefox 启动错误时不暴露底层异常', async () => {
  const child = new EventEmitter();
  child.unref = () => {};
  const resultPromise = launchExternalBrowser({ executable: 'C:/demo/FirefoxPortable.exe', cwd: 'C:/demo' }, {
    fileSystem: fileSystemFor('C:/demo/FirefoxPortable.exe', 'C:/demo'),
    spawnProcess: () => {
      queueMicrotask(() => child.emit('error', new Error('internal path details')));
      return child;
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { success: false, message: '无法启动专用 Firefox 浏览器，请确认文件可执行且未被系统拦截。' });
});
