'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { launchInstaller, SUCCESS_MESSAGE } = require('../automation/openInstaller');

function fileSystemFor(...paths) {
  const existing = new Set(paths);
  return {
    statSync(target) {
      if (!existing.has(target)) throw new Error('ENOENT');
      return { isFile: () => target.endsWith('.exe') };
    },
  };
}

test('启动艾搜安装包时使用配置路径并保持独立进程', async () => {
  const packagePath = 'D:/demo/aisouagentInstaller.exe';
  const child = new EventEmitter();
  let unrefCalled = false;
  child.unref = () => { unrefCalled = true; };
  let call;
  const resultPromise = launchInstaller({ packagePath, args: ['/quiet'] }, {
    fileSystem: fileSystemFor(packagePath),
    spawnProcess: (...args) => {
      call = args;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { success: true, message: SUCCESS_MESSAGE });
  assert.deepEqual(call, [packagePath, ['/quiet'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  }]);
  assert.equal(unrefCalled, true);
});

test('艾搜安装包路径不存在时不启动进程', async () => {
  let called = false;
  const result = await launchInstaller({ packagePath: 'D:/missing/aisouagentInstaller.exe' }, {
    fileSystem: fileSystemFor(),
    spawnProcess: () => { called = true; },
  });
  assert.equal(result.success, false);
  assert.match(result.message, /安装包不存在/);
  assert.equal(called, false);
});

test('艾搜安装包启动错误时返回中文提示且不暴露底层异常', async () => {
  const child = new EventEmitter();
  child.unref = () => {};
  const resultPromise = launchInstaller({ packagePath: 'D:/demo/aisouagentInstaller.exe' }, {
    fileSystem: fileSystemFor('D:/demo/aisouagentInstaller.exe'),
    spawnProcess: () => {
      queueMicrotask(() => child.emit('error', new Error('internal path details')));
      return child;
    },
  });
  const result = await resultPromise;
  assert.deepEqual(result, { success: false, message: '无法打开艾搜客户端安装包，请确认文件可执行且未被系统拦截。' });
});
