// 无凭据模板：复制为 systems.js 后填写账号和密码。
module.exports = [
  {
    "id": "court-file-cabinet",
    "name": "智能文件柜-法院",
    "url": "http://47.115.224.12:8080/#/home/borrowReturn",
    "username": "",
    "password": "",
    "enabled": true,
    "loginSelectors": {}
  },
  {
    "id": "paperless-go",
    "name": "AI辅助数字化扫描加工",
    "url": "http://47.113.229.248:4000",
    "username": "",
    "password": "",
    "enabled": true,
    "loginSelectors": {}
  },
  {
    "id": "digital-archive",
    "name": "档案数字化管理系统",
    "url": "http://47.120.38.133:9528",
    "username": "",
    "password": "",
    "enabled": true,
    "loginSelectors": {}
  },
  {
    "id": "dense-shelf-platform",
    "name": "密集架一体化平台管理系统",
    "url": "http://192.168.3.251/#/home",
    "username": "",
    "password": "",
    "enabled": true,
    "loginSelectors": {
      "username": "input[placeholder=\"请输入用户账号\"]",
      "password": "input[placeholder=\"请输入密码\"]",
      "submit": "div.btn-box img"
    },
    "loginTimeoutMs": 30000,
    // Windows 本机演示程序：连接隧道、切换平台展示并点击一体化平台3.2。
    // 请将 executable 和 cwd 改成本机附件实际路径。
    // "externalDemo": {
    //   "executable": "E:\\path\\演示程序.exe",
    //   "cwd": "E:\\path",
    //   "windowTitle": "HUA DU Platform",
    //   "windowClass": "HUA DU UI - Manage Tunnels",
    //   "tunnelServiceName": "WireGuardTunnel$line-1",
    //   "connectButtonText": "连接 (A)",
    //   "connectedText": "已连接",
    //   "platformButtonText": "一体化平台3.2",
    //   "tunnelTabOffset": { "x": 60, "y": 95 },
    //   "platformTabOffset": { "x": 290, "y": 95 },
    //   "uiTimeoutMs": 30000
    // }
  },
  {
    "id": "integrated-archive",
    "name": "综合档案管理系统",
    "url": "http://a.wenzhi.icu:8205/#/zhlogin",
    "username": "",
    "password": "",
    "enabled": true,
    "loginTimeoutMs": 30000,
    "loginSelectors": {}
  },
  {
    "id": "cadre-personnel-archive",
    "name": "干部人事档案管理系统",
    "url": "http://a.wenzhi.icu:58817/",
    "username": "",
    "password": "",
    "enabled": true,
    "loginSelectors": {},
    "unavailableMessage": "该系统暂未配置网址、账号和密码，按钮已预留。"
  },
  {
    "id": "standalone-archive",
    "name": "综合单机版档案系统",
    "url": "http://a.wenzhi.icu:58801",
    "username": "",
    "password": "",
    "enabled": true,
    "loginTimeoutMs": 30000,
    "loginSelectors": {
      "username": "#txtaccount",
      "password": "#txtpassword",
      "submit": "#btlogin",
      "successUrl": "/System/views/mainpage/index.jsp"
    }
  },
  {
    "id": "aisou-file-agent",
    "name": "艾搜文件智能体",
    "url": "",
    "username": "",
    "password": "",
    "enabled": false,
    "loginSelectors": {},
    // 如需从导航台打开本机安装包，将 enabled 改为 true 并取消下面配置的注释：
    // "externalInstaller": {
    //   "packagePath": "D:\\path\\aisouagentInstaller.exe"
    // },
    "unavailableMessage": "该系统暂未配置，按钮已预留。"
  }
];
