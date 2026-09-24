'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const DEFAULT_START_TIMEOUT_MS = 8000;
const DEFAULT_UI_TIMEOUT_MS = 20000;
const SUCCESS_MESSAGE = '演示程序已启动，隧道已连接，已进入平台展示的一体化平台3.2。';
const FALLBACK_SUCCESS_MESSAGE = '检测到隧道服务正在运行，将尝试打开一体化平台3.2系统。';

function failure(message) {
  return { success: false, message };
}

function psString(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function createAutomationScript(config) {
  const windowTitle = config.windowTitle || 'HUA DU Platform';
  const windowClass = config.windowClass || 'HUA DU UI - Manage Tunnels';
  const connectText = config.connectButtonText || '连接 (A)';
  const connectedText = config.connectedText || '已连接';
  const tunnelTabOffset = config.tunnelTabOffset || { x: 60, y: 95 };
  const platformTabOffset = config.platformTabOffset || { x: 290, y: 95 };
  const platformButtonText = config.platformButtonText || '一体化平台3.2';
  const timeout = Number.isInteger(config.uiTimeoutMs)
    ? Math.max(3000, Math.min(config.uiTimeoutMs, 60000)) : DEFAULT_UI_TIMEOUT_MS;

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ArchiveDemoNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int command);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr insertAfter, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static readonly IntPtr TopMost = new IntPtr(-1);
  public static readonly IntPtr NotTopMost = new IntPtr(-2);
  public const uint MouseDown = 0x0002;
  public const uint MouseUp = 0x0004;
  public const uint NoMove = 0x0002;
  public const uint NoSize = 0x0001;
  public const uint ShowWindow = 0x0040;
  public const int Restore = 9;
}
'@

[ArchiveDemoNative]::SetProcessDPIAware() | Out-Null

function Result([bool]$success, [string]$message) {
  if ($success) { Write-Output ('OK|' + $message); exit 0 }
  Write-Output ('ERROR|' + $message); exit 1
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$window = $null
$deadline = [DateTime]::UtcNow.AddMilliseconds(${timeout})
while (-not $window -and [DateTime]::UtcNow -lt $deadline) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($candidate in $windows) {
    $props = $candidate.Current
    if (($props.Name -like '*${psString(windowTitle).slice(1, -1)}*') -or ($props.ClassName -eq ${psString(windowClass)})) {
      $window = $candidate
      break
    }
  }
  if (-not $window) { Start-Sleep -Milliseconds 200 }
}
if (-not $window) { Result $false '未找到花都隧道演示程序窗口，请确认附件程序已启动。' }

$handle = [IntPtr]$window.Current.NativeWindowHandle
[ArchiveDemoNative]::ShowWindowAsync($handle, [ArchiveDemoNative]::Restore) | Out-Null
[ArchiveDemoNative]::SetWindowPos($handle, [ArchiveDemoNative]::TopMost, 40, 40, 1200, 850, [ArchiveDemoNative]::ShowWindow) | Out-Null
[ArchiveDemoNative]::BringWindowToTop($handle) | Out-Null
[ArchiveDemoNative]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 400
$window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, ${psString(windowClass)})))
if (-not $window) { Result $false '演示程序窗口移动后无法读取，请在演示程序中手动操作。' }

function Descendants() {
  return $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
}

function FindNamed([string]$text) {
  foreach ($element in (Descendants)) {
    $name = $element.Current.Name
    if ($name -and $name -like ('*' + $text + '*')) { return $element }
  }
  return $null
}

function ClickPoint([int]$x, [int]$y) {
  [ArchiveDemoNative]::SetCursorPos($x, $y) | Out-Null
  Start-Sleep -Milliseconds 80
  [ArchiveDemoNative]::mouse_event([ArchiveDemoNative]::MouseDown, 0, 0, 0, [UIntPtr]::Zero)
  [ArchiveDemoNative]::mouse_event([ArchiveDemoNative]::MouseUp, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 250
}

function ClickElement($element) {
  if (-not $element) { return $false }
  $rect = $element.Current.BoundingRectangle
  if ($rect.Width -le 0 -or $rect.Height -le 0) { return $false }
  ClickPoint ([int]($rect.X + $rect.Width / 2)) ([int]($rect.Y + $rect.Height / 2))
  return $true
}

function ClickTab([int]$xOffset, [int]$yOffset) {
  $rect = $window.Current.BoundingRectangle
  ClickPoint ([int]($rect.X + $xOffset)) ([int]($rect.Y + $yOffset))
}

$connected = FindNamed ${psString(connectedText)}
$connect = FindNamed ${psString(connectText)}
if (-not $connected -and -not $connect) {
  ClickTab ${Number(tunnelTabOffset.x) || 60} ${Number(tunnelTabOffset.y) || 95}
  Start-Sleep -Milliseconds 350
  $connected = FindNamed ${psString(connectedText)}
  $connect = FindNamed ${psString(connectText)}
}

if (-not $connected) {
  if (-not $connect) { Result $false '未找到隧道连接按钮，请检查花都隧道演示程序界面。' }
  if (-not (ClickElement $connect)) { Result $false '无法点击隧道连接按钮，请在演示程序中手动连接。' }
  $connectDeadline = [DateTime]::UtcNow.AddMilliseconds(${timeout})
  do {
    Start-Sleep -Milliseconds 300
    $connected = FindNamed ${psString(connectedText)}
  } while (-not $connected -and [DateTime]::UtcNow -lt $connectDeadline)
  if (-not $connected) { Result $false '隧道连接未确认成功，请在演示程序中检查连接状态。' }
}

ClickTab ${Number(platformTabOffset.x) || 290} ${Number(platformTabOffset.y) || 95}
$button = $null
$buttonDeadline = [DateTime]::UtcNow.AddMilliseconds(${timeout})
while (-not $button -and [DateTime]::UtcNow -lt $buttonDeadline) {
  $button = FindNamed ${psString(platformButtonText)}
  if (-not $button) { Start-Sleep -Milliseconds 250 }
}
if (-not $button) { Result $false '未找到一体化平台3.2展示按钮，请检查演示程序版本。' }
if (-not (ClickElement $button)) { Result $false '无法点击一体化平台3.2展示按钮，请在演示程序中手动操作。' }

[ArchiveDemoNative]::SetWindowPos($handle, [ArchiveDemoNative]::NotTopMost, 0, 0, 0, 0, [ArchiveDemoNative]::NoMove -bor [ArchiveDemoNative]::NoSize) | Out-Null
Result $true '${SUCCESS_MESSAGE}'
`;
}

function runWindowsAutomation(config, options = {}) {
  if (process.platform !== 'win32') {
    return Promise.resolve(failure('花都隧道演示程序自动化仅支持 Windows。'));
  }
  const spawnProcess = options.spawnProcess || spawn;
  const script = createAutomationScript(config);
  return new Promise(resolve => {
    let child;
    try {
      child = spawnProcess('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve(failure('无法启动 Windows 界面自动化，请在演示程序中手动操作。'));
      return;
    }
    let output = '';
    let errorOutput = '';
    child.stdout?.on('data', chunk => { output += String(chunk); });
    child.stderr?.on('data', chunk => { errorOutput += String(chunk); });
    child.once('error', () => resolve(failure('无法启动 Windows 界面自动化，请在演示程序中手动操作。')));
    child.once('close', async code => {
      const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1) || '';
      if (line.startsWith('OK|')) return resolve({ success: true, message: line.slice(3) });
      if (line.startsWith('ERROR|')) {
        const fallback = await ensureTunnelService(config, options);
        return resolve(fallback.success ? fallback : failure(line.slice(6)));
      }
      const fallback = await ensureTunnelService(config, options);
      if (fallback.success) return resolve(fallback);
      resolve(failure(code === 0
        ? '演示程序自动化未返回完成状态，请在演示程序中手动操作。'
        : '演示程序自动化失败，请在演示程序中手动完成隧道连接和平台选择。'));
    });
  });
}

function ensureTunnelService(config, options = {}) {
  const serviceName = config?.tunnelServiceName;
  if (!serviceName || process.platform !== 'win32') return Promise.resolve(failure(''));
  const spawnProcess = options.spawnProcess || spawn;
  const script = `$ErrorActionPreference = 'Stop'; $service = Get-Service -Name ${psString(serviceName)} -ErrorAction Stop; if ($service.Status -ne 'Running') { Start-Service -Name ${psString(serviceName)} -ErrorAction Stop; $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(10)) }; if ($service.Status -eq 'Running') { Write-Output 'OK' } else { Write-Output 'ERROR' }`;
  return new Promise(resolve => {
    let child;
    try {
      child = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch {
      resolve(failure(''));
      return;
    }
    let output = '';
    child.stdout?.on('data', chunk => { output += String(chunk); });
    child.once('error', () => resolve(failure('')));
    child.once('close', code => {
      resolve(code === 0 && output.trim().split(/\r?\n/).at(-1) === 'OK'
        ? { success: true, message: FALLBACK_SUCCESS_MESSAGE, fallback: true }
        : failure(''));
    });
  });
}

function launchDemoProgram(config, options = {}) {
  const executable = config?.executable;
  if (typeof executable !== 'string' || !executable.trim()) {
    return Promise.resolve(failure('演示程序路径未配置，请检查 externalDemo.executable。'));
  }
  const fileSystem = options.fileSystem || fs;
  try {
    if (!fileSystem.statSync(executable).isFile()) {
      return Promise.resolve(failure('演示程序文件不存在，请检查 externalDemo.executable。'));
    }
  } catch {
    return Promise.resolve(failure('演示程序文件不存在，请检查 externalDemo.executable。'));
  }
  const cwd = config.cwd || executable.replace(/[\\/][^\\/]*$/, '');
  try {
    if (!fileSystem.statSync(cwd).isDirectory()) {
      return Promise.resolve(failure('演示程序工作目录不存在，请检查 externalDemo.cwd。'));
    }
  } catch {
    return Promise.resolve(failure('演示程序工作目录不存在，请检查 externalDemo.cwd。'));
  }
  const spawnProcess = options.spawnProcess || spawn;
  const args = Array.isArray(config.args) ? config.args : [];
  let child;
  try {
    child = spawnProcess(executable, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
  } catch {
    return Promise.resolve(failure('无法启动演示程序，请确认文件可执行且未被系统拦截。'));
  }
  if (typeof child?.unref === 'function') child.unref();
  const startTimeoutMs = Number.isInteger(options.startTimeoutMs)
    ? Math.max(1000, Math.min(options.startTimeoutMs, 60000)) : DEFAULT_START_TIMEOUT_MS;
  const runUiAutomation = options.runUiAutomation || runWindowsAutomation;
  const checkTunnelService = options.ensureTunnelService || ensureTunnelService;
  if (typeof child?.once !== 'function') return runUiAutomation(config);
  return new Promise(resolve => {
    let settled = false;
    let automationStarted = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const automate = async () => {
      if (settled || automationStarted) return;
      automationStarted = true;
      try {
        finish(await runUiAutomation(config));
      } catch {
        finish(failure('演示程序自动化失败，请在演示程序中手动完成后续操作。'));
      }
    };
    const timer = setTimeout(async () => {
      if (settled || automationStarted) return;
      automationStarted = true;
      try {
        const tunnel = await checkTunnelService(config, options);
        if (tunnel.success) return finish(tunnel);
        finish(await runUiAutomation(config));
      } catch {
        finish(failure('演示程序启动超时，请检查本机权限。'));
      }
    }, startTimeoutMs);
    child.once('error', () => finish(failure('无法启动演示程序，请确认文件可执行且未被系统拦截。')));
    child.once('spawn', automate);
  });
}

module.exports = { createAutomationScript, ensureTunnelService, launchDemoProgram, runWindowsAutomation, SUCCESS_MESSAGE };
