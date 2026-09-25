'use strict';

if (location.origin === 'https://thlip-yihui.github.io' && location.pathname.startsWith('/yanshipingtai/')) {
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.sendMessage);

  async function request(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      return null;
    }
  }

  function showCredentialStatus(status) {
    if (!status || !Array.isArray(status.configuredSystemIds)) return;
    const configured = new Set(status.configuredSystemIds);
    for (const system of ArchiveDemoSystems) {
      const card = document.querySelector(`.system-card[data-system-id="${system.id}"]`);
      const badge = card?.querySelector('.card-badge');
      if (!badge) continue;
      const isConfigured = configured.has(system.id);
      badge.textContent = isConfigured ? '密码已保存' : '需设置密码';
      badge.dataset.credentialState = isConfigured ? 'saved' : 'missing';
    }
    const serviceLabel = document.querySelector('#service-label');
    if (serviceLabel) {
      serviceLabel.textContent = `自动登录扩展已连接 · ${configured.size}/${status.total} 项已设置`;
    }
  }

  async function refreshCredentialStatus() {
    const status = await request({ type: 'get-credential-status' });
    if (!status) return;
    showCredentialStatus(status);
    const grid = document.querySelector('#system-grid');
    if (!grid) return;
    const observer = new MutationObserver(() => showCredentialStatus(status));
    observer.observe(grid, { childList: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  if (extensionAvailable) {
    refreshCredentialStatus();
    document.addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target : null;
      const setupLink = target?.closest('#extension-settings-link');
      if (setupLink) {
        event.preventDefault();
        const result = await request({ type: 'open-options' });
        if (!result?.success) location.href = setupLink.href;
        return;
      }

      const card = target?.closest('[data-system-id="dense-shelf-platform"]');
      if (!card) return;
      const action = target.closest('button, a.open-button');
      if (!action) return;
      if (action.tagName === 'A') {
        try {
          if (new URL(action.href).href !== new URL(ArchiveDemoSystems.find(item => item.id === 'dense-shelf-platform').url).href) return;
        } catch {
          return;
        }
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      const system = ArchiveDemoSystems.find(item => item.id === 'dense-shelf-platform');
      if (system) window.open(system.url, '_blank', 'noopener,noreferrer');
    }, true);
  }
}
