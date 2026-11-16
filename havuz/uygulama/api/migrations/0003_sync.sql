-- 0003 — Eşitleme: bütün varlıkların kayıtları (tek tablo, JSON) ve cihazlar.
-- Yeni varlık (koleksiyon) için migrasyon GEREKMEZ: kayıtlar `collection` sütunuyla ayrılır.
-- `rev` alan içinde benzersizdir (records_workspace_rev); eşitleme imleci bu sırayı izler.

CREATE TABLE records (
  workspace_id TEXT NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  -- Şemayla doğrulanmış kaydın JSON metni.
  data TEXT NOT NULL,
  -- Mezar taşı: silinen kayıt satır olarak kalır ki silme öteki cihazlara da ulaşsın.
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  rev INTEGER NOT NULL CHECK (rev > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Bilgi amaçlı; kullanıcı silinse de kayıt kalır (yabancı anahtar yok).
  updated_by TEXT,
  PRIMARY KEY (workspace_id, collection, id)
) STRICT;

CREATE UNIQUE INDEX records_workspace_rev ON records (workspace_id, rev);

-- Cihaz (yerel veritabanı) başına işlenen son değişiklik numarası: yinelenen gönderimi ayıklamak için.
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_mutation_id INTEGER NOT NULL DEFAULT 0 CHECK (last_mutation_id >= 0),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
) STRICT;

CREATE INDEX clients_user ON clients (user_id);
