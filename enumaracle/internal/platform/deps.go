package platform

import (
	"context"
	"encoding/json"
	"io/fs"
	"log/slog"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Deps is the infrastructure handed to every feature package constructor.
type Deps struct {
	DB      *DB
	Log     *slog.Logger
	Cfg     Config
	Sealer  *Sealer
	Metrics *prometheus.Registry
	Clock   core.Clock
}

// Now returns the current time from the injected clock (UTC).
func (d Deps) Now() time.Time {
	if d.Clock != nil {
		return d.Clock().UTC()
	}
	return time.Now().UTC()
}

// NewTestDeps returns deps over a migrated in-memory SQLite database.
func NewTestDeps(ctx context.Context, migrations ...fs.FS) (Deps, error) {
	db, err := OpenTestDB(ctx, migrations...)
	if err != nil {
		return Deps{}, err
	}
	cfg := TestConfig()
	s, _ := NewSealer(cfg.MasterKey)
	return Deps{DB: db, Log: slog.New(slog.DiscardHandler), Cfg: cfg, Sealer: s,
		Metrics: prometheus.NewRegistry(), Clock: core.SystemClock}, nil
}

// Audit records an action by the principal of ctx. detail is marshalled to JSON.
func Audit(ctx context.Context, q Querier, action, targetKind, targetID string, detail any) error {
	p := core.PrincipalFrom(ctx)
	if detail == nil {
		detail = map[string]any{}
	}
	b, err := json.Marshal(detail)
	if err != nil {
		return err
	}
	_, err = q.ExecContext(ctx, `INSERT INTO audit_log (id, at, actor_kind, actor_id, action, target_kind, target_id, request_id, ip, detail)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		core.NewID(), TS(time.Now()), p.Kind, p.ID, action, targetKind, targetID, RequestID(ctx), ClientIP(ctx), string(b))
	return err
}

// ListAudit returns the newest audit events, optionally filtered by target.
func ListAudit(ctx context.Context, q Querier, targetKind, targetID string, limit int) ([]core.AuditEvent, error) {
	query := `SELECT id, at, actor_kind, actor_id, action, target_kind, target_id, request_id, ip, detail FROM audit_log`
	var args []any
	if targetKind != "" {
		query += ` WHERE target_kind = ? AND (? = '' OR target_id = ?)`
		args = append(args, targetKind, targetID, targetID)
	}
	query += ` ORDER BY at DESC LIMIT ?`
	args = append(args, limit)
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.AuditEvent{}
	for rows.Next() {
		var e core.AuditEvent
		var at string
		if err := rows.Scan(&e.ID, &at, &e.ActorKind, &e.ActorID, &e.Action, &e.TargetKind, &e.TargetID, &e.RequestID, &e.IP, &e.Detail); err != nil {
			return nil, err
		}
		e.At = ParseTS(at)
		out = append(out, e)
	}
	return out, rows.Err()
}
