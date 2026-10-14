// Package host runs plugins: core-managed processes over stdio, and external
// processes that register themselves over a pipe/socket.
package host

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/opalnavdeck/agent/internal/registry"
	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/rpc"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

// Remote is a plugin that lives in another process, driven over rpc.Conn.
type Remote struct {
	met  protocol.Manifest
	conn *rpc.Conn
}

func (r *Remote) Manifest() protocol.Manifest { return r.met }

func (r *Remote) Collect(ctx context.Context) (map[string]any, []sdk.Event, error) {
	var res protocol.CollectResult
	if err := r.conn.Call(ctx, protocol.MethodCollect, struct{}{}, &res); err != nil {
		return nil, nil, err
	}
	evs := make([]sdk.Event, 0, len(res.Events))
	for _, e := range res.Events {
		evs = append(evs, sdk.Event{Subject: e.Subject, Data: e.Data})
	}
	m := res.Metrics
	if m == nil {
		m = map[string]any{}
	}
	return m, evs, nil
}

func (r *Remote) Invoke(ctx context.Context, capability string, args json.RawMessage) (any, error) {
	var out any
	params := map[string]any{"capability": capability, "args": args}
	if err := r.conn.Call(ctx, protocol.MethodInvoke, params, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Manager supervises managed plugins and accepts external registrations.
type Manager struct {
	ctx      context.Context
	pluginDir string
	reg      *registry.Registry
	log      *log.Logger
	regToken string

	mu      sync.Mutex
	running map[string]context.CancelFunc
	ext     net.Listener
}

// New creates a Manager.
func New(ctx context.Context, pluginDir string, reg *registry.Registry, logger *log.Logger, regToken string) *Manager {
	return &Manager{
		ctx:       ctx,
		pluginDir: pluginDir,
		reg:       reg,
		log:       logger,
		regToken:  regToken,
		running:   make(map[string]context.CancelFunc),
	}
}

// Install handles a pushed manifest. Managed plugins are downloaded, verified
// and started; external plugins just wait to register themselves.
func (m *Manager) Install(man protocol.Manifest) error {
	if man.ID == "" {
		return errors.New("manifest: empty id")
	}
	if man.Mode == "external" {
		m.log.Printf("plugin %s: external, awaiting registration", man.ID)
		return nil
	}
	path, err := m.fetch(man)
	if err != nil {
		return err
	}
	m.startManaged(man, path)
	return nil
}

func (m *Manager) fetch(man protocol.Manifest) (string, error) {
	if man.Entry == "" {
		return "", errors.New("manifest: missing entry")
	}
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	dest := filepath.Join(m.pluginDir, man.ID+ext)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(man.Entry)
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download: status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("download read: %w", err)
	}
	if man.SHA256 != "" {
		sum := sha256.Sum256(data)
		got := hex.EncodeToString(sum[:])
		if !strings.EqualFold(got, man.SHA256) {
			return "", fmt.Errorf("sha256 mismatch: want %s got %s", man.SHA256, got)
		}
	}
	tmp := dest + ".tmp"
	if err := os.WriteFile(tmp, data, 0o755); err != nil {
		return "", fmt.Errorf("write: %w", err)
	}
	if err := os.Rename(tmp, dest); err != nil {
		return "", fmt.Errorf("install: %w", err)
	}
	return dest, nil
}

func (m *Manager) startManaged(man protocol.Manifest, path string) {
	m.mu.Lock()
	if cancel := m.running[man.ID]; cancel != nil {
		cancel()
	}
	ctx, cancel := context.WithCancel(m.ctx)
	m.running[man.ID] = cancel
	m.mu.Unlock()
	go m.supervise(ctx, man, path)
}

func (m *Manager) supervise(ctx context.Context, man protocol.Manifest, path string) {
	backoff := time.Second
	for {
		err := m.runOnce(ctx, man, path)
		if ctx.Err() != nil {
			return
		}
		if man.Restart != "on-failure" {
			m.log.Printf("plugin %s exited: %v", man.ID, err)
			return
		}
		m.log.Printf("plugin %s exited (%v), restarting in %s", man.ID, err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (m *Manager) runOnce(ctx context.Context, man protocol.Manifest, path string) error {
	cmd := exec.Command(path, man.Args...)
	cmd.Env = os.Environ()
	for k, v := range man.Env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	rw := &pipeRW{r: stdout, w: stdin, kill: func() { _ = cmd.Process.Kill() }}
	conn := rpc.New(rw, nil)
	conn.Start()

	go func() {
		sc := newLogScanner(m.log, man.ID)
		_, _ = io.Copy(sc, stderr)
	}()

	hsCtx, hsCancel := context.WithTimeout(ctx, 10*time.Second)
	var got protocol.Manifest
	if err := conn.Call(hsCtx, protocol.MethodManifest, struct{}{}, &got); err != nil {
		hsCancel()
		conn.Close()
		_ = cmd.Wait()
		return fmt.Errorf("handshake: %w", err)
	}
	hsCancel()
	got.Mode = "managed"
	if got.ID == "" {
		got.ID = man.ID
	}
	if got.Schedule == "" {
		got.Schedule = man.Schedule
	}
	if man.Mode == "external" {
		got.Mode = "external"
	}

	remote := &Remote{met: got, conn: conn}
	m.reg.Register(remote, true)
	m.log.Printf("plugin %s started (%s)", got.ID, path)

	<-conn.Done()
	_ = cmd.Wait()
	m.reg.SetEnabled(got.ID, false)
	return errors.New("connection closed")
}

// StartExternal begins accepting external plugin registrations on addr
// ("unix:/path" or "tcp:127.0.0.1:port").
func (m *Manager) StartExternal(addr string) error {
	if addr == "" {
		return nil
	}
	network, address := splitAddr(addr)
	_ = os.Remove(address) // stale unix socket
	ln, err := net.Listen(network, address)
	if err != nil {
		return err
	}
	m.ext = ln
	m.log.Printf("external registration listening on %s", addr)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go m.serveExternal(c)
		}
	}()
	return nil
}

func (m *Manager) serveExternal(c net.Conn) {
	var conn *rpc.Conn
	handler := func(ctx context.Context, method string, params json.RawMessage) (any, error) {
		if method != protocol.MethodHello {
			return nil, fmt.Errorf("unexpected method %q", method)
		}
		var h protocol.HelloParams
		if err := json.Unmarshal(params, &h); err != nil {
			return nil, err
		}
		if m.regToken != "" && h.Token != m.regToken {
			return nil, errors.New("invalid register token")
		}
		if h.Proto != protocol.Proto {
			return nil, fmt.Errorf("proto mismatch: %d", h.Proto)
		}
		man := protocol.Manifest{
			ID: h.ID, Name: h.Name, Version: h.Version, Mode: "external", Outputs: h.Outputs,
		}
		remote := &Remote{met: man, conn: conn}
		m.reg.Register(remote, true)
		m.log.Printf("external plugin %s registered", h.ID)
		go func() {
			<-conn.Done()
			m.reg.Remove(h.ID)
		}()
		return true, nil
	}
	conn = rpc.New(c, handler)
	conn.Start()
}

// Stop closes the external listener and stops managed plugins.
func (m *Manager) Stop() {
	m.mu.Lock()
	for _, cancel := range m.running {
		cancel()
	}
	m.mu.Unlock()
	if m.ext != nil {
		_ = m.ext.Close()
	}
}

func splitAddr(addr string) (network, address string) {
	if strings.HasPrefix(addr, "unix:") {
		return "unix", strings.TrimPrefix(addr, "unix:")
	}
	if strings.HasPrefix(addr, "tcp:") {
		return "tcp", strings.TrimPrefix(addr, "tcp:")
	}
	return "tcp", addr
}

type pipeRW struct {
	r    io.ReadCloser
	w    io.WriteCloser
	kill func()
}

func (p *pipeRW) Read(b []byte) (int, error)  { return p.r.Read(b) }
func (p *pipeRW) Write(b []byte) (int, error) { return p.w.Write(b) }
func (p *pipeRW) Close() error {
	if p.kill != nil {
		p.kill()
	}
	_ = p.w.Close()
	return p.r.Close()
}

// logScanner prefixes each stderr line with the plugin id.
type logScanner struct {
	log *log.Logger
	id  string
	buf []byte
}

func newLogScanner(l *log.Logger, id string) *logScanner { return &logScanner{log: l, id: id} }

func (s *logScanner) Write(p []byte) (int, error) {
	s.buf = append(s.buf, p...)
	for {
		i := indexByte(s.buf, '\n')
		if i < 0 {
			break
		}
		line := strings.TrimRight(string(s.buf[:i]), "\r")
		s.buf = s.buf[i+1:]
		if line != "" {
			s.log.Printf("[%s] %s", s.id, line)
		}
	}
	return len(p), nil
}

func indexByte(b []byte, c byte) int {
	for i := range b {
		if b[i] == c {
			return i
		}
	}
	return -1
}
