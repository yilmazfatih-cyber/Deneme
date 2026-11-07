-- disputes: enterprise tickets about labels, suspensions, branding and lookups. Portable SQL subset.
CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  tn TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  resolution TEXT NOT NULL DEFAULT '',
  opened_by TEXT NOT NULL,
  resolved_by TEXT NOT NULL DEFAULT '',
  resolved_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX disputes_entity ON disputes (entity_id, created_at);
CREATE INDEX disputes_status ON disputes (status, created_at);
CREATE TABLE dispute_comments (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes (id),
  author_id TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX dispute_comments_dispute ON dispute_comments (dispute_id, created_at);
