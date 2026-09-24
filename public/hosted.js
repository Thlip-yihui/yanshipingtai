'use strict';

const systems = [
  { id: 'court-file-cabinet', name: '智能文件柜-法院', url: 'http://47.115.224.12:8080/#/home/borrowReturn', username: 'admin', enabled: true, description: '文件借还与智能柜管理' },
  { id: 'paperless-go', name: 'AI辅助数字化扫描加工', url: 'http://47.113.229.248:4000', username: 'admin', enabled: true, description: 'AI辅助扫描加工与数字化归档' },
  { id: 'digital-archive', name: '档案数字化管理系统', url: 'http://47.120.38.133:9528', username: 'admin', enabled: true, description: '数字化加工与档案管理' },
  { id: 'dense-shelf-platform', name: '密集架一体化平台管理系统', url: 'http://192.168.3.251/#/home', username: 'admin', enabled: true, description: '连接花都演示隧道，进入一体化平台3.2' },
  { id: 'integrated-archive', name: '综合档案管理系统', url: 'http://a.wenzhi.icu:8205/#/zhlogin', username: 'test01', enabled: true, description: '档案全生命周期管理' },
  { id: 'cadre-personnel-archive', name: '干部人事档案管理系统', url: 'http://a.wenzhi.icu:58817/', username: 'admin', enabled: true, description: '干部人事档案集中管理' },
  { id: 'standalone-archive', name: '综合单机版档案系统', url: 'http://a.wenzhi.icu:58801', username: 'admin', enabled: true, description: '本地档案整理与查阅' },
  { id: 'aisou-file-agent', name: '艾搜文件智能体', url: '', username: '', enabled: true, description: '客户端需在 Windows 演示桌面预先安装' }
];

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
  'dense-shelf-platform': ['shelves', 'sand'],
  'integrated-archive': ['archive', 'purple'],
  'cadre-personnel-archive': ['person', 'blue'],
  'standalone-archive': ['desktop', 'green'],
  'aisou-file-agent': ['agent', 'purple'],
};
const localPackageSystems = new Set(['aisou-file-agent']);
const grid = document.querySelector('#system-grid');
const empty = document.querySelector('#empty-state');
const emptyTitle = document.querySelector('#empty-title');
const emptyMessage = document.querySelector('#empty-message');
const service = document.querySelector('#service-state');
const serviceLabel = document.querySelector('#service-label');
const note = document.querySelector('#hosted-note');
const notice = document.querySelector('#notice-dialog');
const noticeMessage = document.querySelector('#dialog-message');
const state = { filter: 'all', search: '', desktopUrl: '', configError: '' };

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

function explainUnavailable(system) {
  if (!system.enabled) {
    noticeMessage.textContent = system.id === 'cadre-personnel-archive'
      ? '该系统暂未配置网址、账号和密码，按钮已预留。'
      : '该系统暂未配置，按钮已预留。';
  } else if (state.configError) {
    noticeMessage.textContent = state.configError;
  } else {
    noticeMessage.textContent = '公网演示主机尚未接入。GitHub Pages 只能托管导航页面，无法启动原项目中的 Express、Playwright 或 Windows 程序。请管理员部署经过身份验证的 HTTPS 远程桌面，并在 GitHub 仓库变量 DEMO_DESKTOP_URL 中配置入口。';
  }
  notice.showModal();
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
  const index = systems.findIndex(item => item.id === system.id) + 1;
  meta.append(node('span', 'card-number', String(index).padStart(2, '0')));
  meta.append(node('span', 'card-badge', system.enabled ? '已配置' : '入口预留'));
  top.append(mark, meta);
  const name = node('h3', '', system.name);
  const description = node('p', 'card-description', system.description);
  const isLocalPackage = localPackageSystems.has(system.id);
  const details = node('dl', 'card-details');
  details.append(
    detail('入口', isLocalPackage ? 'Windows 演示桌面' : (system.url || '暂未配置'), 'link'),
    detail('账号', isLocalPackage ? '安装后运行' : (system.username || '暂未配置'), 'user')
  );
  const action = node('div', 'card-action');
  const button = node(state.desktopUrl && system.enabled ? 'a' : 'button', 'open-button');
  if (button.tagName === 'A') {
    button.href = state.desktopUrl;
    button.target = '_blank';
    button.rel = 'noopener noreferrer';
  } else {
    button.type = 'button';
    button.addEventListener('click', () => explainUnavailable(system));
  }
  button.textContent = system.enabled ? '系统演示' : '待配置';
  button.setAttribute('aria-label', `${system.enabled ? '系统演示' : '待配置'}：${system.name}`);
  const status = node('p', 'card-status');
  status.setAttribute('role', 'status');
  action.append(button, status);
  card.append(top, name, description, details, action);
  return card;
}

function render() {
  const query = state.search.trim().toLocaleLowerCase();
  const visibleSystems = systems.filter(system => {
    const matchesFilter = state.filter === 'all' || (state.filter === 'enabled' ? system.enabled : !system.enabled);
    const matchesQuery = [system.name, system.url, system.username].some(value => String(value || '').toLocaleLowerCase().includes(query));
    return matchesFilter && matchesQuery;
  });
  grid.replaceChildren(...visibleSystems.map(renderCard));
  grid.setAttribute('aria-busy', 'false');
  empty.hidden = visibleSystems.length > 0;
  if (!visibleSystems.length) {
    emptyTitle.textContent = systems.length ? '没有匹配的系统' : '暂未添加系统';
    emptyMessage.textContent = systems.length ? '试试其他关键词，或切换到「全部系统」。' : '请先配置系统入口。';
  }
}

function setDesktopState(config) {
  if (typeof config.desktopUrl !== 'string' || !config.desktopUrl) {
    state.desktopUrl = '';
    service.classList.add('is-error');
    serviceLabel.textContent = '演示主机尚未接入';
    note.dataset.state = 'error';
    note.textContent = '当前网址托管的是静态导航页面。接入受保护的 Windows 演示桌面后，才能启动 Playwright 自动登录、密集架程序和艾搜客户端。';
    return;
  }
  let target;
  try { target = new URL(config.desktopUrl); } catch { throw new Error('远程桌面地址无效，请联系演示管理员。'); }
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new Error('远程桌面地址无效：必须使用不包含账号密码的 HTTPS 地址。');
  }
  state.desktopUrl = target.href;
  service.classList.add('is-ready');
  serviceLabel.textContent = '受控演示桌面已接入';
  note.dataset.state = 'ready';
  note.textContent = '各系统入口共用授权 Windows 演示桌面。进入桌面后，在其中的导航台选择相同系统；共享桌面请轮流操作。';
}

async function loadConfig() {
  try {
    const response = await fetch('./demo-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('演示入口配置读取失败，请联系演示管理员。');
    setDesktopState(await response.json());
  } catch (error) {
    state.configError = error.message || '远程演示配置读取失败，请联系演示管理员。';
    service.classList.add('is-error');
    serviceLabel.textContent = '演示配置读取失败';
    note.dataset.state = 'error';
    note.textContent = state.configError;
  }
  render();
}

document.querySelectorAll('[data-filter]').forEach(button => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(filter => {
      const active = filter === button;
      filter.classList.toggle('is-active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    render();
  });
});
document.querySelector('#search-input').addEventListener('input', event => {
  state.search = event.target.value;
  render();
});
document.querySelector('#help-button').addEventListener('click', () => document.querySelector('#help-dialog').showModal());
loadConfig();
