# legalai — Türkiye hukuk kaynakları için toplama, RAG ve kaynak bağlantılı analiz

Resmî Gazete, mevzuat.gov.tr ve yargı kaynaklarından (Yargıtay, Danıştay, Anayasa Mahkemesi, UYAP Emsal,
KVKK, Rekabet Kurulu) belgeleri toplar, tek bir SQLite dosyasında depolar, hibrit arama (BM25 + isteğe bağlı
vektör) ile bulur ve Claude ile **her cümlesi gerçek belge bağlantısına giden** hukuki analiz üretir.

Model hiçbir bağlantıyı kendisi yazmaz: parçalar Claude'a `search_result` blokları olarak verilir, Claude
alıntı yaparken bloğun indeksini döndürür, biz o indeksi veritabanındaki belgenin gerçek adresine (ve varsa
`#madde-344` gibi çıpaya) çeviririz.

> Bu araç hukuki danışmanlık değildir. Kaynaklar doğrudan bağlantılarından doğrulanmalıdır.

## Kurulum

```bash
cd legal-ai
python3.11 -m venv .venv && . .venv/bin/activate      # 3.11+
pip install -e ".[dev]"                                 # çekirdek + testler
# isteğe bağlı: pip install -e ".[voyage]"  veya  ".[local]"  (vektör arama için)
export ANTHROPIC_API_KEY=sk-ant-...                     # yalnızca `analyze` için gerekir
```

Ayarlar ortam değişkeniyle ya da çalışma dizinindeki `.env` dosyasıyla verilir:

| Değişken | Varsayılan | Anlamı |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Claude API anahtarı (`ant auth login` profili de çalışır) |
| `LEGALAI_MODEL` | `claude-opus-5-5` | Analiz modeli (`claude-fable-5-1`, `claude-sonnet-5-5` ...) |
| `LEGALAI_EFFORT` | `high` | Düşünme derinliği: `low` … `max` |
| `LEGALAI_DATA_DIR` | `data` | SQLite ve ham dosyalar |
| `LEGALAI_EMBEDDER` | `none` | `none` (yalnızca BM25) · `voyage` (`VOYAGE_API_KEY`) · `local` (sentence-transformers) |
| `LEGALAI_EMBED_MODEL` | sağlayıcıya göre | `voyage-3-large` / `intfloat/multilingual-e5-base` |
| `LEGALAI_HOST` / `LEGALAI_PORT` | `127.0.0.1` / `8008` | Web arayüzü |

## Kullanım

```bash
legalai sources                                   # desteklenen kaynaklar
legalai probe resmi_gazete                        # canlı siteye karşı 1 belge dene (hiçbir şey yazmaz)

# Toplama
legalai ingest resmi_gazete --since 2025-10-01 --until 2025-10-31
legalai ingest mevzuat                            # 20 temel kanun (TBK, TMK, TCK, HMK, İş K., KVKK, ...)
legalai ingest mevzuat -q 6098                    # tek kanun
legalai ingest yargitay,danistay -q "kira tespit davası" --since 2022-01-01 --limit 200
legalai ingest aym_norm -q "ifade özgürlüğü" --limit 50
legalai ingest aym_bireysel -q "BB/2020/1234"     # doğrudan karar
legalai ingest kvkk,rekabet --since 2024-01-01

# Arama ve analiz
legalai status
legalai search "ihtiyati tedbir kira" -s yargitay --since 2023-01-01
legalai analyze "Kira artış oranı TÜFE sınırını aşan sözleşme hükmü geçerli mi?" --out analiz.md
legalai serve                                     # http://127.0.0.1:8008
```

Web arayüzünde soru yazılır, kaynaklar ve tarih aralığı seçilir; yanıt metnindeki `[n]` üst simgeleri ve
alttaki Kaynaklar listesi doğrudan belgeye gider. "Sadece ara" modu modeli çağırmaz.

Günlük güncelleme için cron örneği (her sabah 07:30, yalnızca yeni belgeler indirilir):

```
30 7 * * * cd /yol/legal-ai && .venv/bin/legalai ingest resmi_gazete --since $(date -d yesterday +\%F) >> data/ingest.log 2>&1
```

## Mimari

```
legalai/
  sources/        kaynak adaptörleri — discover() -> DocRef, fetch() -> Document   (docs/SOURCE_ADAPTER_SPEC.md)
  ingest.py       keşfet -> indir -> ham dosya -> parçala -> yaz -> (göm); yeniden çalıştırmak güvenli
  chunking.py     madde-duyarlı parçalama ("MADDE 344", "GEREKÇE", "HÜKÜM"); her parça #çıpa taşır
  db.py           SQLite + FTS5 (Türkçe katlama) + gömme tablosu; tek dosya, sunucu yok
  embeddings.py   none | voyage | local (takılabilir)
  retrieval.py    BM25 + vektör, Reciprocal Rank Fusion, belge başına çeşitlilik sınırı
  analysis.py     Claude: search_result + citations -> numaralı, bağlantılı Citation listesi
  web/            FastAPI + tek sayfa arayüz (/api/search, /api/analyze, /api/stats, /api/sources)
  cli.py          typer komutları
```

Veri modeli `legalai/models.py`: `Document` (kaynak, url, başlık, metin, mahkeme/esas/karar, kanun no, RG sayısı),
`Chunk` (heading, anchor), `SearchHit`, `AnalysisResult` (`segments` + `citations`).

## Kaynaklar ve doğrulama durumu

| Kaynak | Kimlik | Keşif | Durum |
| --- | --- | --- | --- |
| Resmî Gazete | `resmi_gazete` | tarih aralığı (günlük fihrist + mükerrer) | fixture ile test edildi, **canlı doğrulanmadı** |
| Mevzuat | `mevzuat` | kanun no / 20 temel kanun | fixture ile test edildi, **canlı doğrulanmadı** |
| Yargıtay | `yargitay` | arama terimi (+tarih) | fixture ile test edildi, **canlı doğrulanmadı** |
| Danıştay | `danistay` | arama terimi (+tarih) | fixture ile test edildi, **canlı doğrulanmadı** |
| AYM norm denetimi | `aym_norm` | arama terimi veya `ND/2023/1` | fixture ile test edildi, **canlı doğrulanmadı** |
| AYM bireysel başvuru | `aym_bireysel` | arama terimi veya `BB/2020/1234` | fixture ile test edildi, **canlı doğrulanmadı** |
| UYAP Emsal | `uyap_emsal` | arama terimi | fixture ile test edildi, **canlı doğrulanmadı** |
| KVKK Kurulu | `kvkk` | tarih (+başlık filtresi) | fixture ile test edildi, **canlı doğrulanmadı** |
| Rekabet Kurulu | `rekabet` | tarih | fixture ile test edildi, **canlı doğrulanmadı** |

Bu depo, gov.tr alanlarına erişimi olmayan bir ortamda geliştirildi. Adaptörler sitelerin bilinen yapısına
göre yazıldı ve `respx` ile sahte ağ üzerinde test edildi. İlk kullanımda her kaynak için `legalai probe <kimlik>`
çalıştırın; yapı değişmişse `SourceError` görünür hata verir (sessiz boş sonuç yok). Her adaptörün başındaki
`DOĞRULAMA` notu ve docstring'leri hangi varsayımların denetlenmesi gerektiğini listeler.

Resmî siteler hız sınırına tabidir: adaptörler kaynak başına ≥ 1 sn aralık ve en fazla 2 eşzamanlı istek kullanır.
Kullanım koşullarına ve kişisel veri kurallarına (özellikle UYAP ve AYM bireysel başvuru kararlarındaki
kişi adları) uyulması kullanıcının sorumluluğundadır.

## Geliştirme

```bash
pytest -q            # 100 test: çekirdek, adaptörler (fixture), analiz (sahte Claude), web, uçtan uca
ruff check legalai tests && ruff format --check legalai tests
```

Yeni kaynak eklemek: `docs/SOURCE_ADAPTER_SPEC.md` sözleşmesine göre `legalai/sources/<ad>.py` yaz,
`models.SourceId` ve `sources/registry.py`'ye ekle, fixture + test koy.

## Yol haritası

- Mevzuat metin araması (`/Arama` ucu doğrulanınca) ve madde bazlı değişiklik tarihçesi
- Yargıtay/Danıştay daire ve esas/karar numarası filtreleri (CLI ve web)
- Sayıştay, BDDK, SPK, Kamu İhale Kurulu kararları
- Alıntı doğrulama: `cited_text`'in parça metninde gerçekten geçtiğinin otomatik kontrolü
- Sohbet modu (çok turlu, önceki alıntıları koruyan)
