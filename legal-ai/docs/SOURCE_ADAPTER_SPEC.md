# Kaynak adaptörü yazım kılavuzu

Bu belge `legalai/sources/*.py` dosyalarını yazan herkes (insan veya ajan) için sözleşmedir.

## Sözleşme

- Modül `legalai/sources/<kaynak>.py`; sınıf `legalai.sources.base.BaseSource`'tan türer.
- `source_id: ClassVar[SourceId]`, `display_name`, `base_url`, `min_interval` (saniye; resmî siteler için ≥ 1.0) tanımlanır.
- `async def discover(self, since=None, until=None, query=None, limit=None) -> AsyncIterator[DocRef]`:
  tembel async generator. `since/until` tarih aralığı; `query` serbest metin (kararlar için arama terimi).
  `limit` verilirse en fazla o kadar `DocRef` üretir.
- `async def fetch(self, ref: DocRef) -> Document`: tek belgeyi indirir. `Document.text` **temiz düz metin**
  (`legalai.text.html_to_text` / `pdf_to_text`), `Document.url` kullanıcıya gösterilecek **doğrudan bağlantı**.
  PDF'den okunan belgelerde `url` HTML sayfası varsa HTML'i, yoksa PDF'yi gösterir.
- Ağ erişimi yalnızca `self.get(...)` / `self.post(...)` ile (hız sınırı + yeniden deneme oradadır).
- Yapı beklenenden farklıysa `SourceError` fırlatılır; sessizce boş metin döndürülmez.
- Meta alanlar: mahkeme kararlarında `court`, `case_no`, `decision_no`, `decision_date`; mevzuatta `law_no`,
  `doc_type`; Resmî Gazete'de `rg_issue`, `published_at`. Kalan her şey `metadata` sözlüğüne.
- `external_id` kaynak içinde tekil ve kararlı olmalı (yeniden çalıştırmada aynı belge aynı kimliği alır).

## Test zorunluluğu

- `tests/fixtures/<kaynak>/` altına gerçek site yapısını yansıtan **küçük** HTML/JSON/PDF örnekleri.
- `tests/test_source_<kaynak>.py`: `respx` ile ağ sahteleştirilir; `discover` ve `fetch` uçtan uca test edilir
  (başlık, tarih, url, metin içinde beklenen bir cümle).
- Bu geliştirme ortamında gov.tr alanlarına erişim **yok**. Site yapısı bilgiden/kamusal belgelerden yazılır;
  modülün başına `# DOĞRULAMA: <tarih> itibarıyla canlı siteye karşı doğrulanmadı` notu konur.
  Canlı doğrulama `legalai probe <kaynak>` komutuyla kullanıcının makinesinde yapılır.

## Kaynak özetleri (bilinen yapı)

| Kaynak | Keşif | Belge |
| --- | --- | --- |
| Resmî Gazete | `https://www.resmigazete.gov.tr/eskiler/YYYY/MM/YYYYMMDD.htm` fihrist; mükerrer: `YYYYMMDDM1.htm` | `.../YYYYMMDD-N.htm` (HTML) veya `.../YYYYMMDD-N.pdf` |
| Mevzuat | `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTur=1&MevzuatTertip=5` ve arama | `https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf` (Tür.Tertip.No) |
| Yargıtay | `POST https://karararama.yargitay.gov.tr/aramalist` JSON `{"data":{"arananKelime":..., "pageSize":..., "pageNumber":...}}` | `GET https://karararama.yargitay.gov.tr/getDokuman?id=<id>` (JSON içinde HTML) |
| Danıştay | `POST https://karararama.danistay.gov.tr/aramalist` benzer gövde | `GET https://karararama.danistay.gov.tr/getDokuman?id=<id>` |
| AYM norm | `https://normkararlarbilgibankasi.anayasa.gov.tr/Ara?...` liste; karar `ND/YYYY/N` | `https://normkararlarbilgibankasi.anayasa.gov.tr/ND/2023/1` |
| AYM bireysel | `https://kararlarbilgibankasi.anayasa.gov.tr/Ara?...`; karar `BB/YYYY/N` | `https://kararlarbilgibankasi.anayasa.gov.tr/BB/2020/1234` |
| UYAP Emsal | `POST https://emsal.uyap.gov.tr/aramalist` | `GET https://emsal.uyap.gov.tr/getDokuman?id=<id>` |
| KVKK | `https://www.kvkk.gov.tr/Icerik/<id>/...` kurul karar özetleri listesi | karar sayfası HTML |
| Rekabet | `https://www.rekabet.gov.tr/tr/Kararlar` liste | karar PDF |

Siteler biçim değiştirebilir; bu yüzden ayrıştırıcılar **toleranslı** yazılır ve `SourceError` ile sessiz
bozulma yerine görünür hata verir.
