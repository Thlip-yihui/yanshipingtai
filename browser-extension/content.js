'use strict';

(async () => {
  const system = ArchiveDemoSystems.find(item => new URL(item.url).origin === location.origin);
  if (!system) return;

  try {
    const credentials = await chrome.runtime.sendMessage({ type: 'get-login-data', systemId: system.id });
    if (!credentials) return;
    await ArchiveDemoLogin.run({ system, credentials, document, window });
  } catch {
    ArchiveDemoLogin.showStatus(document, '扩展无法读取本机配置，请重新打开页面。', 'error');
  }
})();
