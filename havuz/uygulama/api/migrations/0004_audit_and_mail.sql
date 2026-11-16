-- 0004 — Denetim günlüğü ve geliştirme e-posta kutusu.
-- audit_log: güvenlikle ilgili olaylar (giriş, başarısız giriş, şifre değişimi, üyelik, yönetici işlemi).
--   Parola, belirteç, e-posta gövdesi YAZILMAZ. Bakım işi 180 günden eski satırları siler.
-- mail_outbox: MAIL_PROVIDER=console iken gönderilen e-postalar (testler ve geliştirme buradan okur).

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  target_type TEXT,
  target_id TEXT,
  workspace_id TEXT,
  ip TEXT,
  details TEXT
) STRICT;

CREATE INDEX audit_log_at ON audit_log (at);
CREATE INDEX audit_log_actor ON audit_log (actor_id);

CREATE TABLE mail_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT
) STRICT;
