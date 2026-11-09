# Kaynak C (sosyal) · uygulama notları

Karar: `docs/decisions/ADR-009-sosyal-medya.md` · Tasarım: `docs/mimari/08-kaynak-c-sosyal.md`. Yalnız standart kütüphane.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `ortak.py` | Kayıt sınıfları (`IcerikKaydi`, `MetrikKaydi`, `DuyguOzeti`, `KonuHacmi`, `HesapKaydi`), yaş bandı / cinsiyet / yaratıcı türü sözlükleri, sözlük duygu yöntemi, `kaydet_*` (upsert) |
| `baglayici.py` | `Baglayici` soyut sınıfı, `http_json` (429/5xx için 1-2-4-8 sn üstel bekleme, en fazla 5 deneme, hata mesajında token yok), `KuruUretici` (tohumlu sahte veri) |
| `meta.py`, `tiktok.py`, `x.py` | Platform bağlayıcıları; uç noktalar dosya başındaki sabitlerde |
| `csv_ice.py` | Reklam yöneticisi CSV'leri (TR/EN başlık, `;`/`,` ayraç, TR ondalık virgül) |
| `ogren.py` | C1 `reklam_oncul`, C2 `kalibrasyon` + `kor_tahmin_ekle`, C3 `sosyal_sinyal`, `disa_aktar_sim`, `ozet` |
| `sosyal_cli.py` / `__main__.py` | Komut satırı; her komut `denetim_kaydi`na yazar |

## Varsayımlar

- **Kuru veri** içerik kimliği `<platform>:kuru-<kiraci>-NNN`, hesap kimliği `kuru-<platform>-…`; konu hacmi `kaynak='tahmini'`. `disa-aktar-sim`
  kuru veri görürse JSON'a `"kuruVeri": true` yazar ve uyarır. Kuru reklamlar kiracının ilk `gercek_mi=1` kampanyasına bağlanır (demo: `demo-kasim`).
- **Shrinkage her zaman uygulanır** (w = n/(n+20.000)); "gösterim < 10.000" yalnız güveni `dusuk` yapar. Böylece 10.000 eşiğinde sıçrama olmaz.
- **C1 taban** aynı kiracı ve aynı platformun bant havuzudur; `hepsi` satırı platform içi log oranların gösterim ağırlıklı ortalamasıdır.
  `dikkat_esigi` = video satırlarında 3 sn oranı, görselde CTR (gösterim ağırlıklı log ortalama). `tau_reklam_tolerans` = 0,7·ln(tamamlama oranı) +
  0,3·ln((1−olumsuz_b)/(1−olumsuz_p)); bant olumsuz payı, içerik yorum duygusunun bandın o içeriğe maruziyetiyle ağırlıklandırılmasıdır.
- **Yaratıcı tıklama çarpanı** dolaylı standardizasyonla (platform × bant × video/görsel tabakalarının CTR'ı ile beklenen tıklama).
- **Aykırı**: ham oran 0,5–2 dışındaysa çarpan kırpılır, `denetim_kaydi`na ve çıktıya "aykırı" yazılır, o parametre `oncul`a girmez (08 §3).
- C1 yalnız `tur='reklam'` içerikleri kullanır (organikte yaş kırılımı yok). `donusum_orani` = dönüşüm / tıklama (C2'de dönüşüm / gösterim).
- **C2** çift saymayı önlemek için içerik başına `hepsi/hepsi` satırı varsa onu, yoksa yaş bandı satırlarını toplar (yalnız cinsiyet kırılımlı X satırları dışarıda).
  Tahmin "metrik ≥ eşik" olasılığıdır; isabet = (p ≥ 0,5) gerçekleşmeyle aynı mı. Kampanyanın bitip bitmediğine bakılmaz (kampanya.bitis çoğu zaman boş).
- **C3** `w_sosyal_kanit` = 1 + w·0,3·denge·(1 + 0,25·eğim), w = yorum/(yorum+200), 0,7–1,3 kırpılı, güven hep `dusuk`. İşaret dengeden gelir.
  İlgi endeksi = son 4 haftanın ortalaması / önceki 4 haftanın ortalaması × 100; eğim = son 4 hafta OLS eğimi / ortalama (haftalık göreli).
- X'in standart dışı yaş bantları (35-49, 50+) en çok örtüşen banda eşlenir (35-44, 55+); 18 altını içeren bant atlanır.
- TikTok 3 sn metriği vermez; `video_watched_2s` dikkat vekili olarak `video_3sn`e yazılır. Meta reklamları (FB+IG birlikte yayın) `facebook` platformuna yazılır.
- Harcama hesabın para biriminde gelir; TRY varsayılır (CSV'de "Amount spent (USD)" da tanınır ama dönüştürülmez).

## API'de "doğrulanmalı" (bu oturumda ağ yoktu; canlı çağrı yapılmadı)

- Meta: 3 sn izlenme alanı (`actions[video_view]` ↔ eski `video_3_sec_watched_actions`); dönüşüm eylem türleri (kiracının piksel olayı);
  sayfa gönderisi metrik adları (v21); IG `impressions` → `views` geçişi; reklam yorumları (`effective_object_story_id`) çekilmiyor;
  IG hashtag `recent_media` 24 saat penceresi ve 7 günde 30 hashtag sınırı; `age,gender` + `publisher_platform` birlikte kırılım yasağı.
- TikTok: AUDIENCE raporunda `stat_time_day` + `age` + `gender` birlikte; `conversion`/`engagements` metrik adları; `/comment/list/` izni ve alanları.
- X: Ads API **OAuth 1.0a kullanıcı bağlamı** ister — bağlayıcı şimdilik Bearer gönderiyor; imzalama (hmac-sha1, stdlib) ve
  `X_ADS_CONSUMER_KEY/SECRET`, `X_ADS_ACCESS_TOKEN/SECRET` eklenmeli. Senkron `/stats` segmentasyonu desteklemeyebilir (async `/stats/jobs`).
  Metrik adları (`video_3s100pct_views`, `url_clicks`, `billed_charge_local_micro`), alan adı `ads-api.x.com`; `tweets/counts/recent` yalnız 7 gün.

## Şema eksikleri (schema.sql değiştirilmedi; öneri)

1. `kor_tahmin` tablosunda `kampanya_id` yok: kampanya `simulasyon_kosusu.kampanya_id`den veya tahmin JSON'undaki `kampanya_id`den okunuyor.
   Koşu yoksa `kor-tahmin-ekle` yer tutucu koşu açar (`seed=0`, `musteri_sayisi=0`). Öneri: `kor_tahmin.kampanya_id`, `kor_tahmin.kiraci_id`.
2. `kampanya` tablosunda platform kampanya kimliği yok: bağlayıcı `<platform>:<campaign_id>` kimlikli kampanya varsa bağlar, yoksa `--kampanya` gerekir.
   Öneri: `kampanya_dis_kimlik(kampanya_id, platform, dis_id)`.
3. `oncul` kiracı taşımıyor: C1 S1/TR öncülü son çalışan kiracının verisiyle yazılır (birden çok kiracıda üst üste yazar). Öneri: kiracılar arası
   toplulaştırma adımı (F-9) veya `oncul.kiraci_id` / S3 kapsamı. Felsefi soru 3 (08) açık.
4. `sosyal_ogrenim`de "hedef metrik" sütunu yok: yaratıcı türü tıklama çarpanı `parametre='dikkat_esigi'`, `yas_bandi='hepsi'` satırında tutuluyor.
   Öneri: `parametre` tablosuna `yaratici_tiklama` veya `sosyal_ogrenim.metrik` sütunu.
5. `sosyal_ogrenim`de `konu` yok, `parametre` tablosunda `ilgi` yok: C3 konu ilgi endeksi yalnız JSON çıktı (`sosyal-sinyal --cikti`) ve denetim kaydında.
6. `sosyal_metrik.bolge` NULL olursa UNIQUE çalışmaz (SQLite NULL'ları farklı sayar); yazıcı boş kırılımı her zaman `'hepsi'` yapar.
   Öneri: kırılım sütunlarına `NOT NULL DEFAULT 'hepsi'`.
7. Yorum metninin "30 gün" saklama penceresi kullanılmıyor: metin hiç yazılmıyor (yalnız sayım), ham tablo gerekmedi.

## LLM duygu yolu

`ortak.LLMDuyguSiniflandirici` yalnız arayüz; çağrı yok (`NotImplementedError`). Açılırsa: kimliksiz metin, toplu istek, yanıt yalnız etiket,
`yontem='llm'`, 06 §5 ve 08 felsefi soru 2 kararı beklenir.
