// Package platform holds the infrastructure every feature package shares:
// configuration, database access and migrations, HTTP routing and errors,
// secret sealing, audit logging and metrics.
package platform

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is read from ENUMARACLE_* environment variables.
type Config struct {
	HTTPAddr      string        // ENUMARACLE_HTTP_ADDR, default ":8080"
	DNSAddr       string        // ENUMARACLE_DNS_ADDR, default ":5353" (UDP+TCP); empty disables
	DBDriver      string        // ENUMARACLE_DB_DRIVER: sqlite|postgres, default sqlite
	DBDSN         string        // ENUMARACLE_DB_DSN, default "file:enumaracle.db"
	MasterKey     []byte        // ENUMARACLE_MASTER_KEY: base64 of 32 bytes (AES-256). Dev: random per process.
	PublicBaseURL string        // ENUMARACLE_PUBLIC_BASE_URL, default "http://localhost:8080" (x5u URLs)
	ENUMZone      string        // ENUMARACLE_ENUM_ZONE, default "e164.enumaracle.local."
	SIPDomain     string        // ENUMARACLE_SIP_DOMAIN, default "sip.operator.example"
	SPC           string        // ENUMARACLE_SPC: operator Service Provider Code, default "1001"
	OperatorName  string        // ENUMARACLE_OPERATOR_NAME, default "Demo Operatör"
	AdminEmail    string        // ENUMARACLE_ADMIN_EMAIL: bootstrap operator admin, default "admin@enumaracle.local"
	AdminPassword string        // ENUMARACLE_ADMIN_PASSWORD: if empty a random one is generated and logged once
	CookieSecure  bool          // ENUMARACLE_COOKIE_SECURE, default false (true behind HTTPS)
	DemoData      bool          // ENUMARACLE_DEMO_DATA: seed demo entities/numbers/events at startup
	LogLevel      string        // ENUMARACLE_LOG_LEVEL: debug|info|warn|error
	ScoreInterval time.Duration // ENUMARACLE_SCORE_INTERVAL, default 1m
	LookupTTL     time.Duration // ENUMARACLE_LOOKUP_TTL, default 5s (cache + DNS TTL)
	DevMode       bool          // true when MasterKey was generated (not persisted)
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

// LoadConfig reads the environment. It fails only on malformed values.
func LoadConfig() (Config, error) {
	c := Config{
		HTTPAddr:      env("ENUMARACLE_HTTP_ADDR", ":8080"),
		DNSAddr:       env("ENUMARACLE_DNS_ADDR", ":5353"),
		DBDriver:      env("ENUMARACLE_DB_DRIVER", "sqlite"),
		DBDSN:         env("ENUMARACLE_DB_DSN", "file:enumaracle.db"),
		PublicBaseURL: strings.TrimRight(env("ENUMARACLE_PUBLIC_BASE_URL", "http://localhost:8080"), "/"),
		ENUMZone:      env("ENUMARACLE_ENUM_ZONE", "e164.enumaracle.local."),
		SIPDomain:     env("ENUMARACLE_SIP_DOMAIN", "sip.operator.example"),
		SPC:           env("ENUMARACLE_SPC", "1001"),
		OperatorName:  env("ENUMARACLE_OPERATOR_NAME", "Demo Operatör"),
		AdminEmail:    env("ENUMARACLE_ADMIN_EMAIL", "admin@enumaracle.local"),
		AdminPassword: os.Getenv("ENUMARACLE_ADMIN_PASSWORD"),
		LogLevel:      env("ENUMARACLE_LOG_LEVEL", "info"),
	}
	if os.Getenv("ENUMARACLE_DNS_ADDR") == "-" {
		c.DNSAddr = ""
	}
	if !strings.HasSuffix(c.ENUMZone, ".") {
		c.ENUMZone += "."
	}
	var err error
	if c.CookieSecure, err = strconv.ParseBool(env("ENUMARACLE_COOKIE_SECURE", "false")); err != nil {
		return c, fmt.Errorf("ENUMARACLE_COOKIE_SECURE: %w", err)
	}
	if c.DemoData, err = strconv.ParseBool(env("ENUMARACLE_DEMO_DATA", "false")); err != nil {
		return c, fmt.Errorf("ENUMARACLE_DEMO_DATA: %w", err)
	}
	if c.ScoreInterval, err = time.ParseDuration(env("ENUMARACLE_SCORE_INTERVAL", "1m")); err != nil {
		return c, fmt.Errorf("ENUMARACLE_SCORE_INTERVAL: %w", err)
	}
	if c.LookupTTL, err = time.ParseDuration(env("ENUMARACLE_LOOKUP_TTL", "5s")); err != nil {
		return c, fmt.Errorf("ENUMARACLE_LOOKUP_TTL: %w", err)
	}
	switch c.DBDriver {
	case "sqlite", "postgres":
	default:
		return c, fmt.Errorf("ENUMARACLE_DB_DRIVER must be sqlite or postgres, got %q", c.DBDriver)
	}
	if k := os.Getenv("ENUMARACLE_MASTER_KEY"); k != "" {
		c.MasterKey, err = base64.StdEncoding.DecodeString(k)
		if err != nil || len(c.MasterKey) != 32 {
			return c, fmt.Errorf("ENUMARACLE_MASTER_KEY must be base64 of exactly 32 bytes")
		}
	} else {
		c.MasterKey = make([]byte, 32)
		_, _ = rand.Read(c.MasterKey)
		c.DevMode = true
	}
	return c, nil
}

// TestConfig returns a config suitable for unit tests (in-memory DB, fixed key).
func TestConfig() Config {
	return Config{
		HTTPAddr: "127.0.0.1:0", DBDriver: "sqlite", DBDSN: ":memory:",
		MasterKey: make([]byte, 32), PublicBaseURL: "http://test.local",
		ENUMZone: "e164.test.", SIPDomain: "sip.test", SPC: "1001", OperatorName: "Test Operatör",
		AdminEmail: "admin@test.local", AdminPassword: "Admin-Pass-123", LogLevel: "error",
		ScoreInterval: time.Minute, LookupTTL: 0,
	}
}

// NewLogger returns a JSON slog logger at the configured level.
func NewLogger(level string) *slog.Logger {
	var l slog.Level
	_ = l.UnmarshalText([]byte(level))
	return slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: l}))
}
