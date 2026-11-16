-- 0002 — Çalışma alanları, üyelikler, davetler.
-- Her kullanıcının tek bir kişisel alanı ('personal') vardır; paylaşımlı alanlar ('shared') davetle büyür.
-- `rev`: alanın değişiklik sayacı; eşitleme her değişen kayıtta bir artırır (bkz. 0003_sync.sql).

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'shared')),
  rev INTEGER NOT NULL DEFAULT 0 CHECK (rev >= 0),
  -- Yabancı anahtar yok: alanı açan kullanıcı silinse de alan (başka üyeleriyle) yaşayabilir.
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE members (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
) STRICT;

CREATE INDEX members_user ON members (user_id);

CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT REFERENCES users (id) ON DELETE SET NULL
) STRICT;

CREATE INDEX invites_workspace ON invites (workspace_id);
CREATE INDEX invites_expires ON invites (expires_at);
