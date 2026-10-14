// Command echo is an example OpalNavDeck plugin. It can run as a core-managed
// plugin (default, over stdio) or as an external plugin (with -ipc) that
// registers itself with a running agent.
//
//	go run .                              # managed: agent spawns and drives it
//	go run . -ipc tcp:127.0.0.1:9798 -token secret   # external registration
package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"sync/atomic"
	"time"

	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

type echo struct {
	tick atomic.Int64
}

func (e *echo) Manifest() protocol.Manifest {
	return protocol.Manifest{
		ID: "echo", Name: "Echo", Version: "1.0.0", Schedule: "5s",
		Outputs: []protocol.Output{
			{Key: "tick", Type: "number", Unit: protocol.UnitCount, Desc: "collect counter"},
			{Key: "now", Type: "number", Unit: protocol.UnitMillis},
		},
	}
}

func (e *echo) Collect(_ context.Context) (map[string]any, []sdk.Event, error) {
	n := e.tick.Add(1)
	return map[string]any{
		"tick": n,
		"now":  time.Now().UnixMilli(),
	}, nil, nil
}

func (e *echo) Invoke(_ context.Context, capability string, args json.RawMessage) (any, error) {
	return map[string]any{"capability": capability, "args": json.RawMessage(args)}, nil
}

func main() {
	ipc := flag.String("ipc", "", "agent IPC endpoint, e.g. unix:/tmp/agent.sock or tcp:127.0.0.1:9798")
	token := flag.String("token", "", "register token (external mode)")
	flag.Parse()

	if *ipc != "" {
		log.Fatal(sdk.Connect(*ipc, *token, &echo{}))
	}
	log.Fatal(sdk.ServeStdio(&echo{}))
}
