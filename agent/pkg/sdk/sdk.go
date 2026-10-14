// Package sdk lets anyone write an OpalNavDeck agent plugin in Go. Implement
// Plugin, then call ServeStdio (for a core-managed plugin) or Connect (for an
// external plugin that registers over a pipe/socket).
package sdk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"strings"

	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/rpc"
)

// Event is emitted by a plugin during Collect (id/ts/plugin are filled by core).
type Event struct {
	Subject string
	Data    map[string]any
}

// Plugin is implemented by plugin authors.
type Plugin interface {
	// Manifest describes the plugin: id/name/version and its outputs.
	Manifest() protocol.Manifest
	// Collect returns the current outputs (keyed by output key) and new events.
	Collect(ctx context.Context) (map[string]any, []Event, error)
	// Invoke runs a named capability. Return an error if unsupported.
	Invoke(ctx context.Context, capability string, args json.RawMessage) (any, error)
}

// Serve runs the plugin side of the protocol over a connected stream.
func Serve(rw io.ReadWriteCloser, p Plugin) error {
	conn := rpc.New(rw, handlerFor(p))
	conn.Start()
	<-conn.Done()
	return nil
}

// ServeStdio serves a core-managed plugin over stdin/stdout.
func ServeStdio(p Plugin) error { return Serve(stdioStream{}, p) }

// Connect dials the agent's external-registration endpoint ("unix:/path" or
// "tcp:host:port"), announces itself, then serves the plugin over the socket.
func Connect(addr, token string, p Plugin) error {
	network, address := splitAddr(addr)
	c, err := net.Dial(network, address)
	if err != nil {
		return fmt.Errorf("dial %s: %w", addr, err)
	}
	conn := rpc.New(c, handlerFor(p))
	conn.Start()
	m := p.Manifest()
	_ = conn.Notify(protocol.MethodHello, protocol.HelloParams{
		Proto:   protocol.Proto,
		ID:      m.ID,
		Name:    m.Name,
		Version: m.Version,
		Token:   token,
		Outputs: m.Outputs,
	})
	<-conn.Done()
	return nil
}

func handlerFor(p Plugin) rpc.Handler {
	return func(ctx context.Context, method string, params json.RawMessage) (any, error) {
		switch method {
		case protocol.MethodManifest:
			return p.Manifest(), nil
		case protocol.MethodCollect:
			metrics, evs, err := p.Collect(ctx)
			if err != nil {
				return nil, err
			}
			out := protocol.CollectResult{Metrics: metrics}
			for _, e := range evs {
				out.Events = append(out.Events, protocol.EventInput{Subject: e.Subject, Data: e.Data})
			}
			return out, nil
		case protocol.MethodInvoke:
			var in struct {
				Capability string          `json:"capability"`
				Args       json.RawMessage `json:"args"`
			}
			_ = json.Unmarshal(params, &in)
			return p.Invoke(ctx, in.Capability, in.Args)
		case protocol.MethodConfigure:
			return true, nil
		case protocol.MethodPing:
			return "pong", nil
		case protocol.MethodShutdown:
			return true, nil
		default:
			return nil, fmt.Errorf("unknown method %q", method)
		}
	}
}

func splitAddr(addr string) (network, address string) {
	switch {
	case strings.HasPrefix(addr, "unix:"):
		return "unix", strings.TrimPrefix(addr, "unix:")
	case strings.HasPrefix(addr, "tcp:"):
		return "tcp", strings.TrimPrefix(addr, "tcp:")
	default:
		return "tcp", addr
	}
}

type stdioStream struct{}

func (stdioStream) Read(b []byte) (int, error)  { return os.Stdin.Read(b) }
func (stdioStream) Write(b []byte) (int, error) { return os.Stdout.Write(b) }
func (stdioStream) Close() error                { return nil }
