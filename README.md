# 档案系统演示导航台

基于 Node.js、Express、Playwright 和原生 HTML/CSS/JS 的本地演示工具。导航页展示 8 个系统入口，点击普通已配置入口后，由后端启动有界面的 Chromium 浏览器，打开目标系统并尝试填写账号、密码和提交登录；配置 `externalDemo` 的入口会先启动 Windows 演示程序并自动完成隧道与平台选择，配置 `externalInstaller` 的入口则打开本机安装包。

**仅演示环境使用。** 账号密码保存在本机配置文件中，请勿将包含真实凭据的项目公开发布。

**GitHub 与外网访问：** 仓库包含 GitHub Pages 自动发布工作流，推送至 `main` 后可发布公开导航网址。Pages 本身不运行 Node.js、Playwright 或 Windows 演示程序；所有系统按钮须连接到已部署且经过身份验证的远程 Windows 桌面。请按 [GitHub Pages 与外网部署说明](docs/DEPLOYMENT.md) 设置 `DEMO_DESKTOP_URL`。页面可公开访问，系统演示仍依赖网关和 Windows 主机已配置并运行。Pages 展示数据位于 `public/hosted.js`，只包含公开系统信息与账号名，不包含密码；新增系统时需同时更新本机配置与该静态展示清单。

界面采用白底网格、大字号标题、荧光绿点缀和档案主题漂浮图形。点击「探索系统入口」可跳转到卡片区，支持按配置状态筛选、搜索系统，以及查看使用说明。桌面使用多列卡片，手机使用单列阅读布局；全部图形由原生 CSS/SVG 绘制，无需加载外部图片或字体。

## 安装与启动

需要 Node.js 20 或更新版本，推荐 Node.js 24 LTS（GitHub CI 使用此版本）。首次安装需要联网下载 npm 依赖和 Playwright Chromium 浏览器。

在项目目录打开终端：

```sh
npm ci
npx playwright install chromium
npm start
```

`package.json` 已声明 `express`、`playwright` 依赖；也可按需使用 `npm install express playwright` 安装。

启动后访问：<http://127.0.0.1:3000>。Express 仅绑定 `127.0.0.1`，请在运行服务的本机使用导航台。

请保留终端和服务进程。浏览器在打开成功、登录失败或等待人工验证时都会保持开启，方便继续演示或手动接管；停止服务进程时，自动化管理的浏览器也会关闭。再次启动服务后可重新打开系统。

如浏览器下载受网络限制，且本机已经安装 Google Chrome，可在 PowerShell 中选择它供 Playwright 使用：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm start
```

已安装 Microsoft Edge 时可使用 `msedge`。此选项仍由后端 Playwright 控制独立浏览器会话，不操作个人浏览器配置；不设置该变量时默认使用 Playwright Chromium。恢复默认可运行 `Remove-Item Env:PLAYWRIGHT_CHANNEL`。服务端口也可通过 `PORT` 环境变量设置，绑定地址始终为 `127.0.0.1`。

## 项目文件

```text
archive-demo-nav/
├─ package.json
├─ server.js
├─ .gitignore
├─ config/
│  ├─ systems.js           # 本机真实配置，已忽略提交
│  └─ systems.example.js   # 不含真实密码的配置示例
├─ automation/
│  ├─ openSystem.js
│  ├─ openDemoProgram.js
│  ├─ openExternalBrowser.js
│  └─ openInstaller.js
├─ public/
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
└─ README.md
```

## 系统配置

修改 `config/systems.js` 后重启服务生效。交付目录中的本机配置包含指定的演示系统；通过 Git 获取项目时，该文件不会被提交，需要先复制示例并填写配置。GitHub Pages 的系统卡片不读取本机 API，如需更新公开名称、网址、账号或配置状态，还需编辑 `public/hosted.js`。

Windows PowerShell：

```powershell
Copy-Item config/systems.example.js config/systems.js
```

macOS / Linux：

```sh
cp config/systems.example.js config/systems.js
```

如已存在真实配置，请保留原文件，不要用示例覆盖。示例中的空凭据需要自行补齐。

每个系统包含以下字段：

```js
{
  id: 'my-archive',
  name: '新增档案系统',
  url: 'http://127.0.0.1:8080/login',
  username: 'demo',
  password: '请填写演示密码',
  enabled: true,
  loginSelectors: {
    // 均可省略；留空时使用自动探测。
    username: '',
    password: '',
    submit: '',
    success: '',
    captcha: ''
  }
}
```

- `id`：唯一标识，用于打开接口；不要与其他系统重复。
- `name`、`url`、`username`：导航卡片展示的信息。
- `password`：仅由后端读取，不返回给导航页。
- `enabled`：设为 `false` 时显示“待配置”，点击只显示预留提示，不调用打开接口。
- `externalBrowser`（可选）：指定本机便携浏览器的 `executable` 和工作目录 `cwd`。配置后可不填写 `url`、`username`、`password`，点击入口会由后端启动该浏览器进程。
- `externalDemo`（可选）：指定 Windows 演示程序的 `executable`、`cwd`、窗口标题和界面按钮。点击入口时，后端会启动附件程序，确认隧道已连接，切换到“平台展示”，点击“一体化平台3.2”，然后继续使用 `url`、`username`、`password` 由 Playwright 打开并登录平台。界面坐标 `tunnelTabOffset`、`platformTabOffset` 以演示程序窗口左上角为基准，默认值适用于本次附件版本。
- `externalInstaller`（可选）：指定本机安装包的 `packagePath`，可选传入 `args`。配置后可不填写 `url`、`username`、`password`，点击入口会由后端打开该安装包；安装程序的安装、权限确认和后续运行由用户完成。
- `loginSelectors.username`、`password`、`submit`：账号框、密码框、登录按钮的 Playwright 选择器，例如 `#username`、`input[type="password"]`、`button[type="submit"]`。
- `loginSelectors.success`：登录完成后才出现的元素，例如用户菜单，便于识别登录结果。
- `loginSelectors.successUrl`：登录成功后跳转地址中的固定片段，适用于目标系统在页面资源继续加载时已完成认证的情况。
- `loginSelectors.captcha`：验证码或二次验证的元素，命中后交由用户处理。
- `loginTimeoutMs`（可选）：提交后的结果等待时间，默认 `5000` 毫秒，范围 `1000–60000`。综合档案管理系统和综合单机版系统等待较长，已单独设为 `30000`；其他系统保持默认 5 秒。

**新增系统只需在 `config/systems.js` 的配置列表增加一项，然后重启服务，无需修改页面。** 如果系统页面改版导致自动探测失效，可以填写明确的选择器。

按本次提供的逐项配置，8 个入口中实际为 **8 个已配置、0 个预留**：

- 已配置：智能文件柜-法院、AI辅助数字化扫描加工、档案数字化管理系统、密集架一体化平台管理系统、综合档案管理系统、干部人事档案管理系统、综合单机版档案系统、艾搜文件智能体安装包。
- 当前没有预留入口；后续未配置的系统可将 `enabled` 设为 `false`。

桌面四列布局中，第一行的第四个位置为密集架一体化平台管理系统；第二行前三个位置依次为综合档案管理系统、干部人事档案管理系统、综合单机版档案系统。移动端会按此顺序改为单列显示。

## 自动登录与人工接管

自动填充依赖 **后端 Playwright**，不是纯网页能力。导航页调用本机接口，由 Playwright 控制独立浏览器页面；不使用 iframe 或前端 `window.open` 后访问跨域 DOM。

每个系统使用独立 browser context，隔离 Cookie 和登录状态。浏览器以有头模式运行，需要可用的桌面会话。打开页面会等待加载与网络空闲，加载等待上限为 60 秒；hash 路由页面额外等待渲染。

配置选择器优先，其次自动探测账号框、密码框和登录按钮；填写后触发 `input`、`change` 事件，随后点击登录或尝试回车提交。提交后等待页面变化并检查登录结果。页面没有密码框时，按无需登录或已登录处理并保留窗口；该判断无法证明用户已获得目标系统的全部权限。

综合单机版登录页使用自定义页面元素，账号框、密码框和登录按钮采用固定选择器；登录后以跳转到 `/System/views/mainpage/index.jsp` 作为成功标志。当前配置已实测自动登录成功，并设置了 30 秒结果等待时间。

密集架一体化平台管理系统使用 `externalDemo` 配置调用 `2026.09.22-花都软件演示系统\演示程序.exe`。正常情况下，导航台会启动 “HUA DU Platform” 窗口；如果隧道尚未连接，点击“连接”；切换到“平台展示”；点击“一体化平台3.2”；最后由 Playwright 打开 `http://192.168.3.251/#/home` 并自动登录。如果启动器超时但隧道服务仍在运行，导航台会直接尝试打开平台网址，并按目标网页的实际登录结果返回状态。窗口自动化需要 Windows 交互式桌面权限；若演示程序以管理员权限运行而导航台权限较低，Windows 可能阻止按钮控制，此时请人工连接和选择平台，或以相同权限运行两者。

艾搜文件智能体使用 `externalInstaller` 配置打开附件中的 `aisouagentInstaller-1.1.8-x64(2).exe`。点击入口后请按安装向导完成客户端安装，再运行艾搜客户端；导航台不会替用户确认安装权限或绕过系统安全提示。

检测到验证码、滑块、短信或 OTP 二次验证时，停止自动操作并提示“需要人工处理验证码/二次验证”。本工具不会绕过验证码、风控或登录保护。请在保留的浏览器窗口中完成验证，随后继续演示。

自动登录依赖目标系统的实际页面结构、网络和账号状态。后端终端会输出实际使用的选择器及失败原因，不记录密码；必要时可据此调整配置。请勿在系统未完成自动操作时同时修改其登录表单。

## 本机接口

- `GET /api/systems`：返回供导航页使用的系统列表，采用字段白名单，不包含 `password` 或 `loginSelectors`。
- `POST /api/open/:id`：打开配置中的指定系统并尝试登录，返回 `{ "success": true/false, "message": "中文状态信息" }`。

POST 使用 `Content-Type: application/json`，请求体为 `{}`。导航页已自动设置。接口拒绝来自外部网站的请求，并防止同一系统重复并发打开。

导航页显示正在打开、已打开或失败原因。自动化失败后浏览器会保留，便于查看目标页上的详细提示。接口不会将目标系统密码发送给导航页。

本地导航台和指定目标网址均使用 HTTP。账号密码会按目标网站现有的登录方式提交，请仅使用授权的演示账号与演示网络。`.gitignore` 已忽略 `config/systems.js`，但这不等于加密：复制、打包和分享整个项目目录时仍应检查该文件。若真实配置曾被 Git 跟踪，新增忽略规则不会删除既有提交中的内容。

## 常见问题

- **浏览器未安装 / Chromium 启动失败**：运行 `npx playwright install chromium`；确认当前机器有桌面会话。若依赖升级后提示找不到浏览器，请重新执行浏览器安装命令。
- **网址未配置**：普通系统需填写 `url`、账号和密码；使用演示程序的系统需配置 `externalDemo.executable`、`externalDemo.cwd` 和平台网址；使用本机安装包的系统则配置 `externalInstaller.packagePath`，然后重启服务。
- **演示程序自动化失败**：确认附件 `演示程序.exe` 路径正确、程序窗口标题为 “HUA DU Platform”，Windows 桌面未锁定，并且“连接”“平台展示”“一体化平台3.2”文字与附件版本一致。窗口会保留，可先手动连接隧道和选择平台，再重新点击导航台按钮。
- **艾搜客户端安装包不存在**：确认 `externalInstaller.packagePath` 指向本机实际存在的 `.exe` 文件。微信聊天记录目录可能随账号或清理操作变化，路径变化后需更新配置并重启服务。
- **目标地址不可达**：`paperless-go`（AI辅助数字化扫描加工）使用 `47.113.229.248:4000`。请确认运行导航台的电脑可以访问该地址，并检查目标服务和防火墙。
- **网络错误 / 页面加载超时**：先在运行服务的同一台电脑上手动访问目标地址，检查域名解析、端口、目标服务与网络。`a.wenzhi.icu:58801`、`47.115.224.12:8080`、`47.120.38.133:9528` 等地址的可用性由目标服务决定。
- **未找到账号输入框 / 未找到密码输入框 / 未找到登录按钮**：检查浏览器是否停留在预期登录页，查看终端日志，并填写该系统的明确选择器。自定义组件、嵌套页面或站点改版可能需要调整探测逻辑；已打开的窗口可直接人工操作。
- **需要人工处理验证码/二次验证**：切换到目标浏览器窗口，手动完成验证。请勿配置绕过登录保护的操作。
- **账号密码已填写但登录失败**：检查目标页提示、账号有效性、密码和权限。自动提交不能保证目标系统接受登录。
- **3000 端口被占用**：先停止占用该端口的进程或另一份导航台，再运行 `npm start`。
- **Git 获取的项目缺少配置文件**：按上文复制 `config/systems.example.js` 为 `config/systems.js`，补齐演示配置后启动。

## 本地验证

```sh
npm test
```

默认测试使用已安装的 Playwright Chromium，以无头模式运行本地页面。如果只安装了 Chrome，可先在 PowerShell 执行 `$env:TEST_BROWSER_CHANNEL = 'chrome'` 再运行测试；这不会改变生产环境默认的有头模式。

测试使用本地模拟登录页面验证接口、字段过滤和自动化行为，不以真实外部系统作为测试依赖。请以命令实际输出判断测试结果；本地测试通过不代表远程演示地址可达，也不保证真实站点的账号、验证码或页面结构始终不变。

实际演示前，启动服务并确认 8 个入口可见；逐个打开 7 个网页系统（含密集架），检查窗口、自动填充、登录提交和只读业务页面；密集架还需确认演示程序和隧道工作正常。点击艾搜入口后，需另行完成安装并验证客户端运行，不能把安装包启动视为客户端演示成功。需要核对密码过滤时，可在浏览器开发者工具中查看 `GET /api/systems` 响应。

## 发布前检查与源码导出

```sh
npm run check
npm run check:network
npm run pages:build
npm run export:source
```

`check` 检查本机静态配置和依赖，`check:network` 增加从当前主机进行的网页连通性检查；均不会提交真实账号或运行安装包。结果不代表真实登录、业务功能或外网远程桌面已验收。`npm run check:public` 会明确报告当前本机架构缺少直接公网演示能力并返回非零退出码。

`pages:build` 在 `dist/pages` 构建可发布到 GitHub Pages 的纯静态导航页；可以通过 `DEMO_DESKTOP_URL` 环境变量传入经认证的 HTTPS 远程桌面网址。未配置网址时，卡片仍可查看并操作，但会提示演示主机未接入，不会假报系统已打开。配置网址后，卡片会在新标签页进入共用的远程桌面；同事仍需在桌面内的导航台选择系统。GitHub Actions Pages 工作流从仓库变量读取该网址，并输出部署成功后的访问 URL。

`export:source` 在 `dist/` 创建新的源码交付目录，采用文件清单排除真实配置、安装包和隧道文件。将该目录内容放在 GitHub 仓库根目录，保留 `.github`、`.gitignore` 与 `package-lock.json`。仓库包含 Windows/Ubuntu 测试工作流和 GitHub Pages 发布工作流；Pages 只托管导航入口，不是远程演示主机。
