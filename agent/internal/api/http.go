// Package api exposes the agent HTTP API (data plane + control plane).
package api

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"runtime"
	"strconv"
	"strings"

	ghost "github.com/shirou/gopsutil/v4/host"

	"github.com/opalnavdeck/agent/internal/config"
	"github.com/opalnavdeck/agent/internal/events"
	agenthost "github.com/opalnavdeck/agent/internal/host"
	"github.com/opalnavdeck/agent/internal/registry"
	"github.com/opalnavdeck/agent/pkg/protocol"
)

// Server serves the HTTP API.
type Server struct {
	cfg     *config.Config
	reg     *registry.Registry
	host    *agenthost.Manager
	ring    *events.Ring
	version string
}

// New creates a Server.
func New(cfg *config.Config, reg *registry.Registry, hostMgr *agenthost.Manager, ring *events.Ring, version string) *Server {
	return &Server{cfg: cfg, reg: reg, host: hostMgr, ring: ring, version: version}
}

// Handler builds the HTTP routes.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("GET /v1/info", s.auth(s.info))
	mux.HandleFunc("GET /v1/metrics", s.auth(s.metrics))
	mux.HandleFunc("GET /v1/events", s.auth(s.eventsGet))
	mux.HandleFunc("GET /v1/plugins", s.auth(s.pluginsList))
	mux.HandleFunc("POST /v1/plugins", s.auth(s.pluginsInstall))
	mux.HandleFunc("POST /v1/plugins/{id}/enable", s.auth(s.pluginEnable))
	mux.HandleFunc("POST /v1/plugins/{id}/disable", s.auth(s.pluginDisable))
	mux.HandleFunc("DELETE /v1/plugins/{id}", s.auth(s.pluginDelete))
	return mux
}

func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := bearer(r)
		if s.cfg.Token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(s.cfg.Token)) != 1 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (s *Server) info(w http.ResponseWriter, r *http.Request) {
	info := protocol.Info{
		V:       protocol.Proto,
		Name:    s.cfg.Name,
		OS:      runtime.GOOS,
		Arch:    runtime.GOARCH,
		Agent:   s.version,
		Proto:   protocol.Proto,
		Plugins: s.reg.List(),
	}
	if hi, err := ghost.InfoWithContext(r.Context()); err == nil {
		info.Kernel = hi.KernelVersion
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) metrics(w http.ResponseWriter, r *http.Request) {
	m := s.reg.Metrics()
	body, err := json.Marshal(m)
	if err != nil {
		http.Error(w, `{"error":"encode"}`, http.StatusInternalServerError)
		return
	}
	sum := sha256.Sum256(body)
	etag := `"` + hex.EncodeToString(sum[:16]) + `"`
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("ETag", etag)
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(body)
}

func (s *Server) eventsGet(w http.ResponseWriter, r *http.Request) {
	var since int64
	if v := r.URL.Query().Get("since"); v != "" {
		since, _ = strconv.ParseInt(v, 10, 64)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"v":      protocol.Proto,
		"lastId": s.ring.LastID(),
		"events": s.ring.Since(since),
	})
}

func (s *Server) pluginsList(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"plugins": s.reg.List()})
}

func (s *Server) pluginsInstall(w http.ResponseWriter, r *http.Request) {
	var man protocol.Manifest
	if err := json.NewDecoder(r.Body).Decode(&man); err != nil {
		http.Error(w, `{"error":"bad manifest"}`, http.StatusBadRequest)
		return
	}
	if err := s.host.Install(man); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": man.ID})
}

func (s *Server) pluginEnable(w http.ResponseWriter, r *http.Request) {
	s.toggle(w, r, true)
}

func (s *Server) pluginDisable(w http.ResponseWriter, r *http.Request) {
	s.toggle(w, r, false)
}

func (s *Server) toggle(w http.ResponseWriter, r *http.Request, on bool) {
	id := r.PathValue("id")
	if err := s.reg.SetEnabled(id, on); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "enabled": on})
}

func (s *Server) pluginDelete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.reg.Remove(id); err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return h[7:]
	}
	return ""
}
