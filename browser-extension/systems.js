'use strict';

const systems = Object.freeze([
  {
    id: 'court-file-cabinet',
    name: '智能文件柜-法院',
    url: 'http://47.115.224.12:8080/#/home/borrowReturn',
    username: 'admin',
    selectors: {}
  },
  {
    id: 'paperless-go',
    name: 'AI辅助数字化扫描加工',
    url: 'http://47.113.229.248:4000',
    username: 'admin',
    selectors: {}
  },
  {
    id: 'digital-archive',
    name: '档案数字化管理系统',
    url: 'http://47.120.38.133:9528',
    username: 'admin',
    selectors: {}
  },
  {
    id: 'dense-shelf-platform',
    name: '密集架一体化平台管理系统',
    url: 'http://192.168.3.251/#/home',
    username: 'admin',
    selectors: {
      username: 'input[placeholder="请输入用户账号"]',
      password: 'input[placeholder="请输入密码"]',
      submit: 'div.btn-box img'
    }
  },
  {
    id: 'integrated-archive',
    name: '综合档案管理系统',
    url: 'http://a.wenzhi.icu:8205/#/zhlogin',
    username: 'test01',
    selectors: {}
  },
  {
    id: 'cadre-personnel-archive',
    name: '干部人事档案管理系统',
    url: 'http://a.wenzhi.icu:58817/',
    username: 'admin',
    selectors: {
      username: '#loginname',
      password: '#password',
      submit: '#to-recover'
    }
  },
  {
    id: 'standalone-archive',
    name: '综合单机版档案系统',
    url: 'http://a.wenzhi.icu:58801',
    username: 'admin',
    selectors: {
      username: '#txtaccount',
      password: '#txtpassword',
      submit: '#btlogin',
      successUrl: '/System/views/mainpage/index.jsp'
    }
  }
]);

globalThis.ArchiveDemoSystems = systems;
if (typeof module !== 'undefined' && module.exports) module.exports = systems;
