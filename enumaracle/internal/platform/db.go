package platform

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // postgres driver "pgx"
	_ "modernc.org/sqlite"             // sqlite driver "sqlite"
)

// Querier is satisfied by *DB and *Tx; store code accepts it to work inside or outside transactions.
type Querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// DB wraps *sql.DB. All SQL is written with '?' placeholders in the portable
// subset (TEXT ids and timestamps, INTEGER/BIGINT, REAL, TEXT JSON, INTEGER 0/1
// booleans) and rebound to $n for PostgreSQL.
type DB struct {
	SQL    *sql.DB
	Driver string // sqlite|postgres
}

// OpenDB opens and pings the database.
func OpenDB(ctx context.Context, driver, dsn string) (*DB, error) {
	name := driver
	if driver == "postgres" {
		name = "pgx"
	}
	if driver == "sqlite" {
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		dsn += sep + "_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
		if !strings.Contains(dsn, ":memory:") {
			dsn += "&_pragma=journal_mode(WAL)"
		}
	}
	db, err := sql.Open(name, dsn)
	if err != nil {
		return nil, err
	}
	if driver == "sqlite" {
		// One connection: serializes writers and keeps ":memory:" a single database.
		db.SetMaxOpenConns(1)
	} else {
		db.SetMaxOpenConns(20)
		db.SetConnMaxIdleTime(5 * time.Minute)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}
	return &DB{SQL: db, Driver: driver}, nil
}

// OpenTestDB returns a migrated in-memory SQLite database. migrations are the
// feature packages' embedded FS values (platform's own are always applied first).
func OpenTestDB(ctx context.Context, migrations ...fs.FS) (*DB, error) {
	db, err := OpenDB(ctx, "sqlite", ":memory:")
	if err != nil {
		return nil, err
	}
	if err := db.Migrate(ctx, migrations...); err != nil {
		return nil, err
	}
	return db, nil
}

func (d *DB) Close() error { return d.SQL.Close() }

// Rebind converts '?' placeholders to $1..$n for PostgreSQL. '?' inside
// single-quoted literals is left alone.
func (d *DB) Rebind(q string) string { return rebind(d.Driver, q) }

func rebind(driver, q string) string {
	if driver != "postgres" || !strings.Contains(q, "?") {
		return q
	}
	var b strings.Builder
	n, inStr := 0, false
	for i := 0; i < len(q); i++ {
		c := q[i]
		if c == '\'' {
			inStr = !inStr
		}
		if c == '?' && !inStr {
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}

func (d *DB) ExecContext(ctx context.Context, q string, args ...any) (sql.Result, error) {
	return d.SQL.ExecContext(ctx, d.Rebind(q), args...)
}
func (d *DB) QueryContext(ctx context.Context, q string, args ...any) (*sql.Rows, error) {
	return d.SQL.QueryContext(ctx, d.Rebind(q), args...)
}
func (d *DB) QueryRowContext(ctx context.Context, q string, args ...any) *sql.Row {
	return d.SQL.QueryRowContext(ctx, d.Rebind(q), args...)
}

// Tx is a transaction with the same rebinding behaviour.
type Tx struct {
	tx     *sql.Tx
	driver string
}

func (t *Tx) ExecContext(ctx context.Context, q string, args ...any) (sql.Result, error) {
	return t.tx.ExecContext(ctx, rebind(t.driver, q), args...)
}
func (t *Tx) QueryContext(ctx context.Context, q string, args ...any) (*sql.Rows, error) {
	return t.tx.QueryContext(ctx, rebind(t.driver, q), args...)
}
func (t *Tx) QueryRowContext(ctx context.Context, q string, args ...any) *sql.Row {
	return t.tx.QueryRowContext(ctx, rebind(t.driver, q), args...)
}

// InTx runs fn in a transaction, committing on nil error.
func (d *DB) InTx(ctx context.Context, fn func(tx *Tx) error) error {
	stx, err := d.SQL.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(&Tx{tx: stx, driver: d.Driver}); err != nil {
		_ = stx.Rollback()
		return err
	}
	return stx.Commit()
}

// IsUniqueViolation reports a UNIQUE/PRIMARY KEY constraint failure on either driver.
func IsUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "UNIQUE constraint") || strings.Contains(s, "SQLSTATE 23505") ||
		strings.Contains(s, "duplicate key")
}

// NotFound maps sql.ErrNoRows to core-style not found with a subject.
func NotFound(err error, what string) error {
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%w: %s", errNotFound, what)
	}
	return err
}

// Migrate applies every *.sql file of the given filesystems (platform's own
// first), ordered by file name across all packages, each exactly once.
// Files must be named NNNN_name.sql; statements are separated by ";" at end of line.
func (d *DB) Migrate(ctx context.Context, migrations ...fs.FS) error {
	if _, err := d.SQL.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`); err != nil {
		return err
	}
	type file struct {
		name string
		fsys fs.FS
		path string
	}
	var files []file
	all := append([]fs.FS{Migrations}, migrations...)
	for _, fsys := range all {
		matches, err := fs.Glob(fsys, "migrations/*.sql")
		if err != nil {
			return err
		}
		for _, m := range matches {
			base := m[strings.LastIndex(m, "/")+1:]
			files = append(files, file{base, fsys, m})
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })
	for i := 1; i < len(files); i++ {
		if files[i].name == files[i-1].name {
			return fmt.Errorf("duplicate migration file name %s", files[i].name)
		}
	}
	for _, f := range files {
		var x string
		err := d.QueryRowContext(ctx, `SELECT name FROM schema_migrations WHERE name = ?`, f.name).Scan(&x)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		body, err := fs.ReadFile(f.fsys, f.path)
		if err != nil {
			return err
		}
		err = d.InTx(ctx, func(tx *Tx) error {
			for _, stmt := range splitSQL(string(body)) {
				if _, err := tx.ExecContext(ctx, stmt); err != nil {
					return fmt.Errorf("migration %s: %w\n%s", f.name, err, stmt)
				}
			}
			_, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`, f.name, TS(time.Now()))
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func splitSQL(s string) []string {
	var out []string
	var cur strings.Builder
	for _, line := range strings.Split(s, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "--") || t == "" {
			continue
		}
		cur.WriteString(line)
		cur.WriteByte('\n')
		if strings.HasSuffix(t, ";") {
			out = append(out, strings.TrimSuffix(strings.TrimSpace(cur.String()), ";"))
			cur.Reset()
		}
	}
	if strings.TrimSpace(cur.String()) != "" {
		out = append(out, strings.TrimSpace(cur.String()))
	}
	return out
}

// TS formats a time for storage: RFC3339 with nanoseconds, UTC. Sorts lexically.
func TS(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000000000Z") }

// ParseTS parses a stored timestamp; empty string gives the zero time.
func ParseTS(s string) time.Time {
	if s == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}
	}
	return t.UTC()
}

// TSPtr stores an optional time ("" for nil).
func TSPtr(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return TS(*t)
}

// ParseTSPtr parses an optional stored time.
func ParseTSPtr(s string) *time.Time {
	if s == "" {
		return nil
	}
	t := ParseTS(s)
	return &t
}

// Bool converts a Go bool to the portable INTEGER 0/1 representation.
func Bool(b bool) int {
	if b {
		return 1
	}
	return 0
}
