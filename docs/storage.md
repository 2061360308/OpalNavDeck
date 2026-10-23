# 存储后端（Storage）

桌面支持两种存储后端，启动前用环境变量选择：

- `STORAGE=local`（默认）：以本地目录为存储；人类文件管理走 WebDAV（`/dav`），公开代码走 `GET /public/*`。
- `STORAGE=object`：任意 S3 兼容对象存储（AWS S3 / Cloudflare R2 / 阿里云 OSS / 腾讯云 COS / MinIO）。
  - 元数据/列表走**后端代理**，文件字节走**预签名 URL 直传/直下**。
  - 代码包（widget/plugin）走**公开基址**（见下），数据走签名。

## 通用

| 变量 | 说明 | 默认 |
|---|---|---|
| `STORAGE` | `local` 或 `object`（`s3`/`r2` 视为 `object`） | `local` |
| `DESKTOP_TOKEN` | Bearer/Basic 令牌 | `dev-token` |
| `PORT` | 监听端口 | `8787` |
| `NET_PROXY_ALLOW_PRIVATE` | `1` 时允许代理访问内网地址 | 关 |

## local

| 变量 | 说明 | 默认 |
|---|---|---|
| `DESKTOP_FS_ROOT` | 本地存储根目录 | `server/data/desktop-fs` |

- WebDAV：`http://<host>:<port>/dav`（Bearer `<token>`，或任意用户名 + 密码 `<token>` 的 Basic）。
- 公开代码：`http://<host>:<port>/public/<存储路径>`（无鉴权，开启 CORS）。

## object

| 变量 | 说明 |
|---|---|
| `S3_BUCKET` | 必填，桶名 |
| `S3_REGION` | 区域；R2 用 `auto`（默认） |
| `S3_ENDPOINT` | 自定义端点（R2/OSS/COS/MinIO），如 `https://<account>.r2.cloudflarestorage.com` |
| `S3_PREFIX` | 桶内根前缀 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 凭证（也可用实例角色/IAM） |
| `S3_FORCE_PATH_STYLE` | `1` 时使用 path-style（MinIO/R2 常用） |

### 公开代码（public）

代码包**一律公开**（widget/plugin 会下发到客户端执行）。在对象存储里指定一个公开读位置：

| 变量 | 说明 |
|---|---|
| `PUBLIC_BASE` | **必填**，稳定公开基址（自定义域），如 `https://cdn.example.com` |
| `PUBLIC_MODE` | `prefix`（同桶前缀，默认）或 `bucket`（另一个公有读桶） |
| `PUBLIC_PREFIX` | `prefix` 模式：#当前桶内公开的前缀，如 `/Rainmeter` |
| `PUBLIC_BUCKET` | `bucket` 模式：引用的公有读桶名 |

未设置 `PUBLIC_BASE` 时，代码包无法加载（`/public/check` 会给出指引）。

### 桶 CORS（必须）

浏览器直传/直下与跨域加载模块需要桶允许跨域：

```json
[
  {
    "AllowedOrigins": ["https://你的桌面域名"],
    "AllowedMethods": ["GET", "PUT", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "x-amz-request-id"],
    "MaxAgeSeconds": 3000
  }
]
```

> `ExposeHeaders: ETag` 是**分片上传**所必需的（浏览器要读取每个分片的 ETag 才能完成合并）。

### 部署说明（重要）

- **Cloudflare R2**：R2 **没有桶策略/ACL**（`Get/PutBucketPolicy` 未实现），无法做「前缀公开」。因此 R2 上 `PUBLIC_MODE` **必须用 `bucket`**，并把代码放进一个独立桶、在控制台开启公开并绑定自定义域。`prefix` 模式在 R2 上不可用。
- **AWS S3 / OSS / COS / MinIO**：`prefix` 模式需先关闭 Block Public Access，再为前缀写只读 bucket policy（`s3:GetObject`，`Principal: "*"`，`Resource: .../<prefix>/*`）。该配置由管理员手动完成，后端只在 `/api/storage/public/check` **校验并给出指引**，不会自动修改策略。
- `PUBLIC_BASE` 必须是**稳定**的（自定义域）；不要用 R2 的 `r2.dev`（限速、非生产）。

### 说明

- 列表/stat/mkdir/move/remove：后端代理（`/api/fs/*`）。
- 小文件上传/下载：预签名单次 `PUT`/`GET`（`POST /api/fs/sign`）。
- 大文件（>64MB）：预签名分片（`POST /api/fs/mpu`）。
- 状态文件始终走后端代理条件写（`If-Match`），保证乐观锁。
- 网络访问走**后端代理**（`POST /api/net/proxy`），前端不直连。
- 对象存储没有真实目录（用 `/` 前缀模拟），也没有 WebDAV `LOCK`；并发由应用层乐观锁处理。

## 存储布局

```
Rainmeter/
  Skins/<id>/…          代码 · 公开可编辑（widget.json + entry，前端经公开基址加载）
  Plugins/<id>/…        代码 · 公开可编辑（plugin.json + main.mjs，隐藏沙箱 Worker 运行）
  Data/<widgetId>/…     数据 · 私有（widget/plugin 运行时数据，默认仅自己能访问）
  State/widgets.json    只读 · 隐藏（程序管理）
Icons/
  <名字>.json            开放；一个图标一个文件，「文件名即 id」
  .assets/<sha1>.<ext>  开放 · 隐藏（图标图片，按内容 hash 去重）
Boxes/boxes.json         只读 · 隐藏
System/system.json       只读 · 隐藏
System/desktop.json      只读 · 隐藏
```

- 只读前缀（写操作返回 403）：`/Rainmeter/State`、`/Boxes`、`/System`；`.` 前缀的段视为**隐藏**（默认不显示）但可写。
- 应用状态文件通过专用路由 `/api/state/{desktop,widgets,boxes}` 读写。
- 代码包：`GET /api/pkg/list?kind=skin|plugin` 枚举；`POST /api/pkg/install`、`DELETE /api/pkg?kind=&id=` 管理。

## 能力与数据

widget/plugin 不直接访问 HTTP，而是调用宿主注册的**能力**：

- `drive.*` — 读写自己的数据目录 `/Rainmeter/Data/<widgetId>/`（默认读写本目录）。
- `net.fetch` — 后端代理网络。
- `nav.list` / `nav.open` — 导航项。
- `monitor.*` — 监控源与指标订阅（需皮肤声明 `monitor` 权限）。
- 插件可 `expose` 新能力，暴露为 `desk.plugin.<id>.<ns>.<method>`。

### 图标（Icons）

单个图标 = 一个 JSON 文件，文件名即 id：

```json
{
  "name": "哔哩哔哩",
  "url": "https://www.bilibili.com",
  "group": "媒体",
  "icon": "a1b2…f0.png"
}
```

- 列表：`GET /api/icons` 返回 **NDJSON 流**。
- 图片：`GET /icons/assets/:file`（公开只读）。

### 皮肤（Skins）

- 皮肤 = `Rainmeter/Skins/<id>/`（`widget.json` + entry），前端从**公开基址**加载 entry 文档，注入 `<base>` 与 bridge 客户端后以 `<iframe srcdoc>` 沙箱渲染。
