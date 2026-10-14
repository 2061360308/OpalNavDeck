// Package events provides a bounded, monotonic-id event buffer for cursor polling.
package events

import (
	"sync"
	"time"

	"github.com/opalnavdeck/agent/pkg/protocol"
)

// Ring is a fixed-size ring buffer of events with monotonically increasing ids.
type Ring struct {
	mu   sync.Mutex
	buf  []protocol.Event
	max  int
	next int64
}

// New creates a ring holding at most max events.
func New(max int) *Ring {
	if max <= 0 {
		max = 256
	}
	return &Ring{max: max}
}

// Add appends an event, assigning its id and timestamp.
func (r *Ring) Add(plugin, subject string, data map[string]any) protocol.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.next++
	e := protocol.Event{
		ID:      r.next,
		TS:      time.Now().UnixMilli(),
		Plugin:  plugin,
		Subject: subject,
		Data:    data,
	}
	r.buf = append(r.buf, e)
	if len(r.buf) > r.max {
		r.buf = r.buf[len(r.buf)-r.max:]
	}
	return e
}

// Since returns events with id greater than since.
func (r *Ring) Since(since int64) []protocol.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]protocol.Event, 0, len(r.buf))
	for _, e := range r.buf {
		if e.ID > since {
			out = append(out, e)
		}
	}
	return out
}

// LastID returns the most recent event id (0 if none).
func (r *Ring) LastID() int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.next
}
