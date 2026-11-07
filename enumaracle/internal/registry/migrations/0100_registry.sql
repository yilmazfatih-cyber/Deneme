-- registry: entities (KYC + vetting), documents, numbers, branding.
-- Portable SQL subset (SQLite + PostgreSQL). Timestamps are platform.TS strings ('' = unset).
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT 'TR',
  vkn TEXT NOT NULL,
  mersis TEXT NOT NULL DEFAULT '',
  sector TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  iys_registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  risk_tier TEXT NOT NULL DEFAULT 'medium',
  reject_reason TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT '',
  vetted_at TEXT NOT NULL DEFAULT '',
  vetted_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX entities_vkn ON entities (vkn);
CREATE INDEX entities_status ON entities (status);
CREATE INDEX entities_created ON entities (created_at);
CREATE TABLE entity_documents (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities (id),
  kind TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  uploaded_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX entity_documents_entity ON entity_documents (entity_id, created_at);
CREATE TABLE vetting_decisions (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities (id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reviewer_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX vetting_decisions_entity ON vetting_decisions (entity_id, created_at);
CREATE TABLE branding (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities (id),
  display_name TEXT NOT NULL,
  logo_url TEXT NOT NULL DEFAULT '',
  call_reason TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX branding_entity ON branding (entity_id, status);
CREATE INDEX branding_status ON branding (status);
-- A number row is a single TN (range_start = range_end) or a contiguous range of
-- equal-length E.164 strings. tn_len = length(range_start) so that "nearest range
-- starting at or below tn" is one index seek on (tn_len, range_start).
CREATE TABLE numbers (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entities (id),
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  tn_len INTEGER NOT NULL,
  tn_count BIGINT NOT NULL,
  kind TEXT NOT NULL,
  use_case TEXT NOT NULL,
  call_reason TEXT NOT NULL DEFAULT '',
  branding_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  carrier_confirmed INTEGER NOT NULL DEFAULT 0,
  suspend_reason TEXT NOT NULL DEFAULT '',
  activated_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX numbers_lookup ON numbers (tn_len, range_start);
CREATE INDEX numbers_entity ON numbers (entity_id, status);
CREATE INDEX numbers_status ON numbers (status);
