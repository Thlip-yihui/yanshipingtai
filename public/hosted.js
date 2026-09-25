'use strict';

const systems = [
  { id: 'court-file-cabinet', name: '智能文件柜-法院', description: '文件借还与智能柜管理', url: 'http://47.115.224.12:8080/#/home/borrowReturn' },
  { id: 'paperless-go', name: 'AI辅助数字化扫描加工', description: 'AI辅助扫描加工与数字化归档', url: 'http://47.113.229.248:4000/' },
  { id: 'digital-archive', name: '档案数字化管理系统', description: '数字化加工与档案管理', url: 'http://47.120.38.133:9528/' },
  { id: 'dense-shelf-platform', name: '密集架一体化平台管理系统', description: '需连接单位网络或演示隧道', url: 'http://192.168.3.251/#/home' },
  { id: 'integrated-archive', name: '综合档案管理系统', description: '档案全生命周期管理', url: 'http://a.wenzhi.icu:8205/#/zhlogin' },
  { id: 'cadre-personnel-archive', name: '干部人事档案管理系统', description: '干部人事档案集中管理', url: 'http://a.wenzhi.icu:58817/' },
  { id: 'standalone-archive', name: '综合单机版档案系统', description: '档案整理与查阅', url: 'http://a.wenzhi.icu:58801/' },
  { id: 'aisou-file-agent', name: '艾搜文件智能体', description: 'Windows 客户端需在本机另行安装', url: '' }
];

const grid = document.querySelector('#system-grid');
const state = document.querySelector('#desktop-state');
const note = document.querySelector('#desktop-note');
const heroLink = document.querySelector('#desktop-launch');

function card(system, desktopUrl = '') {
  const article = document.createElement('article');
  article.className = 'hosted-card';
  article.dataset.systemId = system.id;
  const heading = document.createElement('h3');
  heading.textContent = system.name;
  const kind = document.createElement('p');
  kind.className = 'hosted-kind';
  kind.textContent = system.description;
  const link = document.createElement('a');
  link.className = 'open-button';
  const useDesktop = Boolean(desktopUrl && (!system.url || system.id === 'dense-shelf-platform'));
  link.textContent = useDesktop ? '进入演示桌面' : system.url ? '系统演示' : '待配置';
  const targetUrl = useDesktop ? desktopUrl : system.url;
  if (targetUrl) {
    link.href = targetUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${link.textContent}：${system.name}`);
  } else {
    link.href = '#systems';
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('aria-label', `待配置：${system.name}`);
  }
  article.append(heading, kind, link);
  return article;
}

function renderDirectLinks() {
  grid.replaceChildren(...systems.map(system => card(system)));
  grid.setAttribute('aria-busy', 'false');
  state.textContent = '7 个网页系统入口';
  state.dataset.state = 'ready';
  note.textContent = '每个浏览器首次在扩展设置中保存所需系统密码一次；以后点击系统演示，扩展会自动填写。密集架需连接单位网络或获准的 VPN/隧道；艾搜是 Windows 客户端，需在本机另行安装。目标系统使用 HTTP，密码传输未加密。';
}

async function loadConfig() {
  renderDirectLinks();
  try {
    const response = await fetch('./demo-config.json', { cache: 'no-store' });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.desktopUrl !== 'string' || !config.desktopUrl) return;
    let desktopUrl;
    try { desktopUrl = new URL(config.desktopUrl); } catch { return; }
    if (desktopUrl.protocol !== 'https:' || desktopUrl.username || desktopUrl.password) return;
    grid.replaceChildren(...systems.map(system => card(system, desktopUrl.href)));
    state.textContent = '公网入口及演示桌面可用';
    note.textContent = '六个公网网页系统直接打开，由本机扩展自动填写；密集架和艾搜使用授权 Windows 演示桌面。';
    heroLink.href = desktopUrl.href;
    heroLink.target = '_blank';
    heroLink.rel = 'noopener noreferrer';
    heroLink.hidden = false;
  } catch {
    // Direct system links remain available if the optional desktop config cannot be read.
  }
}

loadConfig();
