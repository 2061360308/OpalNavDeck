// Package rpc is a minimal line-delimited JSON-RPC 2.0 codec used between the
// agent core and plugin processes (over stdio or a pipe/socket).
package rpc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"

	"github.com/opalnavdeck/agent/pkg/protocol"
)

// Handler handles an incoming request from the remote peer.
type Handler func(ctx context.Context, method string, params json.RawMessage) (any, error)

var ErrClosed = errors.New("rpc: connection closed")

type message struct {
	JSONRPC string              `json:"jsonrpc"`
	ID      json.RawMessage     `json:"id,omitempty"`
	Method  string              `json:"method,omitempty"`
	Params  json.RawMessage     `json:"params,omitempty"`
	Result  json.RawMessage     `json:"result,omitempty"`
	Error   *protocol.RPCError  `json:"error,omitempty"`
}

// Conn is a bidirectional JSON-RPC connection over a byte stream.
type Conn struct {
	rw      io.ReadWriteCloser
	dec     *json.Decoder
	enc     *json.Encoder
	handler Handler

	wmu sync.Mutex
	mu  sync.Mutex
	seq int64
	// key is the raw JSON id string
	pending map[string]chan *message
	done    chan struct{}
	once    sync.Once
}

// New creates a Conn. handler may be nil (then incoming requests are answered
// with a "method not found" error).
func New(rw io.ReadWriteCloser, handler Handler) *Conn {
	dec := json.NewDecoder(rw)
	enc := json.NewEncoder(rw)
	return &Conn{
		rw:      rw,
		dec:     dec,
		enc:     enc,
		handler: handler,
		pending: make(map[string]chan *message),
		done:    make(chan struct{}),
	}
}

// Start runs the read loop in a goroutine.
func (c *Conn) Start() {
	go c.readLoop()
}

// Done is closed when the connection terminates.
func (c *Conn) Done() <-chan struct{} { return c.done }

func (c *Conn) Close() {
	c.once.Do(func() {
		close(c.done)
		_ = c.rw.Close()
	})
}

func (c *Conn) readLoop() {
	defer c.Close()
	for {
		var m message
		if err := c.dec.Decode(&m); err != nil {
			// deliver the error to all pending calls
			c.mu.Lock()
			for k, ch := range c.pending {
				ch <- &message{Error: &protocol.RPCError{Code: -32000, Message: err.Error()}}
				delete(c.pending, k)
			}
			c.mu.Unlock()
			return
		}
		if m.Method != "" {
			go c.handleRequest(&m)
			continue
		}
		key := string(m.ID)
		c.mu.Lock()
		ch := c.pending[key]
		delete(c.pending, key)
		c.mu.Unlock()
		if ch != nil {
			ch <- &m
		}
	}
}

func (c *Conn) handleRequest(m *message) {
	ctx := context.Background()
	if c.handler == nil {
		c.writeError(m.ID, -32601, "method not found")
		return
	}
	res, err := c.handler(ctx, m.Method, m.Params)
	if len(m.ID) == 0 {
		return // notification
	}
	if err != nil {
		c.writeError(m.ID, -32000, err.Error())
		return
	}
	c.writeResult(m.ID, res)
}

// Call performs a request and waits for the response.
func (c *Conn) Call(ctx context.Context, method string, params any, out any) error {
	c.mu.Lock()
	c.seq++
	id := c.seq
	raw, _ := json.Marshal(id)
	key := string(raw)
	ch := make(chan *message, 1)
	c.pending[key] = ch
	c.mu.Unlock()

	praw, err := json.Marshal(params)
	if err != nil {
		return err
	}
	if err := c.write(&message{JSONRPC: "2.0", ID: raw, Method: method, Params: praw}); err != nil {
		c.mu.Lock()
		delete(c.pending, key)
		c.mu.Unlock()
		return err
	}

	select {
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, key)
		c.mu.Unlock()
		return ctx.Err()
	case <-c.done:
		return ErrClosed
	case m := <-ch:
		if m.Error != nil {
			return fmt.Errorf("rpc %s: %s", method, m.Error.Message)
		}
		if out != nil && len(m.Result) > 0 {
			return json.Unmarshal(m.Result, out)
		}
		return nil
	}
}

// Notify sends a notification (no response expected).
func (c *Conn) Notify(method string, params any) error {
	praw, err := json.Marshal(params)
	if err != nil {
		return err
	}
	return c.write(&message{JSONRPC: "2.0", Method: method, Params: praw})
}

func (c *Conn) writeResult(id json.RawMessage, result any) {
	raw, _ := json.Marshal(result)
	_ = c.write(&message{JSONRPC: "2.0", ID: id, Result: raw})
}

func (c *Conn) writeError(id json.RawMessage, code int, msg string) {
	_ = c.write(&message{JSONRPC: "2.0", ID: id, Error: &protocol.RPCError{Code: code, Message: msg}})
}

func (c *Conn) write(m *message) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	return c.enc.Encode(m)
}
