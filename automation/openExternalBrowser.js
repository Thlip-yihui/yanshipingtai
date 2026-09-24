'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_START_TIMEOUT_MS = 5000;

function failure(message) {
  return { success: false, message };
}

function launchExternalBrowser(config, options = {}) {
  const executable = config?.executable;
  if (typeof executable !== 'string' || !executable.trim()) {
    return Promise.resolve(failure('专用 Firefox 程序路径未配置，请检查 externalBrowser.executable。'));
  }

  const fileSystem = options.fileSystem || fs;
  try {
    if (!fileSystem.statSync(executable).isFile()) {
      return Promise.resolve(failure('专用 Firefox 程序文件不存在，请检查 externalBrowser.executable。'));
    }
  } catch {
    return Promise.resolve(failure('专用 Firefox 程序文件不存在，请检查 externalBrowser.executable。'));
  }

  const cwd = config.cwd || path.dirname(executable);
  try {
    if (!fileSystem.statSync(cwd).isDirectory()) {
      return Promise.resolve(failure('专用 Firefox 工作目录不存在，请检查 externalBrowser.cwd。'));
    }
  } catch {
    return Promise.resolve(failure('专用 Firefox 工作目录不存在，请检查 externalBrowser.cwd。'));
  }

  const args = Array.isArray(config.args) ? config.args : [];
  const spawnProcess = options.spawnProcess || spawn;
  let child;
  try {
    child = spawnProcess(executable, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
  } catch {
    return Promise.resolve(failure('无法启动专用 Firefox 浏览器，请确认文件可执行且未被系统拦截。'));
  }

  if (typeof child?.unref === 'function') child.unref();
  if (typeof child?.once !== 'function') {
    return Promise.resolve({ success: true, message: '已启动密集架专用 Firefox 浏览器，请在浏览器书签中进入密集架平台。' });
  }

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
    const timer = setTimeout(() => finish(failure('专用 Firefox 启动超时，请检查浏览器文件和本机权限。')), timeoutMs);
    child.once('spawn', () => finish({ success: true, message: '已启动密集架专用 Firefox 浏览器，请在浏览器书签中进入密集架平台。' }));
    child.once('error', () => finish(failure('无法启动专用 Firefox 浏览器，请确认文件可执行且未被系统拦截。')));
  });
}

module.exports = { launchExternalBrowser };
