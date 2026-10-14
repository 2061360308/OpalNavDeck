// Package registry holds the agent's plugins, schedules their collection, caches
// the latest metrics and forwards emitted events into the ring buffer.
package registry

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/opalnavdeck/agent/internal/events"
	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

const defaultSchedule = 5 * time.Second

type entry struct {
	manifest protocol.Manifest
	plugin   sdk.Plugin
	enabled  bool
	last     map[string]any
	ts       int64
	err      string
	cancel   context.CancelFunc
}

// Registry is the plugin registry + scheduler.
type Registry struct {
	mu      sync.RWMutex
	entries map[string]*entry
	order   []string
	ring    *events.Ring
	version string
}

// New creates a registry.
func New(ring *events.Ring, version string) *Registry {
	return &Registry{entries: make(map[string]*entry), ring: ring, version: version}
}

// Register adds (or replaces) a plugin. Built-in plugins are enabled by config.
func (r *Registry) Register(p sdk.Plugin, enabled bool) {
	m := p.Manifest()
	r.mu.Lock()
	if _, ok := r.entries[m.ID]; !ok {
		r.order = append(r.order, m.ID)
	}
	e := &entry{manifest: m, plugin: p, enabled: enabled}
	r.entries[m.ID] = e
	r.mu.Unlock()
	if enabled {
		r.start(e)
	}
}

// SetEnabled toggles a plugin's scheduler.
func (r *Registry) SetEnabled(id string, on bool) error {
	r.mu.Lock()
	e := r.entries[id]
	if e != nil {
		e.enabled = on
	}
	r.mu.Unlock()
	if e == nil {
		return fmt.Errorf("plugin %q not found", id)
	}
	if on {
		r.start(e)
	} else {
		r.stop(e)
	}
	return nil
}

// Remove stops and deletes a plugin.
func (r *Registry) Remove(id string) error {
	r.mu.Lock()
	e := r.entries[id]
	if e == nil {
		r.mu.Unlock()
		return fmt.Errorf("plugin %q not found", id)
	}
	delete(r.entries, id)
	for i, v := range r.order {
		if v == id {
			r.order = append(r.order[:i], r.order[i+1:]...)
			break
		}
	}
	r.mu.Unlock()
	r.stop(e)
	return nil
}

// Has reports whether a plugin id is registered.
func (r *Registry) Has(id string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.entries[id] != nil
}

func (r *Registry) start(e *entry) {
	r.stop(e)
	ctx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	go r.loop(ctx, e)
}

func (r *Registry) stop(e *entry) {
	if e.cancel != nil {
		e.cancel()
		e.cancel = nil
	}
}

func (r *Registry) loop(ctx context.Context, e *entry) {
	interval := parseSchedule(e.manifest.Schedule)
	r.collect(ctx, e)
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.collect(ctx, e)
		}
	}
}

func (r *Registry) collect(parent context.Context, e *entry) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	metrics, evs, err := e.plugin.Collect(ctx)
	r.mu.Lock()
	if err != nil {
		e.err = err.Error()
	} else {
		e.err = ""
		if metrics == nil {
			metrics = map[string]any{}
		}
		e.last = metrics
		e.ts = time.Now().UnixMilli()
	}
	r.mu.Unlock()
	for _, ev := range evs {
		r.ring.Add(e.manifest.ID, ev.Subject, ev.Data)
	}
}

// List returns plugin statuses in registration order.
func (r *Registry) List() []protocol.PluginInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]protocol.PluginInfo, 0, len(r.order))
	for _, id := range r.order {
		e := r.entries[id]
		if e == nil {
			continue
		}
		out = append(out, protocol.PluginInfo{
			ID:      e.manifest.ID,
			Name:    e.manifest.Name,
			Version: e.manifest.Version,
			Mode:    e.manifest.Mode,
			Enabled: e.enabled,
			Outputs: e.manifest.Outputs,
			Error:   e.err,
		})
	}
	return out
}

// Metrics returns the cached aggregate of all enabled plugins.
func (r *Registry) Metrics() protocol.Metrics {
	r.mu.RLock()
	defer r.mu.RUnlock()
	plugins := make(map[string]map[string]any)
	var ts int64
	for _, e := range r.entries {
		if !e.enabled || e.last == nil {
			continue
		}
		plugins[e.manifest.ID] = e.last
		if e.ts > ts {
			ts = e.ts
		}
	}
	if ts == 0 {
		ts = time.Now().UnixMilli()
	}
	return protocol.Metrics{V: protocol.Proto, TS: ts, Plugins: plugins}
}

// CollectNow triggers an immediate collection for a plugin (best-effort).
func (r *Registry) CollectNow(ctx context.Context, id string) error {
	r.mu.RLock()
	e := r.entries[id]
	r.mu.RUnlock()
	if e == nil {
		return fmt.Errorf("plugin %q not found", id)
	}
	r.collect(ctx, e)
	return nil
}

func parseSchedule(s string) time.Duration {
	if s == "" {
		return defaultSchedule
	}
	d, err := time.ParseDuration(s)
	if err != nil || d < time.Second {
		return defaultSchedule
	}
	return d
}
