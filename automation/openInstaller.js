'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DEFAULT_START_TIMEOUT_MS = 5000;
const SUCCESS_MESSAGE = '已打开艾搜客户端安装包，请按提示完成安装，安装后运行客户端即可使用。';

function failure(message) {
  return { success: false, message };
}

function launchInstaller(config, options = {}) {
  const packagePath = config?.packagePath;
  if (typeof packagePath !== 'string' || !packagePath.trim()) {
    return Promise.resolve(failure('艾搜客户端安装包路径未配置，请检查 externalInstaller.packagePath。'));
  }

  const fileSystem = options.fileSystem || fs;
  try {
    if (!fileSystem.statSync(packagePath).isFile()) {
      return Promise.resolve(failure('艾搜客户端安装包不存在，请检查 externalInstaller.packagePath。'));
    }
  } catch {
    return Promise.resolve(failure('艾搜客户端安装包不存在，请检查 externalInstaller.packagePath。'));
  }

  const args = Array.isArray(config.args) ? config.args : [];
  const spawnProcess = options.spawnProcess || spawn;
  let child;
  try {
    child = spawnProcess(packagePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
  } catch {
    return Promise.resolve(failure('无法打开艾搜客户端安装包，请确认文件可执行且未被系统拦截。'));
  }

  if (typeof child?.unref === 'function') child.unref();
  if (typeof child?.once !== 'function') return Promise.resolve({ success: true, message: SUCCESS_MESSAGE });

  const timeoutMs = Number.isInteger(options.startTimeoutMs)
    ? Math.max(1000, Math.min(options.startTimeoutMs, 60000)) : DEFAULT_START_TIMEOUT_MS;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(failure('艾搜客户端安装包打开超时，请检查本机权限。')), timeoutMs);
    child.once('spawn', () => finish({ success: true, message: SUCCESS_MESSAGE }));
    child.once('error', () => finish(failure('无法打开艾搜客户端安装包，请确认文件可执行且未被系统拦截。')));
  });
}

module.exports = { launchInstaller, SUCCESS_MESSAGE };
