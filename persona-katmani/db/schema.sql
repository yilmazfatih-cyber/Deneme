-- Persona Katmanı veri şeması · v1 (2026-11-08)
-- Hedef: PostgreSQL. Bu dosya SQLite ile de birebir çalışır (TEXT/REAL/INTEGER; JSON ve zaman damgaları TEXT).
-- Kararlar: ADR-002 (kişiye hedefleme yok), ADR-003 (Kaynak A genel model / Kaynak B gerçek müşteri), ADR-004 (POS verisi şirketten).
-- Kişisel veri ilkesi: musteri tablosunda ad/e-posta/telefon YOK; yalnız kiracının ürettiği takma ad (hash). Kamera verisi yalnız toplu sayım.

PRAGMA foreign_keys = ON;

-- ───────────────────────────── Kiracı ve varlıklar ─────────────────────────────
CREATE TABLE IF NOT EXISTS kiraci (
  id            TEXT PRIMARY KEY,
  ad            TEXT NOT NULL,
  sektor        TEXT,                       -- perakende, e-ticaret, karma
  ulke          TEXT NOT NULL DEFAULT 'TR',
  veri_bolgesi  TEXT NOT NULL DEFAULT 'TR', -- veri yerleşimi (06 §4.4)
  olusturma     TEXT NOT NULL DEFAULT (datetime('now'))
);
-- ───────────────────────────── Model varlıkları ─────────────────────────────
CREATE TABLE IF NOT EXISTS segment (
  id        TEXT PRIMARY KEY,
  ad        TEXT NOT NULL,
  yas       TEXT, gelir TEXT, cinsiyet TEXT,
  pay       REAL,                            -- nüfus payı (Kaynak A)
  renk      TEXT,
  kaynaklar TEXT                             -- JSON: Excel kayıt kimlikleri
);

CREATE TABLE IF NOT EXISTS parametre (
  ad        TEXT PRIMARY KEY,                -- lambda_kayip, beta_simdicilik, ...
  aciklama  TEXT NOT NULL,
  olcek     TEXT,                            -- çarpan | olasılık | saniye | TL | d
  min REAL, max REAL
);

-- ───────────────────────────── Kampanya ve simülasyon ─────────────────────────────
CREATE TABLE IF NOT EXISTS kampanya (
  id                 TEXT PRIMARY KEY,
  kiraci_id          TEXT NOT NULL REFERENCES kiraci(id),
  ad                 TEXT NOT NULL,
  kanal              TEXT, yaratici TEXT,
  indirim_orani      REAL,
  butce_tl           REAL,
  hedef_segmentler   TEXT,                   -- JSON liste veya "hepsi" (segment düzeyi; kişi listesi YASAK, ADR-002)
  kontrol_orani      REAL,
  baslangic TEXT, bitis TEXT,
  gercek_mi          INTEGER NOT NULL DEFAULT 0  -- 1 = sahada koşan gerçek kampanya (kalibrasyon için)
);

CREATE TABLE IF NOT EXISTS magaza (
  id          TEXT PRIMARY KEY,
  kiraci_id   TEXT NOT NULL REFERENCES kiraci(id),
  ad          TEXT NOT NULL,
  sehir       TEXT,                          -- S2 seviyesi
  ilce        TEXT,
  konum_turu  TEXT,                          -- avm | cadde | semt | outlet  (S3 seviyesi)
  enlem       REAL, boylam REAL,
  m2          REAL,
  acilis      TEXT
);

CREATE TABLE IF NOT EXISTS site (
  id          TEXT PRIMARY KEY,
  kiraci_id   TEXT NOT NULL REFERENCES kiraci(id),
  ad          TEXT NOT NULL,
  tur         TEXT NOT NULL,                 -- web | ios | android
  url         TEXT
);

-- Takma adlı müşteri. Kimlik bilgisi yok; kiracı kendi tarafında eşler. Segment, model tarafından atanır (Kaynak B kümeleri).
CREATE TABLE IF NOT EXISTS musteri (
  id            TEXT PRIMARY KEY,            -- kiracının verdiği takma ad (hash)
  kiraci_id     TEXT NOT NULL REFERENCES kiraci(id),
  ilk_gorulme   TEXT,
  son_gorulme   TEXT,
  segment_id    TEXT REFERENCES segment(id),
  b_kume_id     TEXT,                         -- Kaynak B posterior kümesi (07 §3.4)
  riza_durumu   TEXT NOT NULL DEFAULT 'bilinmiyor', -- var | yok | geri_cekildi | bilinmiyor
  silme_talebi  TEXT                          -- tarih; doluysa olaylar silinir, kestirimden çıkarılır
);

-- ───────────────────────────── Gerçek davranış verisi (Kaynak B girdisi) ─────────────────────────────
-- Fiş düzeyi (ADR-004). musteri_id boşsa yalnız Kaynak A'nın S3'ünü besler.
CREATE TABLE IF NOT EXISTS pos_islem (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  magaza_id      TEXT NOT NULL REFERENCES magaza(id),
  musteri_id     TEXT REFERENCES musteri(id),
  zaman          TEXT NOT NULL,              -- ISO 8601
  tutar_tl       REAL NOT NULL CHECK (tutar_tl >= 0),
  urun_sayisi    INTEGER,
  odeme_tipi     TEXT,                       -- nakit | kart | mobil
  taksit_sayisi  INTEGER DEFAULT 1,
  kampanya_id    TEXT REFERENCES kampanya(id),
  iade           INTEGER NOT NULL DEFAULT 0  -- 1 = iade fişi
);
CREATE INDEX IF NOT EXISTS ix_pos_magaza_zaman ON pos_islem(magaza_id, zaman);
CREATE INDEX IF NOT EXISTS ix_pos_musteri ON pos_islem(musteri_id);

-- Fiş satırı (varsa; 07 §4.4 daha çok parametre tanımlar)
CREATE TABLE IF NOT EXISTS pos_satir (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  islem_id     INTEGER NOT NULL REFERENCES pos_islem(id) ON DELETE CASCADE,
  urun_kodu    TEXT,
  kategori     TEXT,
  adet         REAL NOT NULL DEFAULT 1,
  birim_fiyat  REAL NOT NULL,
  indirim_tl   REAL NOT NULL DEFAULT 0
);

-- Mağaza günlük toplamı (ADR-004; fiş düzeyi veri yoksa bu yeter)
CREATE TABLE IF NOT EXISTS magaza_gunluk (
  magaza_id    TEXT NOT NULL REFERENCES magaza(id),
  tarih        TEXT NOT NULL,
  ciro_tl      REAL NOT NULL,
  fis_sayisi   INTEGER NOT NULL,
  kampanya_id  TEXT REFERENCES kampanya(id),
  PRIMARY KEY (magaza_id, tarih)
);

-- Kamera: yalnız toplu bölge sayımı (kimlik, yüz, cihaz yok)
CREATE TABLE IF NOT EXISTS kamera_bolge (
  id         TEXT PRIMARY KEY,
  magaza_id  TEXT NOT NULL REFERENCES magaza(id),
  ad         TEXT NOT NULL,                  -- giriş, koridor A, promosyon adası, kasa önü
  x REAL, y REAL, w REAL, h REAL             -- 2D düzende konum (simülasyon ızgarası birimi)
);
CREATE TABLE IF NOT EXISTS kamera_sayim (
  bolge_id        TEXT NOT NULL REFERENCES kamera_bolge(id),
  dilim_baslangic TEXT NOT NULL,             -- 15 dk dilimleri
  kisi_sayisi     INTEGER NOT NULL,
  ort_bekleme_sn  REAL,
  PRIMARY KEY (bolge_id, dilim_baslangic)
);

-- Web / uygulama olayları (04 §7 zarfı; oturum takma adlı)
CREATE TABLE IF NOT EXISTS web_olay (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT NOT NULL REFERENCES site(id),
  oturum_id   TEXT NOT NULL,
  musteri_id  TEXT REFERENCES musteri(id),
  zaman       TEXT NOT NULL,
  tur         TEXT NOT NULL,                 -- sayfa | tikla | sepete_ekle | satin_al | terk | reklam_tikla ...
  asama       TEXT,                          -- acilis | liste | urun | sepet | odeme
  veri        TEXT                           -- JSON
);
CREATE INDEX IF NOT EXISTS ix_web_site_zaman ON web_olay(site_id, zaman);
CREATE INDEX IF NOT EXISTS ix_web_oturum ON web_olay(oturum_id);



-- Literatür bulguları (Excel'in birebir kopyası; Kaynak A S0/S1 öncüllerinin kanıtı)
CREATE TABLE IF NOT EXISTS literatur_bulgu (
  kayit_id TEXT PRIMARY KEY, seviye TEXT, alan TEXT, alt_konu TEXT, etki_adi TEXT, etki_tanimi TEXT, yon TEXT,
  etki_buyuklugu_deger REAL, etki_buyuklugu_olcusu TEXT, guven_araligi TEXT, orneklem_n TEXT,
  populasyon_ulke TEXT, populasyon_yas TEXT, baglam TEXT, yontem TEXT,
  moderator_degisken TEXT, moderator_yonu_ve_buyuklugu TEXT, bireysel_fark_olcegi TEXT,
  persona_parametresi TEXT, parametre_dagilimi_onerisi TEXT, kanit_gucu INTEGER,
  yazarlar TEXT, yil INTEGER, baslik TEXT, dergi TEXT, doi TEXT, url TEXT, kaynak_dogrulama TEXT, notlar TEXT
);

-- Kaynak A öncülleri: seviye ve kapsam başına dağılım (07 §3)
CREATE TABLE IF NOT EXISTS oncul (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seviye        TEXT NOT NULL,               -- S0 | S1 | S2 | S3
  kapsam_turu   TEXT NOT NULL,               -- dunya | ulke | sehir | magaza | site
  kapsam_id     TEXT,                        -- 'TR', 'İstanbul', magaza.id, site.id
  segment_id    TEXT REFERENCES segment(id), -- boşsa tüm segmentler
  parametre     TEXT NOT NULL REFERENCES parametre(ad),
  dagilim_tipi  TEXT NOT NULL,               -- lognormal | normal | sabit
  merkez        REAL NOT NULL,
  yayilim       REAL NOT NULL,
  min REAL, max REAL,
  etiket        TEXT NOT NULL DEFAULT 'miras', -- miras | kismen_yerel | yerel (07 §3.5)
  kaynaklar     TEXT,                        -- JSON kayıt kimlikleri
  surum         TEXT NOT NULL,
  olusturma     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_oncul_kapsam ON oncul(seviye, kapsam_turu, kapsam_id, parametre);

-- Kaynak B kestirimleri: kiracının gerçek verisinden, A'dan bağımsız (ADR-003)
CREATE TABLE IF NOT EXISTS kaynak_b_kestirim (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kiraci_id     TEXT NOT NULL REFERENCES kiraci(id),
  kapsam_turu   TEXT NOT NULL,               -- hepsi | magaza | site | kume
  kapsam_id     TEXT,
  parametre     TEXT NOT NULL REFERENCES parametre(ad),
  medyan REAL NOT NULL, alt_80 REAL, ust_80 REAL, alt_95 REAL, ust_95 REAL,
  n             INTEGER NOT NULL,
  tanimlanma    TEXT NOT NULL,               -- tanimli | zayif | tanimsiz (07 §3.4)
  guven         TEXT NOT NULL,               -- yuksek | orta | dusuk
  yontem        TEXT,                        -- moment | mcmc | vi
  veri_araligi  TEXT,                        -- JSON {baslangic, bitis}
  surum         TEXT NOT NULL,
  olusturma     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A ile B farkı (07 §10.2)
CREATE TABLE IF NOT EXISTS fark_raporu (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kiraci_id      TEXT NOT NULL REFERENCES kiraci(id),
  a_oncul_id     INTEGER REFERENCES oncul(id),
  b_kestirim_id  INTEGER REFERENCES kaynak_b_kestirim(id),
  parametre      TEXT NOT NULL,
  fark           REAL NOT NULL,              -- B − A (doğal birim)
  fark_sd        REAL,                       -- SD birimi
  ga_alt REAL, ga_ust REAL,
  anlamlilik     TEXT NOT NULL,              -- anlamli | belirsiz | esdeger
  yorum          TEXT,
  olusturma      TEXT NOT NULL DEFAULT (datetime('now'))
);


CREATE TABLE IF NOT EXISTS simulasyon_kosusu (
  id              TEXT PRIMARY KEY,
  kiraci_id       TEXT REFERENCES kiraci(id),
  ortam           TEXT NOT NULL,             -- magaza | eticaret
  magaza_id       TEXT REFERENCES magaza(id),
  site_id         TEXT REFERENCES site(id),
  kampanya_id     TEXT REFERENCES kampanya(id),
  parametre_kaynagi TEXT NOT NULL,           -- A | B | A+B  (ADR-003)
  seviye          TEXT,                      -- A için S0..S3
  seed            INTEGER NOT NULL,
  musteri_sayisi  INTEGER NOT NULL,
  sure_sn         REAL NOT NULL,
  yapilandirma    TEXT NOT NULL,             -- JSON (düzen / varyant / kampanya)
  surum_demeti    TEXT NOT NULL,             -- JSON: kod sürümü, öncül sürümü, seed (03 §10)
  baslangic       TEXT NOT NULL DEFAULT (datetime('now')),
  bitis           TEXT
);

CREATE TABLE IF NOT EXISTS sim_olay (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kosu_id      TEXT NOT NULL REFERENCES simulasyon_kosusu(id) ON DELETE CASCADE,
  t            REAL NOT NULL,
  ortam        TEXT NOT NULL,
  sim_musteri  TEXT NOT NULL,                -- simülasyon içi kimlik (gerçek kişi değil)
  segment_id   TEXT,
  tur          TEXT NOT NULL,
  veri         TEXT                          -- JSON
);
CREATE INDEX IF NOT EXISTS ix_sim_olay_kosu ON sim_olay(kosu_id, tur);

CREATE TABLE IF NOT EXISTS sim_kpi (
  kosu_id  TEXT NOT NULL REFERENCES simulasyon_kosusu(id) ON DELETE CASCADE,
  ad       TEXT NOT NULL,
  deger    REAL NOT NULL,
  PRIMARY KEY (kosu_id, ad)
);

-- Segment düzeyi hedefleme raporu (ADR-002: kişi yok)
CREATE TABLE IF NOT EXISTS hedefleme_raporu (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kosu_id          TEXT NOT NULL REFERENCES simulasyon_kosusu(id) ON DELETE CASCADE,
  kampanya_id      TEXT REFERENCES kampanya(id),
  segment_id       TEXT NOT NULL REFERENCES segment(id),
  maruz_kalan      INTEGER NOT NULL,
  kontrol          INTEGER NOT NULL,
  tiklama_orani    REAL,
  donusum_maruz    REAL, donusum_kontrol REAL,
  artis_puan       REAL,
  ga_alt REAL, ga_ust REAL,
  artan_donusum_maliyeti_tl REAL,
  rahatsizlik_orani REAL,
  guven            TEXT NOT NULL,
  oneri            TEXT NOT NULL              -- hedefle | dene | hedefleme | kacin
);

-- Kör tahmin mühürü ve gerçek sonuç (03 §8.4 kalibrasyon döngüsü)
CREATE TABLE IF NOT EXISTS kor_tahmin (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kosu_id        TEXT NOT NULL REFERENCES simulasyon_kosusu(id),
  karar_turu     TEXT NOT NULL,               -- mesaj_iterasyonu | konsept_eleme | akis_surtunmesi | segment_karsilastirma
  tahmin         TEXT NOT NULL,               -- JSON: kazanan, olasılık, aralık
  muhur_zamani   TEXT NOT NULL DEFAULT (datetime('now')),
  muhur_hash     TEXT NOT NULL,
  gercek_sonuc   TEXT,                        -- JSON, sonradan
  gercek_zamani  TEXT,
  brier          REAL
);

CREATE TABLE IF NOT EXISTS denetim_kaydi (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  zaman     TEXT NOT NULL DEFAULT (datetime('now')),
  kim       TEXT NOT NULL,
  eylem     TEXT NOT NULL,                    -- yukle | sil | disa_aktar | kosu | rapor
  nesne     TEXT,
  ayrinti   TEXT                              -- JSON
);
