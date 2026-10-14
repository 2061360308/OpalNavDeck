package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"sync"

	"github.com/shirou/gopsutil/v4/process"
	gnet "github.com/shirou/gopsutil/v4/net"

	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

// Ports is the built-in listener plugin: it enumerates TCP (optionally UDP)
// sockets bound to wildcard addresses (0.0.0.0 / ::) and emits change events.
type Ports struct {
	udp bool

	mu      sync.Mutex
	prev    map[string]port
	seeded  bool
	names   map[int32]string
}

type port struct {
	Proto string `json:"proto"`
	Addr  string `json:"addr"`
	Port  uint32 `json:"port"`
	PID   int32  `json:"pid,omitempty"`
	Proc  string `json:"proc,omitempty"`
}

func NewPorts(udp bool) *Ports {
	return &Ports{udp: udp, prev: map[string]port{}, names: map[int32]string{}}
}

func (p *Ports) Manifest() protocol.Manifest {
	return protocol.Manifest{
		ID: "ports", Name: "Listening Ports", Version: "1.0.0", Mode: "builtin", Schedule: "5s",
		Outputs: []protocol.Output{
			{Key: "listening", Type: "array", Desc: "ports bound to 0.0.0.0/::"},
			{Key: "count", Type: "number", Unit: protocol.UnitCount},
		},
	}
}

func (p *Ports) Invoke(context.Context, string, json.RawMessage) (any, error) {
	return nil, errUnsupported
}

func (p *Ports) Collect(ctx context.Context) (map[string]any, []sdk.Event, error) {
	current := map[string]port{}

	procs := []string{"tcp"}
	if p.udp {
		procs = append(procs, "udp")
	}
	for _, proto := range procs {
		conns, err := gnet.ConnectionsWithContext(ctx, proto)
		if err != nil {
			continue
		}
		for _, c := range conns {
			if proto == "tcp" && c.Status != "LISTEN" {
				continue
			}
			if !isWildcard(c.Laddr.IP) {
				continue
			}
			pp := port{Proto: proto, Addr: c.Laddr.IP, Port: c.Laddr.Port, PID: c.Pid}
			pp.Proc = p.name(c.Pid)
			current[pp.key()] = pp
		}
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	events := make([]sdk.Event, 0)
	if !p.seeded {
		p.seeded = true
		p.prev = current
	} else {
		for k, v := range current {
			if _, ok := p.prev[k]; !ok {
				events = append(events, sdk.Event{Subject: "port.open", Data: portData(v)})
			}
		}
		for k, v := range p.prev {
			if _, ok := current[k]; !ok {
				events = append(events, sdk.Event{Subject: "port.close", Data: portData(v)})
			}
		}
		p.prev = current
	}

	list := make([]port, 0, len(current))
	for _, v := range current {
		list = append(list, v)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Proto != list[j].Proto {
			return list[i].Proto < list[j].Proto
		}
		return list[i].Port < list[j].Port
	})

	return map[string]any{"listening": list, "count": len(list)}, events, nil
}

func (p *Ports) name(pid int32) string {
	if pid <= 0 {
		return ""
	}
	p.mu.Lock()
	if n, ok := p.names[pid]; ok {
		p.mu.Unlock()
		return n
	}
	p.mu.Unlock()
	name := ""
	if proc, err := process.NewProcess(pid); err == nil {
		if n, err := proc.Name(); err == nil {
			name = n
		}
	}
	p.mu.Lock()
	p.names[pid] = name
	p.mu.Unlock()
	return name
}

func (pp port) key() string {
	return fmt.Sprintf("%s/%s:%d/%d", pp.Proto, pp.Addr, pp.Port, pp.PID)
}

func portData(pp port) map[string]any {
	m := map[string]any{"proto": pp.Proto, "addr": pp.Addr, "port": pp.Port}
	if pp.PID > 0 {
		m["pid"] = pp.PID
	}
	if pp.Proc != "" {
		m["proc"] = pp.Proc
	}
	return m
}

func isWildcard(ip string) bool {
	return ip == "0.0.0.0" || ip == "::" || ip == "" || ip == "::0"
}
