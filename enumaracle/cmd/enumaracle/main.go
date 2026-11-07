// Command enumaracle runs the whole platform in one process: REST API,
// portal, ENUM DNS server and background jobs.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/auth"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/disputes"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/enumdns"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/notify"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/pki"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/portal"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/registry"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/reputation"
)

var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	migrateOnly := flag.Bool("migrate-only", false, "apply database migrations and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("enumaracle", version)
		return
	}
	cfg, err := platform.LoadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(2)
	}
	log := platform.NewLogger(cfg.LogLevel)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, log, *migrateOnly); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

// Migrations of every package, in no particular order (the runner sorts by file name).
func migrations() []fs.FS {
	return []fs.FS{registry.Migrations, pki.Migrations, reputation.Migrations,
		disputes.Migrations, notify.Migrations, auth.Migrations}
}

// App is the wired application; exported pieces are used by the smoke test.
type App struct {
	Handler    http.Handler
	Deps       platform.Deps
	Auth       *auth.Service
	Registry   *registry.Service
	Reputation *reputation.Service
	PKI        *pki.Service
	DNS        *enumdns.Service
	starters   []func(context.Context) error
}

// Build wires every package over an open database.
func Build(ctx context.Context, d platform.Deps) (*App, error) {
	if d.Metrics == nil {
		d.Metrics = prometheus.NewRegistry()
	}
	router := platform.NewRouter(d.Log, d.Metrics)

	notifySvc, err := notify.New(notify.Deps{Base: d})
	if err != nil {
		return nil, fmt.Errorf("notify: %w", err)
	}
	authSvc, err := auth.New(auth.Deps{Base: d})
	if err != nil {
		return nil, fmt.Errorf("auth: %w", err)
	}
	router.SetAuthenticator(authSvc)
	if err := authSvc.Bootstrap(ctx); err != nil {
		return nil, fmt.Errorf("auth bootstrap: %w", err)
	}
	regSvc, err := registry.New(registry.Deps{Base: d, Notifier: notifySvc, Accounts: authSvc})
	if err != nil {
		return nil, fmt.Errorf("registry: %w", err)
	}
	repSvc, err := reputation.New(reputation.Deps{Base: d, Notifier: notifySvc, Directory: regSvc})
	if err != nil {
		return nil, fmt.Errorf("reputation: %w", err)
	}
	regSvc.SetReputation(repSvc)
	notifySvc.SetEmails(func(ctx context.Context, entityID string) (string, error) {
		e, err := regSvc.GetEntity(ctx, entityID)
		return e.ContactEmail, err
	})
	pkiSvc, err := pki.New(pki.Deps{Base: d, Directory: regSvc, Lookup: regSvc, Notifier: notifySvc})
	if err != nil {
		return nil, fmt.Errorf("pki: %w", err)
	}
	if err := pkiSvc.Init(ctx); err != nil {
		return nil, fmt.Errorf("pki init: %w", err)
	}
	dispSvc, err := disputes.New(disputes.Deps{Base: d, Notifier: notifySvc, Directory: regSvc, Reputation: repSvc})
	if err != nil {
		return nil, fmt.Errorf("disputes: %w", err)
	}
	dnsSvc, err := enumdns.New(enumdns.Deps{Base: d, Lookup: regSvc})
	if err != nil {
		return nil, fmt.Errorf("enumdns: %w", err)
	}

	authSvc.Mount(router)
	regSvc.Mount(router)
	repSvc.Mount(router)
	pkiSvc.Mount(router)
	dispSvc.Mount(router)
	notifySvc.Mount(router)

	router.HandleRaw("GET /metrics", promhttp.HandlerFor(d.Metrics, promhttp.HandlerOpts{}))
	router.HandleRaw("GET /healthz", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok\n"))
	}))
	router.HandleRaw("GET /readyz", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := d.DB.SQL.PingContext(r.Context()); err != nil {
			http.Error(w, "db unavailable", http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte("ready\n"))
	}))
	router.HandleRaw("GET /app/", portal.Handler())
	router.HandleRaw("GET /{$}", http.RedirectHandler("/app/", http.StatusFound))

	if d.Cfg.DemoData {
		if err := regSvc.SeedDemo(ctx); err != nil {
			return nil, fmt.Errorf("registry demo seed: %w", err)
		}
		if err := repSvc.SeedDemo(ctx); err != nil {
			return nil, fmt.Errorf("reputation demo seed: %w", err)
		}
	}
	return &App{
		Handler: router, Deps: d, Auth: authSvc, Registry: regSvc, Reputation: repSvc, PKI: pkiSvc, DNS: dnsSvc,
		starters: []func(context.Context) error{notifySvc.Start, authSvc.Start, regSvc.Start, repSvc.Start,
			pkiSvc.Start, dispSvc.Start},
	}, nil
}

func run(ctx context.Context, cfg platform.Config, log *slog.Logger, migrateOnly bool) error {
	if cfg.DevMode {
		log.Warn("ENUMARACLE_MASTER_KEY is not set: a random key is used, sealed private keys and webhook secrets will be unreadable after restart. Set it in production.")
	}
	db, err := platform.OpenDB(ctx, cfg.DBDriver, cfg.DBDSN)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer db.Close()
	if err := db.Migrate(ctx, migrations()...); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	if migrateOnly {
		log.Info("migrations applied")
		return nil
	}
	sealer, err := platform.NewSealer(cfg.MasterKey)
	if err != nil {
		return err
	}
	reg := prometheus.NewRegistry()
	reg.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	d := platform.Deps{DB: db, Log: log, Cfg: cfg, Sealer: sealer, Metrics: reg, Clock: core.SystemClock}
	app, err := Build(ctx, d)
	if err != nil {
		return err
	}

	bg, cancel := context.WithCancel(ctx)
	defer cancel()
	var wg sync.WaitGroup
	starters := app.starters
	if cfg.DNSAddr != "" {
		starters = append(starters, app.DNS.Start)
	}
	for _, start := range starters {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := start(bg); err != nil && !errors.Is(err, context.Canceled) {
				log.Error("background job stopped", "err", err)
			}
		}()
	}

	srv := &http.Server{
		Addr: cfg.HTTPAddr, Handler: app.Handler,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second,
		WriteTimeout: 60 * time.Second, IdleTimeout: 120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("enumaracle started", "version", version, "http", cfg.HTTPAddr, "dns", cfg.DNSAddr,
			"db", cfg.DBDriver, "zone", cfg.ENUMZone, "portal", cfg.PublicBaseURL+"/app/")
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 15*time.Second)
	defer c2()
	_ = srv.Shutdown(shutdownCtx)
	cancel()
	wg.Wait()
	return nil
}
