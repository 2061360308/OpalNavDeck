// Package protocol defines the wire types shared by the agent core and plugins.
//
// The agent core is a generic host: it does not define metric semantics. Each
// plugin declares its own outputs (key/type/unit) in its manifest, and the core
// simply aggregates and serves whatever the enabled plugins report.
package protocol

import "encoding/json"

// Proto is the protocol version negotiated at handshake.
const Proto = 1

// Standard units (by convention): bytes, bytes per second, percent, count,
// seconds, milliseconds. Timestamps are milliseconds since the Unix epoch.
const (
	UnitBytes   = "bytes"
	UnitBps     = "bytes_per_sec"
	UnitPercent = "percent"
	UnitCount   = "count"
	UnitSeconds = "seconds"
	UnitMillis  = "ms"
)

// Output describes one value a plugin produces.
type Output struct {
	Key  string `json:"key"`
	Type string `json:"type"` // number | string | bool | array | object
	Unit string `json:"unit,omitempty"`
	Desc string `json:"desc,omitempty"`
}

// Manifest describes a plugin. It is the only thing the control plane pushes to
// an agent for an install; the agent downloads Entry itself and verifies SHA256.
type Manifest struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Version     string            `json:"version"`
	Description string            `json:"description,omitempty"`
	Runtime     string            `json:"runtime,omitempty"` // process (default)
	Mode        string            `json:"mode,omitempty"`    // builtin | managed | external
	Entry       string            `json:"entry,omitempty"`   // download URL (managed)
	SHA256      string            `json:"sha256,omitempty"`  // hex digest of the binary
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Schedule    string            `json:"schedule,omitempty"` // e.g. "5s"
	Restart     string            `json:"restart,omitempty"`  // on-failure | never
	Outputs     []Output          `json:"outputs,omitempty"`
}

// PluginInfo is the runtime status of a registered plugin.
type PluginInfo struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Version string   `json:"version"`
	Mode    string   `json:"mode"`
	Enabled bool     `json:"enabled"`
	Outputs []Output `json:"outputs,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// Info is the response of GET /v1/info.
type Info struct {
	V       int          `json:"v"`
	Name    string       `json:"name"`
	OS      string       `json:"os"`
	Arch    string       `json:"arch"`
	Kernel  string       `json:"kernel,omitempty"`
	Agent   string       `json:"agent"`
	Proto   int          `json:"proto"`
	Plugins []PluginInfo `json:"plugins"`
}

// Metrics is the aggregated output of all enabled plugins:
//
//	{ "v":1, "ts":<ms>, "plugins": { "<id>": { "<outputKey>": <value> } } }
type Metrics struct {
	V       int                       `json:"v"`
	TS      int64                     `json:"ts"`
	Plugins map[string]map[string]any `json:"plugins"`
}

// Event is one buffered event, e.g. a port opening/closing.
type Event struct {
	ID      int64          `json:"id"`
	TS      int64          `json:"ts"`
	Plugin  string         `json:"plugin"`
	Subject string         `json:"subject"`
	Data    map[string]any `json:"data,omitempty"`
}

// CollectResult is what a plugin returns for a "collect" request.
type CollectResult struct {
	Metrics map[string]any `json:"metrics"`
	Events  []EventInput   `json:"events,omitempty"`
}

// EventInput is an event emitted by a plugin during collect (id/ts/plugin are
// filled in by the core).
type EventInput struct {
	Subject string         `json:"subject"`
	Data    map[string]any `json:"data,omitempty"`
}

/* ----------------------------- JSON-RPC 2.0 ----------------------------- */

// JSON-RPC method names used between the core and plugins.
const (
	MethodManifest  = "manifest"  // core -> plugin
	MethodCollect   = "collect"   // core -> plugin
	MethodInvoke    = "invoke"    // core -> plugin
	MethodConfigure = "configure" // core -> plugin
	MethodPing      = "ping"      // core -> plugin
	MethodShutdown  = "shutdown"  // core -> plugin
	MethodHello     = "hello"     // plugin -> core (external registration)
	MethodEvent     = "event"     // plugin -> core (notification, no id)
)

// Request is a JSON-RPC 2.0 request/notification.
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// Response is a JSON-RPC 2.0 response.
type Response struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// RPCError is a JSON-RPC 2.0 error object.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// HelloParams is the first message an external plugin sends after connecting.
type HelloParams struct {
	Proto        int      `json:"proto"`
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Token        string   `json:"token,omitempty"`
	Capabilities []string `json:"capabilities,omitempty"`
	Outputs      []Output `json:"outputs,omitempty"`
}
