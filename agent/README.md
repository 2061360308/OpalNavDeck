# OpalNavDeck Agent

A small, cross-platform monitoring agent (Go). It is a **generic plugin host**:
it does not define metric semantics — each plugin declares its own outputs, and
the agent aggregates and serves them over an HTTP API.

- **Pull model**: the desktop (via its backend) polls the agent.
- **Single token** auth (personal use, no user/permission model).
- **Plugins**: default in-process plugins (`system`, `ports`) plus third-party
  plugins that are either **core-managed** (spawned, talk over stdio) or
  **external** (register themselves over a pipe/socket).

## Build

```sh
go build -o bin/agentd ./cmd/agentd
go build -o bin/echo   ./examples/echo    # example plugin
```

## Run

```sh
cp config.example.json config.json      # edit token
./bin/agentd -config config.json
# or with flags:
./bin/agentd -listen :9797 -token secret
```

Config fields:

| Field | Meaning | Default |
|---|---|---|
| `name` | host display name | hostname |
| `listen` | HTTP listen address | `:9797` |
| `token` | bearer token for all `/v1/*` | (required) |
| `base_dir` / `plugins_dir` | state / installed plugins | OS config dir |
| `ipc` | external registration endpoint (`unix:/path` or `tcp:host:port`) | unix socket / `tcp:127.0.0.1:9798` |
| `system`, `ports`, `ports_udp` | enable the built-in plugins | `true`, `true`, `false` |
| `plugins` | manifests to preload (managed/external) | `[]` |

## API

All `/v1/*` require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness (no auth) |
| GET | `/v1/info` | host + plugin list (with declared outputs) |
| GET | `/v1/metrics` | aggregated plugin outputs (`ETag`, `If-None-Match` → 304) |
| GET | `/v1/events?since=<id>` | cursor-based event polling |
| GET | `/v1/plugins` | plugin status |
| POST | `/v1/plugins` | install: push a **manifest** (agent downloads + verifies) |
| POST | `/v1/plugins/{id}/enable` \| `/disable` | toggle collection |
| DELETE | `/v1/plugins/{id}` | remove |

`GET /v1/metrics` shape:

```json
{ "v": 1, "ts": 1730000000000,
  "plugins": {
    "system": { "cpu.total": 12.3, "mem.used": 8589934592, "...": "..." },
    "ports":  { "count": 27, "listening": [ {"proto":"tcp","addr":"0.0.0.0","port":80,"pid":1464} ] }
  } }
```

Units: **bytes / bytes-per-second / percent**; timestamps are **ms**.

## Plugins

### Manifest

```json
{ "id": "sysmon", "name": "System Monitor", "version": "1.0.0",
  "mode": "managed",                    // managed | external | builtin
  "entry": "https://host/sysmon-linux-amd64",   // download URL (managed)
  "sha256": "…",                        // verified before running
  "schedule": "5s", "restart": "on-failure",
  "outputs": [ {"key":"cpu.total","type":"number","unit":"percent"} ] }
```

- **managed**: pushed via `POST /v1/plugins`; the agent downloads `entry`,
  verifies `sha256`, runs it, and supervises it (restart/backoff, stderr logs).
- **external**: the plugin process registers itself against the agent's `ipc`
  endpoint (with the register token) — used to inject functionality from other
  programs, possibly written in another language.

### Writing a plugin (Go)

Implement `sdk.Plugin` and call `sdk.ServeStdio` (managed) or `sdk.Connect`
(external). See `examples/echo`.

```go
func (p *myPlugin) Manifest() protocol.Manifest { ... }
func (p *myPlugin) Collect(ctx context.Context) (map[string]any, []sdk.Event, error) { ... }
func (p *myPlugin) Invoke(ctx context.Context, cap string, args json.RawMessage) (any, error) { ... }
```

Other languages can implement the JSON-RPC protocol directly
(`pkg/protocol`, `pkg/rpc`).

## Packaging

- Cross-platform: `goreleaser` (`.goreleaser.yaml`) → linux/darwin/windows × amd64/arm64.
- Container: `Dockerfile`.
- Run as a service: use a systemd unit (Linux) or a Windows service wrapper.

## Notes

- `ports` lists TCP sockets bound to `0.0.0.0`/`::`; PID/process names require
  privileges on Windows (falls back to port-only). UDP is off by default.
- Events are a bounded ring (256) with monotonic ids; cursor-poll with `?since=`.
- No long connections (no SSE); the desktop polls in batches.
