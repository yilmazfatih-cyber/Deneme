-- 0001 — Kimlik: kullanıcılar, oturumlar, şifre sıfırlama belirteçleri.
-- Zamanlar ISO-8601 UTC metin olarak saklanır ('2026-11-16T10:00:00.000Z'); metin karşılaştırması zaman sırasıdır.
-- Belirteçlerin kendisi DEĞİL, yalnız SHA-256 özetleri saklanır (veritabanı sızsa da oturum çalınamaz).
-- Kural: uygulanmış bir migrasyon dosyası DEĞİŞTİRİLMEZ; değişiklik için yeni numaralı dosya açılır.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  -- Arama anahtarı: foldTr(ad + ' ' + e-posta). Yönetici araması Türkçe harf duyarsız olsun diye.
  search_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
) STRICT;

CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
) STRICT;

CREATE INDEX password_resets_user ON password_resets (user_id);
