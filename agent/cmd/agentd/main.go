// Command agentd is the OpalNavDeck monitoring agent: a generic plugin host with
// an HTTP API (data + control) and plugin supervision.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/opalnavdeck/agent/internal/api"
	"github.com/opalnavdeck/agent/internal/builtin"
	"github.com/opalnavdeck/agent/internal/config"
	"github.com/opalnavdeck/agent/internal/events"
	agenthost "github.com/opalnavdeck/agent/internal/host"
	"github.com/opalnavdeck/agent/internal/registry"
)

var version = "0.1.0"

func main() {
	cfgPath := flag.String("config", "", "path to config JSON")
	listen := flag.String("listen", "", "override listen address")
	token := flag.String("token", "", "override API token")
	regToken := flag.String("register-token", "", "external-plugin register token (defaults to API token)")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	if *listen != "" {
		cfg.Listen = *listen
	}
	if *token != "" {
		cfg.Token = *token
	}
	if cfg.Token == "" {
		log.Fatal("token is required: set config.token or pass -token")
	}
	rt := *regToken
	if rt == "" {
		rt = cfg.Token
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	ring := events.New(256)
	reg := registry.New(ring, version)

	if cfg.System {
		reg.Register(&builtin.System{}, true)
	}
	if cfg.Ports {
		reg.Register(builtin.NewPorts(cfg.PortsUDP), true)
	}

	hostMgr := agenthost.New(ctx, cfg.PluginsDir, reg, log.Default(), rt)
	if cfg.IPC != "" {
		if err := hostMgr.StartExternal(cfg.IPC); err != nil {
			log.Printf("external listener: %v", err)
		}
	}
	for _, man := range cfg.Plugins {
		if err := hostMgr.Install(man); err != nil {
			log.Printf("preload plugin %s: %v", man.ID, err)
		}
	}

	srv := api.New(cfg, reg, hostMgr, ring, version)
	httpSrv := &http.Server{Addr: cfg.Listen, Handler: srv.Handler()}

	go func() {
		log.Printf("opalnavdeck-agent %s listening on %s (plugins=%d)", version, cfg.Listen, len(reg.List()))
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("shutting down")
	hostMgr.Stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)
}
