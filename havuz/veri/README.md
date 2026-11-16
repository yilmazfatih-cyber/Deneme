# Veri havuzu

Uygulama, analiz ve model işleri için hazır veri temeli: **doğrulanmış Türkçe başvuru verileri**,
**ilişkisel tutarlı sentetik veri üreteçleri**, **veri kalitesi araçları**, **nazik bir veri hattı
iskeleti** ve **lisansı denetlenmiş açık veri kataloğu**. Hepsi tek komutla denetlenir ve ağsız test edilir.

İlke: **yanlış veri, eksik veriden kötüdür.** `tr/` klasörüne yalnız algoritmayla üretilen, bağımsız
kaynaklarla karşılaştırılan ya da kapalı ve kesin bilinen veri girdi; her dosyanın yanında nasıl
doğrulandığını anlatan bir `.meta.json` var. Doğrulanamayanlar dışarıda bırakıldı (aşağıda "Sınırlar").

## 5 dakikada çalıştırma

```bash
cd havuz/veri
uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev,analiz]"
.venv/bin/python scripts/check.py                       # ruff + biçim + mypy + testler (ağsız)
.venv/bin/python -m verihavuzu --help                   # Türkçe yardım
.venv/bin/python -m verihavuzu uret eticaret --adet 300 --cikti calisma/eticaret --sema
.venv/bin/python -m verihavuzu profil ornekler/kisiler/kisiler.csv
```

Kilitli sürümlerle kurmak için: `uv sync --extra dev --extra analiz` (`uv.lock`).

## Havuzda ne var

| Bölüm | Ne işe yarar | Nerede | Örnek komut |
| --- | --- | --- | --- |
| Başvuru verileri | 81 il, 973 ilçe, bölge, alan kodu, alfabe, ay/gün, sabit tatiller, para birimleri, durak sözcükler… | `tr/` | `python -c "from verihavuzu import geo; print(geo.districts(6))"` |
| Sağlama algoritmaları | TCKN, VKN, IBAN (mod 97), Luhn | `verihavuzu/ids.py` | `python -c "from verihavuzu import ids; print(ids.is_valid_tckn('10000000146'))"` |
| Sentetik veri | kişi, şirket, ürün, e-ticaret, fatura, banka, zaman serisi, churn, destek, web günlüğü | `verihavuzu/sentetik/` | `python -m verihavuzu uret churn --adet 5000` |
| Kirli veri kipi | izlenebilir bozulmalar + temiz karşılık | `sentetik/dirty.py` | `python -m verihavuzu uret faturalar --tablo faturalar --kirli --cikti calisma/kirli` |
| Kalite | şema doğrulama, profil, denetim, kayma (PSI/KS), sızıntısız ayırma, yineleme, kişisel veri | `verihavuzu/kalite/` | `python -m verihavuzu dogrula x.csv --sema x.sema.json` |
| Veri hattı | nazik HTTP getirici, çek→doğrula→dönüştür→yükle, karantina, artımlı yükleme | `verihavuzu/hat/` | `python -m verihavuzu hat calistir tcmb_kurlari` |
| Katalog | 58 açık küme (Türkçe NLP, tablo, zaman serisi, görüntü), API'yle doğrulanmış | `katalog/` | `python -m verihavuzu katalog ara duygu --ticari evet` |
| Örnek kümeler | üreteçlerin küçük çıktıları, şema + veri kartıyla | `ornekler/` | `python scripts/build_examples.py` |
| Analiz tarifleri | çıktısı sınanmış 15 DuckDB sorgusu | `docs/ANALIZ_TARIFLERI.md` | `python -m verihavuzu.analiz` |

### Başvuru verileri (`tr/`)

| Tablo | Kayıt | Doğrulama | Güven |
| --- | --- | --- | --- |
| `iller` (plaka, ad, bölge, büyükşehir, alan kodları) | 81 | 6 bağımsız kaynakla karşılaştırma | yüksek |
| `ilceler` | 973 | 4 kaynak; 2'siyle harfi harfine aynı | yüksek |
| `aylar`, `gunler` | 12, 7 | Unicode CLDR | yüksek |
| `alfabe`, `sayi_sozcukleri` | 29, 38 | kapalı küme + testler | yüksek |
| `resmi_tatiller` (yalnız sabit tarihliler) | 8 | holidays kitaplığı (2025–2027) | yüksek |
| `para_birimleri` (ISO 4217, yaygın 40) | 40 | 2 kaynak + CLDR adları | yüksek |
| `durak_sozcukler` | 260 | spaCy + stopwords-iso ile karşılaştırma | orta |
| `banka_kodlari` (12 büyük banka) | 12 | schwifty kaydı | orta |
| `adlar` (132 kadın, 150 erkek), `soyadlar` (sentetik veri için; **istatistik değildir**) | 282, 253 | derleyen bilgisi | orta |
| `adres_kaliplari`, `sektorler`, `urun_kategorileri`, `kurgusal_markalar`, `destek_kaliplari` | 150, 16, 24, 20, 42 | tasarım (olgu iddiası yok) | orta |

Ayrıntı ve dışarıda bırakılanların gerekçesi: [`docs/BASVURU_VERILERI.md`](docs/BASVURU_VERILERI.md).
Kaynaklarla yeniden karşılaştırma (ağ ister): `python scripts/verify_reference.py`.

### Komutlar (`python -m verihavuzu <komut>`)

| Komut | Ne yapar |
| --- | --- |
| `uret <varlik>` | sentetik veri üretir (`--kirli`, `--excel-tr`, `--sema`, `--bicim csv/jsonl/json/parquet`) |
| `dogrula <dosya>` | şemaya (`--sema`) ve denetim dosyasına (`--denetim`) göre doğrular; Türkçe Markdown + JSON rapor |
| `profil <dosya>` | sütun profili: tür, eksik, tekillik, dağılım, aykırı değer, kişisel veri ipucu |
| `kayma <ref> <yeni>` | PSI ve KS ile dağılım kayması |
| `maskele <dosya>` | kişisel veriyi bulur; maskeler, siler ya da tutarlı takma ad verir |
| `temizle <dosya>` | boşluk, bozuk kodlama, tarih/sayı biçimi, yinelenenler |
| `ayir <dosya>` | zaman, grup ya da katmanlı sızıntısız ayırma |
| `sozluk <sema>` | şemadan Markdown veri sözlüğü |
| `katalog ara/listele/dogrula` | açık veri kataloğu |
| `indir <kimlik>` | Hugging Face'ten indirir (`--ornek N`) — ağ ister |
| `hat listele/calistir` | veri hatları — `calistir` ağ ister |

## Klasör haritası

```
tr/            başvuru verileri: <ad>.json (asıl) + <ad>.csv (kopya) + <ad>.meta.json (kaynak/lisans/doğrulama)
verihavuzu/    Python paketi (sentetik, kalite, hat, katalog, cli)
ornekler/      hazır sentetik kümeler + şema + VERI_KARTI.md + uretim.json
katalog/       kumeler.yaml + dogrulama-2026-11-16.json
docs/          kararlar, mimari, lisanslar, KVKK notları, analiz tarifleri, iş akışı örneği
scripts/       check.py, build_reference.py, build_examples.py, verify_catalog.py, verify_reference.py
tests/         ağsız testler (+ VERIHAVUZU_AG=1 ile açılan ağ testleri)
calisma/       (depoya girmez) önbellek, indirilenler, hat çıktıları, karantina
```

## Sınırlar

- **Dinî bayramlar yok.** Ramazan ve Kurban Bayramı Hicrî takvime ve resmî ilana bağlıdır; hesapla
  üretilen tarih bir gün yanılabilir. `calendar_tr.is_fixed_holiday` yalnız sabit tatilleri bilir.
- **Mahalle ve posta kodu listesi yok.** Yalnız "posta kodunun ilk iki hanesi plakadır" kuralı var
  (73.305 kayıtta doğrulandı); bir posta kodunun gerçekten var olduğunu söyleyemeyiz.
- **Nüfus, yüz ölçümü, koordinat yok** (yıllık değişir ya da kaynaklar ayrışır; kaynak lisansı denetlenmedi).
- **Telefon operatör önekleri yok**; sentetik cep numaraları yalnız biçimsel olarak geçerlidir.
- **Ad/soyad listeleri istatistik değildir**; bağımsız bir kaynakla doğrulanamadı (güven "orta").
- **Banka kodu listesi kısmidir** (12 banka); resmî listeye erişilemedi.
- **Uydurma numaralar gerçek numaralarla tesadüfen çakışabilir** (TCKN, VKN, IBAN, telefon); yalnız
  sağlamaları geçerlidir. E-postalar ayrılmış alan adlarına (`.example`, `.test`) gider.
- **KDV oranları** (%1/%10/%20) yalnız ayar varsayılanıdır; 2026-11-16'da ikincil kaynaklarla teyit
  edildi, resmî metinden değil. Ürün–oran eşlemesi kurgusaldır.
- **Durak sözcük listesi bir tasarım seçimidir**; olumsuzluk sözcükleri (değil, yok) duygu analizinde
  atılmamalıdır.
- **Bulanık yineleme** sıralı komşuluk kullanır; çok büyük tablolarda (≫ 100 bin satır) yavaşlar ve
  pencere dışındaki yinelemeleri kaçırabilir.
- **Kişisel veri bulma** biçim + sağlamaya dayanır: serbest metinde 10 haneli VKN yalnız "vkn/vergi"
  sözcüğü yakınındaysa yakalanır; ad, adres gibi biçimsiz kişisel veriyi BULMAZ.
- **İndirme** dosyaları belleğe alır (dosya başına varsayılan 300 MB sınır); büyük kümeler için
  `datasets` kitaplığı daha uygundur. Erişim onaylı (gated) kümeler `HF_TOKEN` ister.
- **Katalogdaki ticari kullanım kararı hukuki görüş değildir**; kural ve sınırları `docs/LISANSLAR.md`'de.
- Katalog doğrulaması 2026-11-16 tarihlidir; lisans ve indirme sayıları zamanla değişir —
  `python scripts/verify_catalog.py` ile yenileyin.
- Örnek hat yalnız TCMB kurlarını kapsar; GitHub Actions örneği (`docs/ornek-is-akisi.yml`) bu
  ortamda çalıştırılmadı (github.com erişimi yoktu), eylem sürümleri doğrulanmadı.

## Atıf ve lisans

`tr/ilceler.json` turkiye-api'den (MIT), banka unvanları schwifty'den (MIT) alındı; bildirimler
[`tr/ATIFLAR.md`](tr/ATIFLAR.md)'de. Diğer tablolar elle derlenmiş olgusal veridir. Deponun kendi
lisansı proje sahibince belirlenir.
