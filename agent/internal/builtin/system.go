package builtin

import (
	"context"
	"encoding/json"
	"math"
	"sync"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/load"
	"github.com/shirou/gopsutil/v4/mem"
	gnet "github.com/shirou/gopsutil/v4/net"

	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

// System is the built-in system metrics plugin (cross-platform via gopsutil).
type System struct {
	mu      sync.Mutex
	prevNet map[string][2]uint64 // iface -> {rx,tx}
	prevTS  int64
}

func (s *System) Manifest() protocol.Manifest {
	return protocol.Manifest{
		ID: "system", Name: "System", Version: "1.0.0", Mode: "builtin", Schedule: "5s",
		Outputs: []protocol.Output{
			{Key: "cpu.total", Type: "number", Unit: protocol.UnitPercent},
			{Key: "cpu.cores", Type: "array", Unit: protocol.UnitPercent},
			{Key: "mem.used", Type: "number", Unit: protocol.UnitBytes},
			{Key: "mem.total", Type: "number", Unit: protocol.UnitBytes},
			{Key: "mem.usedPercent", Type: "number", Unit: protocol.UnitPercent},
			{Key: "swap.used", Type: "number", Unit: protocol.UnitBytes},
			{Key: "swap.total", Type: "number", Unit: protocol.UnitBytes},
			{Key: "disks", Type: "array"},
			{Key: "net", Type: "object"},
			{Key: "load.1", Type: "number"},
			{Key: "load.5", Type: "number"},
			{Key: "load.15", Type: "number"},
			{Key: "uptime", Type: "number", Unit: protocol.UnitSeconds},
		},
	}
}

func (s *System) Invoke(context.Context, string, json.RawMessage) (any, error) {
	return nil, errUnsupported
}

func (s *System) Collect(ctx context.Context) (map[string]any, []sdk.Event, error) {
	out := make(map[string]any)

	if cores, err := cpu.PercentWithContext(ctx, 0, true); err == nil && len(cores) > 0 {
		var sum float64
		rounded := make([]float64, len(cores))
		for i, c := range cores {
			rounded[i] = round2(c)
			sum += c
		}
		out["cpu.cores"] = rounded
		out["cpu.total"] = round2(sum / float64(len(cores)))
	}

	if vm, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		out["mem.used"] = vm.Used
		out["mem.total"] = vm.Total
		out["mem.usedPercent"] = round2(vm.UsedPercent)
	}
	if sw, err := mem.SwapMemoryWithContext(ctx); err == nil {
		out["swap.used"] = sw.Used
		out["swap.total"] = sw.Total
	}

	out["disks"] = s.disks(ctx)

	if l, err := load.AvgWithContext(ctx); err == nil {
		out["load.1"] = round2(l.Load1)
		out["load.5"] = round2(l.Load5)
		out["load.15"] = round2(l.Load15)
	}
	if up, err := host.UptimeWithContext(ctx); err == nil {
		out["uptime"] = up
	}

	s.net(ctx, out)
	return out, nil, nil
}

func (s *System) disks(ctx context.Context) []map[string]any {
	parts, err := disk.PartitionsWithContext(ctx, false)
	if err != nil {
		return nil
	}
	out := make([]map[string]any, 0, len(parts))
	for _, p := range parts {
		u, err := disk.UsageWithContext(ctx, p.Mountpoint)
		if err != nil {
			continue
		}
		out = append(out, map[string]any{
			"mount":       p.Mountpoint,
			"device":      p.Device,
			"fstype":      p.Fstype,
			"total":       u.Total,
			"used":        u.Used,
			"free":        u.Free,
			"usedPercent": round2(u.UsedPercent),
		})
	}
	return out
}

func (s *System) net(ctx context.Context, out map[string]any) {
	stats, err := gnet.IOCountersWithContext(ctx, true)
	if err != nil {
		return
	}
	now := time.Now().UnixMilli()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.prevNet == nil {
		s.prevNet = make(map[string][2]uint64)
	}
	elapsed := float64(now-s.prevTS) / 1000.0
	nets := make(map[string]any, len(stats))
	for _, st := range stats {
		rxRate, txRate := 0.0, 0.0
		if s.prevTS > 0 && elapsed > 0 {
			if prev, ok := s.prevNet[st.Name]; ok {
				if st.BytesRecv >= prev[0] {
					rxRate = float64(st.BytesRecv-prev[0]) / elapsed
				}
				if st.BytesSent >= prev[1] {
					txRate = float64(st.BytesSent-prev[1]) / elapsed
				}
			}
		}
		nets[st.Name] = map[string]any{
			"rxBytes":  st.BytesRecv,
			"txBytes":  st.BytesSent,
			"rxRate":   round2(rxRate),
			"txRate":   round2(txRate),
			"rxErrors": st.Errin,
			"txErrors": st.Errout,
		}
		s.prevNet[st.Name] = [2]uint64{st.BytesRecv, st.BytesSent}
	}
	s.prevTS = now
	out["net"] = nets
}

func round2(f float64) float64 {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0
	}
	return math.Round(f*100) / 100
}
