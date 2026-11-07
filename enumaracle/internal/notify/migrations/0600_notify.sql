-- notify: webhooks, webhook deliveries and the email outbox. Portable SQL subset.
CREATE TABLE notify_webhooks (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  secret_sealed TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX notify_webhooks_owner ON notify_webhooks (owner_kind, entity_id);
CREATE TABLE notify_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  next_at TEXT NOT NULL DEFAULT '',
  last_code INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX notify_deliveries_due ON notify_deliveries (status, next_at);
CREATE INDEX notify_deliveries_webhook ON notify_deliveries (webhook_id, created_at);
CREATE TABLE notify_email_outbox (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX notify_email_outbox_created ON notify_email_outbox (created_at);
