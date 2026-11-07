// Package notify publishes domain events (core.Notifier) to signed webhooks and
// to an email outbox. Notify only inserts rows; the worker started by Start
// delivers webhooks with retries and backoff.
package notify

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Migrations holds the notify schema (0600_notify.sql).
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Deps are the dependencies of the notify service.
type Deps struct {
	Base platform.Deps
}

// Owner kinds of a webhook.
const (
	OwnerOperator = "operator"
	OwnerEntity   = "entity"
)

// Delivery statuses. "failed" means the last attempt failed and a retry is
// scheduled at next_at; "dead" means no further attempts will be made.
const (
	StatusPending   = "pending"
	StatusDelivered = "delivered"
	StatusFailed    = "failed"
	StatusDead      = "dead"
)

// Backoff is the wait after failed attempt n (1-based) before attempt n+1.
// After the last entry is used and the next attempt fails, the delivery is dead,
// so a delivery is attempted at most len(Backoff)+1 times.
var Backoff = []time.Duration{time.Minute, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour, 6 * time.Hour}

// MaxAttempts is the number of delivery attempts before a delivery is dead.
var MaxAttempts = len(Backoff) + 1

// EventTypes are the event types a webhook may filter on.
var EventTypes = []string{
	core.EventEntityStatusChanged, core.EventNumberStatusChanged, core.EventBrandingReviewed,
	core.EventReputationLabel, core.EventDisputeCreated, core.EventDisputeUpdated, core.EventCertificateIssued,
}

// Webhook is a subscription. The secret is never part of it.
type Webhook struct {
	ID        string    `json:"id"`
	OwnerKind string    `json:"owner_kind"` // operator|entity
	EntityID  string    `json:"entity_id,omitempty"`
	URL       string    `json:"url"`
	Events    []string  `json:"events"` // empty = all events
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Delivery is one event queued for one webhook.
type Delivery struct {
	ID          string     `json:"id"`
	WebhookID   string     `json:"webhook_id"`
	EventID     string     `json:"event_id"`
	EventType   string     `json:"event_type"`
	Status      string     `json:"status"`
	Attempt     int        `json:"attempt"`
	NextAt      *time.Time `json:"next_at,omitempty"`
	LastCode    int        `json:"last_code"`
	LastError   string     `json:"last_error,omitempty"`
	DeliveredAt *time.Time `json:"delivered_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// OutboxEmail is one queued email.
type OutboxEmail struct {
	ID        string    `json:"id"`
	To        string    `json:"to"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
}

// EmailLookup returns the contact email of an entity.
type EmailLookup func(ctx context.Context, entityID string) (string, error)

// Service implements core.Notifier, the notify HTTP routes and the delivery worker.
type Service struct {
	base   platform.Deps
	log    *slog.Logger
	client *http.Client

	mu     sync.RWMutex
	emails EmailLookup

	deliverMu sync.Mutex
	wake      chan struct{}

	results *prometheus.CounterVec
}

var _ core.Notifier = (*Service)(nil)

// New builds the service and registers its metrics on Base.Metrics.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, errors.New("notify: Base.DB is required")
	}
	if d.Base.Sealer == nil {
		return nil, errors.New("notify: Base.Sealer is required")
	}
	log := d.Base.Log
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	s := &Service{base: d.Base, log: log, client: newSafeClient(), wake: make(chan struct{}, 1)}
	s.results = register(d.Base.Metrics, prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "enumaracle_webhook_deliveries_total",
		Help: "Webhook delivery attempts by result (delivered, failed, dead).",
	}, []string{"result"}))
	return s, nil
}

func register[T prometheus.Collector](reg *prometheus.Registry, c T) T {
	if reg == nil {
		return c
	}
	if err := reg.Register(c); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errors.As(err, &are) {
			if existing, ok := are.ExistingCollector.(T); ok {
				return existing
			}
		}
	}
	return c
}

// SetEmails installs the entity contact email lookup used for outbox rows.
// nil disables emails.
func (s *Service) SetEmails(f func(ctx context.Context, entityID string) (string, error)) {
	s.mu.Lock()
	s.emails = f
	s.mu.Unlock()
}

func (s *Service) now() time.Time { return s.base.Now() }

// Notify queues e for every matching active webhook and, for entity events,
// writes an email outbox row to the entity contact. It performs no network I/O.
// Entity webhooks receive events whose EntityID equals their entity; operator
// webhooks receive every event; an empty event filter matches every type.
//
// Callers must not hold an open transaction on the same SQLite database when
// calling Notify (SQLite uses a single connection); call it after commit.
func (s *Service) Notify(ctx context.Context, e core.Event) error {
	if e.Type == "" {
		return core.Invalid("type", "olay türü boş")
	}
	now := s.now()
	if e.ID == "" {
		e.ID = core.NewID()
	}
	if e.At.IsZero() {
		e.At = now
	}
	payload, err := json.Marshal(e)
	if err != nil {
		return fmt.Errorf("notify: marshal event: %w", err)
	}

	var to string
	s.mu.RLock()
	emails := s.emails
	s.mu.RUnlock()
	if emails != nil && e.EntityID != "" {
		addr, err := emails(ctx, e.EntityID)
		if err != nil {
			s.log.Warn("notify: entity email lookup failed", "entity_id", e.EntityID, "err", err)
		}
		to = addr
	}

	hooks, err := s.matching(ctx, e)
	if err != nil {
		return err
	}
	if len(hooks) == 0 && to == "" {
		return nil
	}
	err = s.base.DB.InTx(ctx, func(tx *platform.Tx) error {
		for _, id := range hooks {
			if _, err := tx.ExecContext(ctx, `INSERT INTO notify_deliveries
				(id, webhook_id, event_id, event_type, payload, status, attempt, next_at, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
				core.NewID(), id, e.ID, e.Type, string(payload), StatusPending, platform.TS(now),
				platform.TS(now), platform.TS(now)); err != nil {
				return err
			}
		}
		if to != "" {
			subject, body := renderEmail(e, s.base.Cfg.OperatorName)
			if _, err := tx.ExecContext(ctx, `INSERT INTO notify_email_outbox
				(id, entity_id, event_id, event_type, to_addr, subject, body, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				core.NewID(), e.EntityID, e.ID, e.Type, to, subject, body, platform.TS(now)); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("notify: queue event %s: %w", e.Type, err)
	}
	if len(hooks) > 0 {
		select {
		case s.wake <- struct{}{}:
		default:
		}
	}
	return nil
}

// matching returns the ids of active webhooks that subscribe to e.
func (s *Service) matching(ctx context.Context, e core.Event) ([]string, error) {
	rows, err := s.base.DB.QueryContext(ctx, `SELECT id, events FROM notify_webhooks
		WHERE active = 1 AND deleted_at = ''
		AND (owner_kind = ? OR (owner_kind = ? AND entity_id <> '' AND entity_id = ?))`,
		OwnerOperator, OwnerEntity, e.EntityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id, evs string
		if err := rows.Scan(&id, &evs); err != nil {
			return nil, err
		}
		var filter []string
		_ = json.Unmarshal([]byte(evs), &filter)
		if len(filter) == 0 || slices.Contains(filter, e.Type) {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}

// ---------------------------------------------------------------- store

const webhookCols = `id, owner_kind, entity_id, url, events, active, created_at, updated_at`

func scanWebhook(sc interface{ Scan(...any) error }) (Webhook, error) {
	var w Webhook
	var evs, created, updated string
	var active int
	if err := sc.Scan(&w.ID, &w.OwnerKind, &w.EntityID, &w.URL, &evs, &active, &created, &updated); err != nil {
		return w, err
	}
	w.Events = []string{}
	_ = json.Unmarshal([]byte(evs), &w.Events)
	w.Active = active == 1
	w.CreatedAt, w.UpdatedAt = platform.ParseTS(created), platform.ParseTS(updated)
	return w, nil
}

// ListWebhooks lists non-deleted webhooks. ownerKind "" lists all owners;
// for OwnerEntity only those of entityID are listed.
func (s *Service) ListWebhooks(ctx context.Context, ownerKind, entityID string) ([]Webhook, error) {
	q := `SELECT ` + webhookCols + ` FROM notify_webhooks WHERE deleted_at = ''`
	var args []any
	if ownerKind != "" {
		q += ` AND owner_kind = ? AND entity_id = ?`
		args = append(args, ownerKind, entityID)
	}
	q += ` ORDER BY created_at DESC`
	rows, err := s.base.DB.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Webhook{}
	for rows.Next() {
		w, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// GetWebhook returns a non-deleted webhook. A non-empty entityID restricts the
// lookup to that entity's webhooks (others are reported as not found).
func (s *Service) GetWebhook(ctx context.Context, id, entityID string) (Webhook, error) {
	q := `SELECT ` + webhookCols + ` FROM notify_webhooks WHERE id = ? AND deleted_at = ''`
	args := []any{id}
	if entityID != "" {
		q += ` AND owner_kind = ? AND entity_id = ?`
		args = append(args, OwnerEntity, entityID)
	}
	w, err := scanWebhook(s.base.DB.QueryRowContext(ctx, q, args...))
	if err != nil {
		return w, platform.NotFound(err, "webhook "+id)
	}
	return w, nil
}

// CreateWebhook validates and stores a webhook and returns it with its secret.
// The secret is shown only here; it is stored sealed (AAD = webhook id).
func (s *Service) CreateWebhook(ctx context.Context, ownerKind, entityID, rawURL string, events []string) (Webhook, string, error) {
	if ownerKind == OwnerEntity && entityID == "" {
		return Webhook{}, "", core.Errorf(core.ErrForbidden, "firma kimliği gerekli")
	}
	if ownerKind == OwnerOperator {
		entityID = ""
	}
	v := &core.ValidationError{}
	u, msg := validateURL(rawURL)
	if msg != "" {
		v.Add("url", msg)
	}
	evs, msg := normalizeEvents(events)
	if msg != "" {
		v.Add("events", msg)
	}
	if err := v.Err(); err != nil {
		return Webhook{}, "", err
	}
	secret, err := newSecret()
	if err != nil {
		return Webhook{}, "", err
	}
	now := s.now()
	w := Webhook{ID: core.NewID(), OwnerKind: ownerKind, EntityID: entityID, URL: u, Events: evs,
		Active: true, CreatedAt: now, UpdatedAt: now}
	sealed, err := s.base.Sealer.Seal([]byte(secret), w.ID)
	if err != nil {
		return Webhook{}, "", err
	}
	evJSON, _ := json.Marshal(evs)
	err = s.base.DB.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO notify_webhooks
			(id, owner_kind, entity_id, url, secret_sealed, events, active, created_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
			w.ID, w.OwnerKind, w.EntityID, w.URL, base64.StdEncoding.EncodeToString(sealed), string(evJSON),
			core.PrincipalFrom(ctx).ID, platform.TS(now), platform.TS(now)); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "webhook.create", "webhook", w.ID,
			map[string]any{"owner_kind": w.OwnerKind, "entity_id": w.EntityID, "url": w.URL, "events": w.Events})
	})
	if err != nil {
		return Webhook{}, "", err
	}
	return w, secret, nil
}

// DeleteWebhook deletes a webhook (soft delete; delivery history is kept) and
// marks its undelivered deliveries dead. A non-empty entityID restricts the
// deletion to that entity's webhooks.
func (s *Service) DeleteWebhook(ctx context.Context, id, entityID string) error {
	w, err := s.GetWebhook(ctx, id, entityID)
	if err != nil {
		return err
	}
	now := platform.TS(s.now())
	return s.base.DB.InTx(ctx, func(tx *platform.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE notify_webhooks SET active = 0, deleted_at = ?, updated_at = ? WHERE id = ?`,
			now, now, w.ID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE notify_deliveries SET status = ?, next_at = '', last_error = ?, updated_at = ?
			WHERE webhook_id = ? AND status IN (?, ?)`,
			StatusDead, "webhook silindi", now, w.ID, StatusPending, StatusFailed); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "webhook.delete", "webhook", w.ID,
			map[string]any{"owner_kind": w.OwnerKind, "entity_id": w.EntityID, "url": w.URL})
	})
}

// ListDeliveries lists the newest deliveries of a webhook.
func (s *Service) ListDeliveries(ctx context.Context, webhookID string, limit int) ([]Delivery, error) {
	rows, err := s.base.DB.QueryContext(ctx, `SELECT id, webhook_id, event_id, event_type, status, attempt, next_at,
		last_code, last_error, delivered_at, created_at, updated_at FROM notify_deliveries
		WHERE webhook_id = ? ORDER BY created_at DESC, id LIMIT ?`, webhookID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Delivery{}
	for rows.Next() {
		var d Delivery
		var next, delivered, created, updated string
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.EventID, &d.EventType, &d.Status, &d.Attempt, &next,
			&d.LastCode, &d.LastError, &delivered, &created, &updated); err != nil {
			return nil, err
		}
		d.NextAt, d.DeliveredAt = platform.ParseTSPtr(next), platform.ParseTSPtr(delivered)
		d.CreatedAt, d.UpdatedAt = platform.ParseTS(created), platform.ParseTS(updated)
		out = append(out, d)
	}
	return out, rows.Err()
}

// ListOutbox lists the newest email outbox rows.
func (s *Service) ListOutbox(ctx context.Context, limit int) ([]OutboxEmail, error) {
	rows, err := s.base.DB.QueryContext(ctx, `SELECT id, to_addr, subject, body, created_at FROM notify_email_outbox
		ORDER BY created_at DESC, id LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OutboxEmail{}
	for rows.Next() {
		var m OutboxEmail
		var created string
		if err := rows.Scan(&m.ID, &m.To, &m.Subject, &m.Body, &created); err != nil {
			return nil, err
		}
		m.CreatedAt = platform.ParseTS(created)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) webhookSecret(ctx context.Context, id string) (url string, secret []byte, ok bool, err error) {
	var sealed, deleted string
	var active int
	err = s.base.DB.QueryRowContext(ctx, `SELECT url, secret_sealed, active, deleted_at FROM notify_webhooks WHERE id = ?`, id).
		Scan(&url, &sealed, &active, &deleted)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, false, nil
	}
	if err != nil {
		return "", nil, false, err
	}
	if active != 1 || deleted != "" {
		return url, nil, false, nil
	}
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return "", nil, false, err
	}
	secret, err = s.base.Sealer.Open(raw, id)
	if err != nil {
		return "", nil, false, fmt.Errorf("notify: open webhook secret: %w", err)
	}
	return url, secret, true, nil
}

func newSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "whsec_" + base64.RawURLEncoding.EncodeToString(b), nil
}

func normalizeEvents(in []string) ([]string, string) {
	out := []string{}
	for _, e := range in {
		if !slices.Contains(EventTypes, e) {
			return nil, "bilinmeyen olay türü: " + e
		}
		if !slices.Contains(out, e) {
			out = append(out, e)
		}
	}
	return out, ""
}
