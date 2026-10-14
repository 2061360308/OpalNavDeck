// Package config loads the agent configuration (JSON).
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/opalnavdeck/agent/pkg/protocol"
)

// Config is the agent configuration.
type Config struct {
	Name       string              `json:"name"`
	Listen     string              `json:"listen"`      // HTTP listen address, e.g. ":9797"
	Token      string              `json:"token"`       // bearer token for all endpoints
	BaseDir    string              `json:"base_dir"`    // state dir (plugins, sockets)
	PluginsDir string              `json:"plugins_dir"` // installed plugin binaries
	IPC        string              `json:"ipc"`         // external-registration endpoint: "unix:/path" | "tcp:127.0.0.1:9798" | "" (off)
	System     bool                `json:"system"`      // enable the built-in "system" plugin
	Ports      bool                `json:"ports"`       // enable the built-in "ports" plugin
	PortsUDP   bool                `json:"ports_udp"`   // include UDP listeners (default off)
	Plugins    []protocol.Manifest `json:"plugins"`     // manifests to preload (managed/external)
}

func defaultBaseDir() string {
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "opalnavdeck-agent")
}

// Default returns a config with sane defaults for the current OS.
func Default() *Config {
	base := defaultBaseDir()
	ipc := "unix:" + filepath.Join(base, "agent.sock")
	if runtime.GOOS == "windows" {
		ipc = "tcp:127.0.0.1:9798"
	}
	return &Config{
		Name:       hostname(),
		Listen:     ":9797",
		BaseDir:    base,
		PluginsDir: filepath.Join(base, "plugins"),
		IPC:        ipc,
		System:     true,
		Ports:      true,
		PortsUDP:   false,
	}
}

func hostname() string {
	h, err := os.Hostname()
	if err != nil || h == "" {
		return "agent"
	}
	return h
}

// Load reads a JSON config file; missing fields fall back to defaults.
func Load(path string) (*Config, error) {
	cfg := Default()
	if path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read config: %w", err)
		}
		if err := json.Unmarshal(raw, cfg); err != nil {
			return nil, fmt.Errorf("parse config: %w", err)
		}
	}
	if cfg.PluginsDir == "" {
		cfg.PluginsDir = filepath.Join(cfg.BaseDir, "plugins")
	}
	if err := os.MkdirAll(cfg.PluginsDir, 0o755); err != nil {
		return nil, fmt.Errorf("create plugins dir: %w", err)
	}
	if err := os.MkdirAll(cfg.BaseDir, 0o755); err != nil {
		return nil, fmt.Errorf("create base dir: %w", err)
	}
	return cfg, nil
}
