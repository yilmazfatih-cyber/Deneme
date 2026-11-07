-- platform: audit log and settings. Portable SQL subset (SQLite + PostgreSQL).
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  request_id TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_target ON audit_log (target_kind, target_id);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
