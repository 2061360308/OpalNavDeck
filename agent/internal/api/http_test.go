package api_test

import (
	"context"
	"encoding/json"
	"log"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/opalnavdeck/agent/internal/api"
	"github.com/opalnavdeck/agent/internal/config"
	"github.com/opalnavdeck/agent/internal/events"
	agenthost "github.com/opalnavdeck/agent/internal/host"
	"github.com/opalnavdeck/agent/internal/registry"
	"github.com/opalnavdeck/agent/pkg/protocol"
	"github.com/opalnavdeck/agent/pkg/sdk"
)

type fake struct{}

func (fake) Manifest() protocol.Manifest {
	return protocol.Manifest{
		ID: "fake", Name: "Fake", Version: "1.0.0", Mode: "builtin", Schedule: "1s",
		Outputs: []protocol.Output{{Key: "n", Type: "number"}},
	}
}
func (fake) Collect(context.Context) (map[string]any, []sdk.Event, error) {
	return map[string]any{"n": 42}, nil, nil
}
func (fake) Invoke(context.Context, string, json.RawMessage) (any, error) { return nil, nil }

func TestAPI(t *testing.T) {
	cfg := &config.Config{Token: "t", Name: "test", PluginsDir: t.TempDir()}
	ring := events.New(16)
	reg := registry.New(ring, "test")
	reg.Register(fake{}, true)
	host := agenthost.New(context.Background(), cfg.PluginsDir, reg, log.New(os.Stderr, "", 0), "t")
	srv := api.New(cfg, reg, host, ring, "test")
	h := srv.Handler()

	// unauthenticated /v1 is rejected
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/v1/info", nil))
	if rec.Code != 401 {
		t.Fatalf("want 401, got %d", rec.Code)
	}

	// healthz is public
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/healthz", nil))
	if rec.Code != 200 {
		t.Fatalf("healthz: want 200, got %d", rec.Code)
	}

	// wait for the first scheduled collect
	time.Sleep(150 * time.Millisecond)

	// metrics with auth
	rec = httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/v1/metrics", nil)
	req.Header.Set("Authorization", "Bearer t")
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("metrics: want 200, got %d", rec.Code)
	}
	var m protocol.Metrics
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("decode metrics: %v", err)
	}
	if m.Plugins["fake"]["n"] == nil {
		t.Fatalf("missing fake metric: %s", rec.Body.String())
	}

	// ETag -> 304
	etag := rec.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/v1/metrics", nil)
	req.Header.Set("Authorization", "Bearer t")
	req.Header.Set("If-None-Match", etag)
	h.ServeHTTP(rec, req)
	if rec.Code != 304 {
		t.Fatalf("etag: want 304, got %d", rec.Code)
	}
}
