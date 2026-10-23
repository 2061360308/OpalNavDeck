# 监控（Monitoring）

桌面可以接入多台被监控服务器：每台运行一个小型 **agent**（`agent/`，Go），桌面通过后端**代理**轮询它们，后续用 widget 可视化。

## 组成

```
[被监控主机] agent (agent/ 目录)  —— 通用插件宿主 + HTTP API
      ▲  HTTP(内网, Bearer)
[桌面后端 server]  /api/sources/*  —— 批量取数 + 控制面转发(只推 manifest)
      ▲  同源(Cookie 会话)
[桌面前端] sources store + DataBroker + monitorHub + 沙箱 widget
```

- 浏览器**只与桌面后端通信**：agent 可以是纯 HTTP（避免 mixed-content），agent 令牌留在后端、不下发浏览器。
- **无 SSE**：事件用游标轮询；指标走 `ETag`/304。
- **批量**：前端聚合订阅，按最小间隔发一次批量请求（后端扇出到各 agent）；超 `MAX_BATCH=50` 前端自动分片异步。

## Agent

见 [`agent/README.md`](../agent/README.md)。要点：

- 通用宿主（不定义指标语义）：插件在 manifest 里自述 `outputs`（key/type/unit）。
- 默认内置插件：`system`（CPU/内存/磁盘/网络/负载/uptime）、`ports`（监听 `0.0.0.0`/`::` 的端口 + 变更事件）。
- 第三方插件：`managed`（核心下载 `entry`、校验 `sha256`、拉起并守护，走 stdio JSON-RPC）或 `external`（自连 agent 的 `ipc` 端点注册）。
- 单令牌鉴权。

API（`Authorization: Bearer`）：`/healthz`、`/v1/info`、`/v1/metrics`(ETag)、`/v1/events?since=`、`/v1/plugins`(增删启停，仅推 manifest)。

`/v1/metrics` 形态：

```json
{ "v":1, "ts":1730000000000,
  "plugins": {
    "system": { "cpu.total":12.3, "mem.used":8589934592, "...":"..." },
    "ports":  { "count":27, "listening":[{"proto":"tcp","addr":"0.0.0.0","port":80,"pid":1464}] }
  } }
```

## 桌面后端（server）

- `GET/POST/PUT/DELETE /api/sources`：增删改查监控源；列表**不含令牌**（`hasToken` 标志）。
- `GET /api/sources/:id/test`：连通性测试（回带 agent info）。
- `GET /api/sources/metrics?ids=a,b,c`：**批量**取数，返回**部分结果**（单源失败不影响整批）。
- `GET /api/sources/:id/events?since=`：事件游标。
- 控制面（经代理，**只推 manifest**）：`GET/POST /api/sources/:id/plugins`、`POST .../:pid/enable|disable`、`DELETE .../:pid`。

定时/批量/超时/`MAX_BATCH` 在 `server/src/sources.ts`。

## 桌面前端

- `desktop/src/lib/sources/sources.svelte.ts`：监控源状态（load/add/update/remove/test）。
- `desktop/src/lib/sources/broker.svelte.ts`：**DataBroker** —— 聚合订阅、按最小间隔（floor 1s、默认 5s）批量拉取、分片、缓存、**切标签/长时间无交互休眠**、恢复先渲染缓存再刷新。
  - `broker.subscribe(source, { keys?, interval }, listener) → unsubscribe`
  - `broker.get(source)` 取最近缓存
- 管理 UI：桌面右键菜单 →「监控源」（`desktop/src/lib/apps/sources/Sources.svelte`）。窗口内可实时预览 CPU/内存/磁盘/网络/端口，并支持编辑、启用/停用、连通性测试。
- `desktop/src/lib/sources/monitorHub.ts`：把 broker 的订阅按 widget 隔离（slot），并通过 bridge 向沙箱推送 `monitor.data`；widget 卸载时自动退订。

## 监控 Widget

Widget 通过宿主能力读取数据，**不直连 HTTP**。皮肤需在 `widget.json` 声明权限：

```json
{ "permissions": ["monitor"] }
```

能力接口：

| 方法 | 说明 |
|---|---|
| `desk.monitor.sources()` | 已配置的监控源（`id/name/baseUrl/enabled`，不含令牌） |
| `desk.monitor.subscribe({ source, keys?, interval?, slot? })` | 订阅指标；`keys` 为 `plugin.output`（支持 `plugin.*`），`slot` 用于替换同一订阅 |
| `desk.monitor.unsubscribe({ slot? })` | 手动退订（组件卸载时宿主会自动退订） |

推送事件 `monitor.data`：

```json
{ "slot": "default", "source": "src-xxx", "ts": 1730000000000,
  "ok": true, "plugins": { "system": { "cpu.total": 12.3 } } }
```

### 示例皮肤

仓库内置示例 `desktop/public/sample-skins/monitor/`。打开「Rainmeter 管理器」→「皮肤库」→「安装示例监控」，即可一键安装并添加到桌面；也可以通过「从文件夹安装」上传任意皮肤目录（需含 `widget.json`）。

## 待办（后续阶段）

- 监控事件（端口变化等）的 widget 展示与时间线。
- 浏览器 Worker 插件与远程插件**统一注册表/调度**（当前 broker 已支持远程）。
- 监控源插件安装/启停的前端 UI（后端接口已就绪）。
