-- reputation: call events, daily rollup, label feedback, scores, overrides, dirty set.
-- Portable SQL subset (SQLite + PostgreSQL). Timestamps are platform.TS strings.
CREATE TABLE call_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  orig_tn TEXT NOT NULL,
  dest_tn TEXT NOT NULL,
  started_at TEXT NOT NULL,
  disposition TEXT NOT NULL,
  duration_sec BIGINT NOT NULL DEFAULT 0,
  verstat TEXT NOT NULL DEFAULT '',
  ingested_at TEXT NOT NULL
);
CREATE INDEX call_events_orig_started ON call_events (orig_tn, started_at);
CREATE INDEX call_events_started ON call_events (started_at);
-- One row per number and local (UTC+3) day, maintained on ingest and feedback.
CREATE TABLE reputation_daily (
  tn TEXT NOT NULL,
  day TEXT NOT NULL,
  calls BIGINT NOT NULL DEFAULT 0,
  answered BIGINT NOT NULL DEFAULT 0,
  short BIGINT NOT NULL DEFAULT 0,
  verstat_failed BIGINT NOT NULL DEFAULT 0,
  complaints BIGINT NOT NULL DEFAULT 0,
  blocks BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tn, day)
);
CREATE TABLE label_feedback (
  id TEXT PRIMARY KEY,
  tn TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX label_feedback_tn_created ON label_feedback (tn, created_at);
CREATE INDEX label_feedback_created ON label_feedback (created_at);
-- Current score per number. score/label are after the protective floor but before
-- any override; eff_score/eff_label include the override that was active at computed_at.
-- announced_label is the effective label last published as reputation.label_changed.
CREATE TABLE reputation_scores (
  tn TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  raw_score INTEGER NOT NULL,
  label TEXT NOT NULL,
  floored INTEGER NOT NULL DEFAULT 0,
  factors TEXT NOT NULL DEFAULT '[]',
  calls_24h BIGINT NOT NULL DEFAULT 0,
  calls_7d BIGINT NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  override_label TEXT NOT NULL DEFAULT '',
  override_until TEXT NOT NULL DEFAULT '',
  eff_score INTEGER NOT NULL,
  eff_label TEXT NOT NULL,
  announced_label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX reputation_scores_eff ON reputation_scores (eff_score);
CREATE INDEX reputation_scores_computed ON reputation_scores (computed_at);
CREATE TABLE reputation_overrides (
  tn TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  reason TEXT NOT NULL,
  set_by TEXT NOT NULL,
  until_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX reputation_overrides_until ON reputation_overrides (until_at);
CREATE TABLE reputation_dirty (
  tn TEXT PRIMARY KEY,
  marked_at TEXT NOT NULL
);
