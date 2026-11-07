-- pki: signing keys (sealed) and certificates of the pilot STI-CA. Portable SQL subset.
CREATE TABLE pki_keys (
  id TEXT PRIMARY KEY,
  alg TEXT NOT NULL,
  public_der TEXT NOT NULL,
  sealed_private TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE pki_certificates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  issuer_id TEXT NOT NULL DEFAULT '',
  key_id TEXT NOT NULL REFERENCES pki_keys (id),
  serial_hex TEXT NOT NULL UNIQUE,
  subject_cn TEXT NOT NULL,
  spc TEXT NOT NULL DEFAULT '',
  tn_auth_list TEXT NOT NULL DEFAULT '[]',
  not_before TEXT NOT NULL,
  not_after TEXT NOT NULL,
  pem TEXT NOT NULL,
  x5u TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  revoked_at TEXT NOT NULL DEFAULT '',
  revoke_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX pki_certificates_kind ON pki_certificates (kind, status, created_at);
CREATE INDEX pki_certificates_entity ON pki_certificates (entity_id, kind, created_at);
