'use strict';

const state = { systems: [], filter: 'all', search: '', operations: new Map(), loaded: false };
const hostedMode = Array.isArray(globalThis.ArchiveDemoHostedSystems);
const elements = {
  grid: document.querySelector('#system-grid'),
  empty: document.querySelector('#empty-state'),
  emptyTitle: document.querySelector('#empty-title'),
  emptyMessage: document.querySelector('#empty-message'),
  retry: document.querySelector('#retry-button'),
  service: document.querySelector('#service-state'),
  serviceLabel: document.querySelector('#service-label'),
  dialog: document.querySelector('#notice-dialog'),
  dialogTitle: document.querySelector('#dialog-title'),
  dialogMessage: document.querySelector('#dialog-message'),
};

// All SVG markup is static; values supplied by the API are inserted as text.
const icons = {
  cabinet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 9h14M5 15h14M10 6h4M10 12h4M10 18h4"/>',
  document: '<path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9zM13 3v6h6M8 13h8M8 17h5"/>',
  digital: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 8h4v5H7zM14 8h3M14 12h3"/>',
  archive: '<path d="M3 7h18v4H3zM5 11v10h14V11M8 3h8v4M9 15h6"/>',
  person: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5.5 17c0-4 7-4 7 0M15 9h3M15 13h3"/>',
  desktop: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M6 13h12M8 7h8M8 10h5"/>',
  shelves: '<path d="M3 3v18M21 3v18M3 10h18M3 19h18M7 5v5M11 5v5M15 5v5M18 5v5M7 13v6M11 13v6M15 13v6M18 13v6"/>',
  agent: '<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M9 15h6M2 12v4M22 12v4"/><circle cx="8.5" cy="11.5" r=".5"/><circle cx="15.5" cy="11.5" r=".5"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M13 7l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  user: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
};
const appearances = {
  'court-file-cabinet': ['cabinet', 'green'],
  'paperless-go': ['document', 'blue'],
  'digital-archive': ['digital', 'sand'],
  'integrated-archive': ['archive', 'purple'],
  'cadre-personnel-archive': ['person', 'blue'],
  'standalone-archive': ['desktop', 'green'],
  'dense-shelf-platform': ['shelves', 'sand'],
  'aisou-file-agent': ['agent', 'purple'],
};
const descriptions = {
  'court-file-cabinet': '文件借还与智能柜管理',
  'paperless-go': 'AI辅助扫描加工与数字化归档',
  'digital-archive': '数字化加工与档案管理',
  'integrated-archive': '档案全生命周期管理',
  'cadre-personnel-archive': '干部人事档案集中管理',
  'standalone-archive': '本地档案整理与查阅',
  'dense-shelf-platform': '连接花都演示隧道，自动进入一体化平台3.2',
  'aisou-file-agent': '艾搜客户端安装包，安装后运行即可使用',
};

const localPackageSystems = new Set(['aisou-file-agent']);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = icons[name] || icons.archive;
  return svg;
}

function detail(label, value, iconName) {
  const row = node('div', 'detail-row');
  const term = node('dt');
  term.append(icon(iconName), document.createTextNode(label));
  const definition = node('dd', '', value);
  definition.title = value;
  row.append(term, definition);
  return row;
}

function updateCardOperation(card, system) {
  const operation = state.operations.get(system.id);
  const button = card.querySelector('.open-button');
  const status = card.querySelector('.card-status');
  button.replaceChildren();
  button.disabled = operation?.tone === 'loading';
  button.setAttribute('aria-busy', String(button.disabled));
  if (button.disabled) {
    const spinner = node('span', 'spinner');
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner, document.createTextNode('正在打开'));
  } else {
    button.append(document.createTextNode(system.enabled ? '系统演示' : '待配置'));
  }
  status.textContent = operation?.message || '';
  status.dataset.tone = operation?.tone || 'idle';
}

function renderCard(system) {
  const [iconName, color] = appearances[system.id] || ['archive', 'green'];
  const card = node('article', `system-card${system.enabled ? '' : ' is-reserved'}`);
  card.dataset.systemId = system.id;
  card.dataset.color = color;
  const top = node('div', 'card-top');
  const mark = node('span', 'system-icon');
  mark.append(icon(iconName));
  const meta = node('div', 'card-top-meta');
  const number = String(state.systems.findIndex(item => item.id === system.id) + 1).padStart(2, '0');
  meta.append(node('span', 'card-number', number), node('span', 'card-badge', system.enabled ? '已配置' : '入口预留'));
  top.append(mark, meta);
  const name = node('h3', '', system.name);
  const description = node('p', 'card-description', descriptions[system.id] || '统一入口，便捷访问。');
  const details = node('dl', 'card-details');
  const isLocalPackage = localPackageSystems.has(system.id);
  details.append(detail('入口', isLocalPackage ? '本机安装包' : (system.url || '暂未配置'), 'link'), detail('状态', isLocalPackage ? '安装后运行' : (system.username || '暂未配置'), 'user'));
  const action = node('div', 'card-action');
  const button = node('button', 'open-button');
  button.type = 'button';
  button.setAttribute('aria-label', `${system.enabled ? '系统演示' : '待配置'}：${system.name}`);
  button.addEventListener('click', () => openSystem(system));
  const status = node('p', 'card-status');
  status.setAttribute('role', 'status');
  action.append(button, status);
  card.append(top, name, description, details, action);
  updateCardOperation(card, system);
  return card;
}

function render() {
  const query = state.search.trim().toLocaleLowerCase();
  const systems = state.systems.filter(system => {
    const matchesFilter = state.filter === 'all' || (state.filter === 'enabled' ? system.enabled : !system.enabled);
    const matchesQuery = [system.name, system.url, system.username].some(value => String(value || '').toLocaleLowerCase().includes(query));
    return matchesFilter && matchesQuery;
  });
  elements.grid.replaceChildren(...systems.map(renderCard));
  elements.grid.setAttribute('aria-busy', 'false');
  elements.empty.hidden = systems.length > 0;
  elements.retry.hidden = true;
  if (!systems.length) {
    elements.emptyTitle.textContent = state.systems.length ? '没有匹配的系统' : '暂未添加系统';
    elements.emptyMessage.textContent = state.systems.length ? '试试其他关键词，或切换到「全部系统」。' : '添加系统配置并重启服务后，即可在这里看到系统入口。';
  }
}

function refreshOperation(id) {
  const card = [...elements.grid.children].find(element => element.dataset.systemId === id);
  const system = state.systems.find(item => item.id === id);
  if (card && system) updateCardOperation(card, system);
}

async function openSystem(system) {
  if (hostedMode && system.id === 'aisou-file-agent' && !system.desktopUrl) {
    elements.dialogTitle.textContent = '艾搜客户端需在本机运行';
    elements.dialogMessage.textContent = 'GitHub Pages 无法启动访问者电脑上的 Windows 程序。请先在本机安装艾搜客户端，再从本机导航台打开。';
    elements.dialog.showModal();
    return;
  }
  if (!system.enabled) {
    const message = system.unavailableMessage || (system.id === 'cadre-personnel-archive'
      ? '该系统暂未配置网址、账号和密码，按钮已预留。'
      : '该系统暂未配置，按钮已预留。');
    elements.dialogMessage.textContent = message;
    elements.dialog.showModal();
    return;
  }
  if (state.operations.get(system.id)?.tone === 'loading') return;
  const loadingMessage = localPackageSystems.has(system.id)
    ? '正在打开艾搜客户端安装包，请稍候…'
    : '正在打开系统并尝试自动登录，请稍候…';
  state.operations.set(system.id, { tone: 'loading', message: loadingMessage });
  refreshOperation(system.id);
  if (hostedMode) {
    const target = system.desktopUrl || system.url;
    const popup = target ? window.open(target, '_blank') : null;
    if (popup) {
      popup.opener = null;
      state.operations.set(system.id, { tone: 'success', message: '系统已在新标签页打开；浏览器扩展将尝试自动填写。' });
    } else {
      state.operations.set(system.id, { tone: 'error', message: '浏览器拦截了新窗口，请允许此站点打开弹窗后重试。' });
    }
    refreshOperation(system.id);
    return;
  }
  try {
    const response = await fetch(`/api/open/${encodeURIComponent(system.id)}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'same-origin',
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('本地服务响应异常，请查看后端控制台。'); }
    const success = response.ok && result.success === true;
    const message = typeof result.message === 'string' && result.message ? result.message : (success ? '系统已打开。' : '打开失败，请查看后端控制台。');
    state.operations.set(system.id, { tone: success ? 'success' : 'error', message });
  } catch (error) {
    const message = error instanceof TypeError ? '无法连接本地服务，请确认服务正在运行后重试。' : error.message || '打开失败，请稍后重试。';
    state.operations.set(system.id, { tone: 'error', message });
  } finally {
    refreshOperation(system.id);
  }
}

async function loadSystems() {
  elements.empty.hidden = false;
  elements.emptyTitle.textContent = '正在载入系统';
  elements.emptyMessage.textContent = '请稍候，本地服务正在读取配置。';
  elements.retry.hidden = true;
  elements.grid.setAttribute('aria-busy', 'true');
  elements.service.className = 'service-state';
  if (hostedMode) {
    let desktopUrl = '';
    try {
      const response = await fetch('./demo-config.json', { cache: 'no-store' });
      if (response.ok) {
        const config = await response.json();
        const target = new URL(config.desktopUrl);
        if (target.protocol === 'https:' && !target.username && !target.password) desktopUrl = target.href;
      }
    } catch {
      // Public system links remain usable if the optional desktop config is unavailable.
    }
    state.systems = globalThis.ArchiveDemoHostedSystems.map(system => ({
      ...system,
      ...(desktopUrl && ['dense-shelf-platform', 'aisou-file-agent'].includes(system.id) ? { desktopUrl } : {})
    }));
    state.loaded = true;
    elements.service.classList.add('is-ready');
    elements.serviceLabel.textContent = '公网系统入口已加载';
    render();
    return;
  }
  elements.serviceLabel.textContent = '正在连接本地服务';
  try {
    const response = await fetch('/api/systems', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取系统配置，请查看后端控制台。');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('系统配置格式异常，请查看后端控制台。');
    state.systems = data;
    state.loaded = true;
    elements.service.classList.add('is-ready');
    elements.serviceLabel.textContent = '本地服务已连接';
    render();
  } catch (error) {
    state.loaded = false;
    elements.grid.setAttribute('aria-busy', 'false');
    elements.service.classList.add('is-error');
    elements.serviceLabel.textContent = '本地服务未连接';
    elements.emptyTitle.textContent = '系统列表加载失败';
    elements.emptyMessage.textContent = error instanceof TypeError ? '无法连接本地服务，请确认已运行 npm start。' : error.message;
    elements.retry.hidden = false;
  }
}

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter => {
      const active = filter === button;
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    if (state.loaded) render();
  });
});
document.querySelector('#search-input').addEventListener('input', event => {
  state.search = event.target.value;
  if (state.loaded) render();
});
elements.retry.addEventListener('click', loadSystems);
document.querySelector('#help-button')?.addEventListener('click', () => {
  if (hostedMode) {
    const dialog = document.querySelector('#help-dialog');
    dialog.querySelector('.dialog-kicker').textContent = 'CHROME / EDGE';
    dialog.querySelector('#help-title').textContent = '首次设置登录信息';
    const steps = [
      ['安装扩展', '下载并加载自动登录扩展。每位用户在自己的浏览器中安装一次。'],
      ['保存密码', '在扩展设置页填写需要演示的系统密码并保存。密码保存在当前浏览器。'],
      ['打开系统', '回到这里点击「系统演示」，扩展会尝试自动填写并提交登录。'],
    ];
    dialog.querySelectorAll('.help-steps li').forEach((item, index) => {
      item.querySelector('strong').textContent = steps[index][0];
      item.querySelector('p').textContent = steps[index][1];
    });
    const closeButton = dialog.querySelector('button[type="submit"]');
    if (closeButton) {
      const guideLink = node('a', 'open-button', '查看安装说明');
      guideLink.href = './extension-guide.html';
      closeButton.replaceWith(guideLink);
    }
  }
  document.querySelector('#help-dialog')?.showModal();
});
loadSystems();
