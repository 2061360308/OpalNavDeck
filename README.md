# OpalNavDeck

> A beautiful, private, desktop-style resource navigation hub.
> 私人资源导航 · 漂亮的桌面式主页。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D22.9-green.svg)
![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00.svg)
![Hono](https://img.shields.io/badge/Hono-4-e36002.svg)

OpalNavDeck 把「资源导航」做成了一整套**浏览器里的虚拟桌面**：窗口、图标盒子、壁纸主题、可扩展的皮肤与插件、可选的登录与多存储后端。它既能当简洁的私人起始页，也能当高度定制的桌面环境。

<!-- 截图占位：docs/screenshot.png -->

## ✨ 特性

- **桌面式交互**：窗口管理、图标盒子（图标/列表布局、堆叠成容器/tab）、拖拽与边缘吸附、右键菜单。
- **资源导航**：按分类浏览、搜索、最近使用、映射盒子（与某分类同步）。
- **个性化**：纯色/图片/视频/幻灯片/Windows 聚焦壁纸、自定义光标、主题与强调色、浅色/深色/高对比。
- **皮肤与插件**：类 Rainmeter 的包模型（`widget.json` + 入口 HTML；插件为 `plugin.json` + `main.js`，运行在沙箱 Worker）。皮肤在沙箱 iframe 中渲染，通过 `window.desk` 桥接与宿主通信。
- **两种存储后端**：本地目录（含 WebDAV）或任意 S3 兼容对象存储（AWS S3 / Cloudflare R2 / 阿里云 OSS / 腾讯 COS / MinIO）。
- **可选登录**：用户名/密码登录；登录后可绑定 **GitHub** 或 **支付宝**（扫码）作为登录方式。
- **PWA**：提供 Web App Manifest 与 Service Worker，可安装到桌面/移动端。
- **端到端类型**：前后端共享契约，API 走 [Hono RPC](https://hono.dev/docs/guides/rpc) 类型化调用。

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Svelte 5（runes）+ Vite + TypeScript |
| 后端 | Hono + `@hono/node-server`（Node） |
| 共享 | `@desktop/shared`（类型、路径、路由、bridge 协议） |
| 存储 | 本地文件系统 / S3 兼容对象存储（AWS SDK v3） |
| 其它 | WebDAV、Service Worker、Hono RPC |

## 📁 目录结构

```
.
├─ desktop/           # 前端 SPA（Svelte 5 + Vite）
│  ├─ public/         #  静态资源（favicon、默认壁纸、manifest、sw.js）
│  └─ src/
├─ server/            # 后端 API
│  ├─ src/
│  │  ├─ app.ts       #  createApp(deps)：平台无关的 Hono 应用（RPC 类型来源）
│  │  ├─ auth/        #  登录（密码 / GitHub / 支付宝）
│  │  ├─ storage/     #  存储抽象（local / s3 / webdav）
│  │  └─ platform/    #  node.ts：Node 入口（静态托管 + WebDAV + serve）
│  └─ .env.example    #  环境变量示例
├─ shared/            # 前后端共享契约（类型/路径/路由/bridge）
├─ docs/              # 文档
└─ package.json       # npm workspaces 根
```

## 🚀 快速开始

**前置要求**：Node.js ≥ 22.9（推荐 24），npm。

```bash
# 1) 安装依赖（workspaces，一次装齐）
npm install

# 2) （可选）配置服务端
cp server/.env.example server/.env   # Windows PowerShell: copy server\.env.example server\.env

# 3) 开发
npm run dev:server    # 后端 http://localhost:8787
npm run dev:desktop   # 前端 http://localhost:5173（已把 /api 等代理到 8787）

# 4) 生产构建 + 启动（后端同时托管前端静态文件）
npm run build
npm run start
```

构建后访问 `http://localhost:8787` 即为完整应用（API + 静态站点 + `/dav`）。

## ⚙️ 配置

服务端配置全部为**环境变量**，且都可选——不配置时使用内置默认值（本地存储 + 令牌 `dev-token` + 关闭登录）。完整清单见 [`server/.env.example`](./server/.env.example)，要点：

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 监听端口 | `8787` |
| `DESKTOP_TOKEN` | 静态令牌（`/dav` 与应急用），建议改强随机串 | `dev-token` |
| `STORAGE` | `local` 或 `object`（S3 兼容） | `local` |
| `DESKTOP_FS_ROOT` | 本地存储根目录 | `server/data/desktop-fs` |
| `S3_*` | 对象存储配置（bucket/region/endpoint/keys 等） | — |
| `AUTH_ENABLED` | `1` 才开启登录 | 关闭 |
| `AUTH_USERNAME` / `AUTH_PASSWORD`(`_HASH`) | 登录凭据（推荐用 PBKDF2 哈希） | — |
| `SESSION_SECRET` | 会话 Cookie 签名密钥 | 不安全默认值 |
| `PUBLIC_BASE_URL` | 对外基址（OAuth 回调、Cookie Secure） | — |
| `GITHUB_CLIENT_ID/SECRET` | GitHub 登录 | — |
| `ALIPAY_*` | 支付宝登录（appid/私钥/公钥/网关） | — |

> 生成密码哈希：在 `server/` 下运行
> `node --input-type=module -e "import('./src/auth/config.ts').then(async m=>console.log(await m.hashPassword('你的密码')))"`

## 💾 存储后端

- **local（默认）**：以本地目录为存储，并在 `/dav` 暴露 WebDAV（可挂载为网络盘，用资源管理器管理 `Skins/Icons` 等）。
- **object**：任意 S3 兼容对象存储。元数据/列表走后端代理，文件字节走**预签名 URL 直传/直下**。
  > 浏览器直传需要为桶配置 CORS（并 `ExposeHeaders: ETag` 以支持分片上传）。

存储布局（节选）：

```
Rainmeter/Skins/<id>/…      皮肤/组件包（widget.json + 入口）
Rainmeter/Plugins/<id>/…    插件包（plugin.json + main.js）
Icons/<名字>.json           图标（文件名即 id），图片在 Icons/.assets
Boxes/boxes.json            盒子（程序管理）
System/system.json|desktop.json   系统与桌面配置（程序管理）
```

## 🔐 登录（可选）

默认**关闭**。开启后：

1. 用 `AUTH_USERNAME` / `AUTH_PASSWORD` 登录；
2. 登录后在「账号与安全」中**绑定 GitHub 或支付宝**；
3. 绑定后即可在登录页用对应方式登录（GitHub 重定向 / 支付宝扫码）。

- 会话：HttpOnly 签名 Cookie（无状态）。
- `/dav` 仍使用 `DESKTOP_TOKEN`（供 WebDAV 客户端）。
- OAuth 回调需公网 HTTPS 且域名已在对应平台登记。

## 🧩 皮肤与插件

- **皮肤/组件**：`Rainmeter/Skins/<id>/` 内含 `widget.json`（`name/size/entry/permissions/…`）与入口文档（默认 `index.html`）；资源相对路径会按包目录解析。
- **插件**：`Rainmeter/Plugins/<id>/` 内含 `plugin.json` 与 `main.js`，在隐藏沙箱 Web Worker 中运行，通过能力（capabilities）通信。

## 📱 PWA

已内置 `manifest.webmanifest` 与 `sw.js`（默认不缓存应用代码，保证更新即时生效）。安装需 **HTTPS**（或 localhost）。如需更规范的安装图标，可补充 PNG 192/512（含 maskable）并更新 manifest。

## 🌐 部署

- **自托管（推荐）**：Node 进程同时提供 API、前端静态文件与 `/dav`。可用 Docker/系统服务承载，`npm run build && npm run start`。
- **Cloudflare Workers**：`wrangler.toml`（Worker 入口 + 静态资源 + 两个 R2 绑定）。
  1. 建两个桶：`wrangler r2 bucket create opalnavdeck`（私有，放数据）与 `opalnavdeck-public`（公开，放代码包）。
  2. 给**公开桶**开启公开访问（r2.dev 子域或自定义域），把地址填到 `PUBLIC_BASE`。
  3. 构建设置：**Root directory = 仓库根**、**Build command = `npm ci && npm run build`**（产物 `desktop/dist`）。
  4. 密钥（控制台或 `wrangler secret put`）：`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`（私有数据预签名）、`SESSION_SECRET`、`AUTH_PASSWORD`（或 `_HASH`）、`GITHUB_CLIENT_SECRET`、`ALIPAY_PRIVATE_KEY`；非密放 `[vars]`（`STORAGE=object`、`R2_ACCOUNT_ID`/`R2_ENDPOINT`、`R2_BUCKET`、`R2_PUBLIC_BUCKET`、`PUBLIC_BASE`、`S3_PREFIX` …）。
  5. 本地联调：`copy .dev.vars.example .dev.vars` → `npm run dev:cloudflare`；部署 `npm run deploy:cloudflare`。
  > **代码包**（`/Rainmeter/Skins`、`/Rainmeter/Plugins`）放公开桶，经 r2.dev **直链加载**；**数据文件**走**后端预签名直连**（对象模式下 `/icons/assets`、`/media/*` 返回 302 到预签名 URL，`/api/fs/*` 的 blob 由前端 `S3Driver` 用 `sign` 直传/直下）。边缘无本地磁盘/WebDAV。
  > 单桶 + 前缀公开（`PUBLIC_MODE=prefix`）仅 AWS S3/OSS/COS 支持；R2 只支持双桶（整桶公开）。
- **其它 Serverless（Vercel 等）**：同理新增 `platform/*` 入口，并使用对象存储。

## 🗺️ 路线图

- CanoKey / WebAuthn（安全密钥）登录
- 更多内置能力与示例皮肤
- Vercel / Cloudflare Workers 官方适配

## 🙏 致谢

- 灵感来自 **Rainmeter** 与桌面组件生态。
- 默认壁纸来源：wallhaven（如用于分发请遵守原作者许可）。

## 📄 License

[MIT](./LICENSE) © 2026 OpalNavDeck
