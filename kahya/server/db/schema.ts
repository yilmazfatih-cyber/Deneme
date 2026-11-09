// Veritabanı şeması (SQLite). Tutarlar kuruş cinsinden tamsayı; iş tarihleri 'YYYY-AA-GG' (İstanbul saati),
// zaman damgaları ISO 8601 UTC. Her sürüm MIGRATIONS dizisine eklenir; PRAGMA user_version ile izlenir.

const NOW = `(strftime('%Y-%m-%dT%H:%M:%SZ','now'))`

const V1 = `
CREATE TABLE orgs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_no TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE people (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  kvkk_notice_at TEXT,
  consent_sms INTEGER NOT NULL DEFAULT 1,
  consent_whatsapp INTEGER NOT NULL DEFAULT 1,
  consent_email INTEGER NOT NULL DEFAULT 1,
  anonymized_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX people_org_phone ON people(org_id, phone);
CREATE INDEX people_org_email ON people(org_id, email);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','yonetici','muhasebe','sakin')),
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_resident ON users(org_id, person_id) WHERE person_id IS NOT NULL;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE otp_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'site' CHECK (kind IN ('site','apartman')),
  address TEXT,
  district TEXT,
  city TEXT,
  bank_name TEXT,
  iban TEXT,
  due_day INTEGER NOT NULL DEFAULT 15 CHECK (due_day BETWEEN 1 AND 28),
  late_fee_bps INTEGER NOT NULL DEFAULT 500 CHECK (late_fee_bps BETWEEN 0 AND 500),
  land_share_total INTEGER,
  manager_phone TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE user_sites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE blocks (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (site_id, name)
);

CREATE TABLE units (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
  no TEXT NOT NULL,
  floor INTEGER,
  kind TEXT NOT NULL DEFAULT 'daire' CHECK (kind IN ('daire','dukkan','ofis','depo','diger')),
  area_m2 REAL,
  land_share INTEGER NOT NULL DEFAULT 1 CHECK (land_share > 0),
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX units_unique_no ON units(site_id, COALESCE(block_id, 0), no);

CREATE TABLE occupancies (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('malik','kiraci')),
  is_payer INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX occupancies_unit ON occupancies(unit_id);
CREATE INDEX occupancies_person ON occupancies(person_id);

CREATE TABLE vendors (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trade TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tax_no TEXT,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_month TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 12 CHECK (months BETWEEN 1 AND 24),
  round_to INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'taslak' CHECK (status IN ('taslak','onaylandi','gecici')),
  approved_at TEXT,
  approved_note TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE budget_lines (
  id INTEGER PRIMARY KEY,
  budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  annual_amount INTEGER NOT NULL CHECK (annual_amount >= 0),
  method TEXT NOT NULL CHECK (method IN ('esit','arsa_payi','m2'))
);

CREATE TABLE charges (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('aidat','ek','gecikme','devir','diger')),
  period TEXT,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  due_date TEXT NOT NULL,
  late_fee INTEGER NOT NULL DEFAULT 1,
  late_fee_until TEXT,
  budget_id INTEGER REFERENCES budgets(id) ON DELETE SET NULL,
  batch_key TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','iptal')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX charges_unit ON charges(unit_id, status);
CREATE INDEX charges_site_period ON charges(site_id, period);
CREATE UNIQUE INDEX charges_batch ON charges(unit_id, batch_key) WHERE batch_key IS NOT NULL;

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('havale','nakit','kart','online')),
  source TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','banka','online','devir')),
  reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','iptal')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX payments_unit ON payments(unit_id, status);
CREATE UNIQUE INDEX payments_reference ON payments(site_id, reference) WHERE reference IS NOT NULL AND status = 'aktif';

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  spent_on TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_no TEXT,
  ticket_id INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX expenses_site ON expenses(site_id, spent_on);

CREATE TABLE tickets (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('acil','yuksek','normal','dusuk')),
  status TEXT NOT NULL DEFAULT 'acik' CHECK (status IN ('acik','atandi','islemde','beklemede','cozuldu','kapandi')),
  location TEXT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'personel',
  due_at TEXT,
  cost INTEGER,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  resolved_at TEXT
);
CREATE INDEX tickets_org_status ON tickets(org_id, status);
CREATE INDEX tickets_site ON tickets(site_id, status);

CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ticket_events_ticket ON ticket_events(ticket_id);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','email','portal','telefon')),
  direction TEXT NOT NULL CHECK (direction IN ('gelen','giden')),
  address TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  triage TEXT,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  kind TEXT,
  provider TEXT,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX messages_org ON messages(org_id, direction, status);
CREATE UNIQUE INDEX messages_provider_id ON messages(provider, provider_id) WHERE provider_id IS NOT NULL AND direction = 'gelen';

CREATE TABLE ai_actions (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('oneri','uygulandi','reddedildi','bilgi','hata')),
  title TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  masked_count INTEGER NOT NULL DEFAULT 0,
  ref_type TEXT,
  ref_id INTEGER,
  note TEXT,
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ai_actions_org ON ai_actions(org_id, status);

CREATE TABLE reminders (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  amount INTEGER NOT NULL,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX reminders_unit ON reminders(unit_id, created_at);

CREATE TABLE announcements (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  sent_count INTEGER NOT NULL DEFAULT 0,
  ai INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE meetings (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('olagan','olaganustu')),
  title TEXT NOT NULL,
  first_at TEXT NOT NULL,
  second_at TEXT,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planlandi' CHECK (status IN ('planlandi','cagri','tamamlandi','iptal')),
  held_round TEXT CHECK (held_round IN ('ilk','ikinci')),
  invited_at TEXT,
  minutes TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE agenda_items (
  id INTEGER PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  details TEXT,
  rule TEXT NOT NULL DEFAULT 'cogunluk' CHECK (rule IN ('cogunluk','sayi_arsa','bestedort','oybirligi')),
  result TEXT CHECK (result IN ('kabul','ret'))
);

CREATE TABLE attendance (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  present INTEGER NOT NULL DEFAULT 0,
  proxy TEXT,
  PRIMARY KEY (meeting_id, unit_id)
);

CREATE TABLE votes (
  item_id INTEGER NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('evet','hayir','cekimser')),
  PRIMARY KEY (item_id, unit_id)
);

CREATE TABLE compliance_items (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  interval_months INTEGER NOT NULL CHECK (interval_months BETWEEN 1 AND 120),
  last_done TEXT,
  next_due TEXT,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  result TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'diger',
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'sakin' CHECK (visibility IN ('sakin','personel')),
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE doc_chunks (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  heading TEXT,
  text TEXT NOT NULL
);
CREATE INDEX doc_chunks_doc ON doc_chunks(document_id);

CREATE TABLE payment_intents (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  provider TEXT NOT NULL,
  oid TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor','basarili','basarisiz')),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  failure TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  completed_at TEXT
);

CREATE TABLE bank_imports (
  id INTEGER PRIMARY KEY,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE bank_rows (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES bank_imports(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  txn_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reference TEXT,
  suggested_unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  confidence REAL NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'bekliyor' CHECK (status IN ('bekliyor','eslesti','yoksay','mukerrer')),
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL
);
CREATE INDEX bank_rows_import ON bank_rows(import_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  org_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX audit_org ON audit_log(org_id, created_at);

CREATE TABLE job_runs (
  job TEXT NOT NULL,
  run_key TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (job, run_key)
);
`

export const MIGRATIONS: string[] = [V1]
