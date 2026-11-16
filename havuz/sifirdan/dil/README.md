# sifirdan/dil — dil ve metin işleme, sıfırdan

"Bunun içinde ne var?" sorusunu yanıtlayan, baştan sona okunabilir ve **testle kanıtlanmış**
dokuz mini sistem. Hepsi yalnız Python standart kitaplığıyla yazıldı (çalışma zamanı bağımlılığı
yok); her biri tek klasör, kendi README'si, kendi testleri ve mümkün olan her yerde **başvuru
gerçeklemesiyle farksal testi** var (`re`, `json`, `difflib`, kaba kuvvet, iki arka uç…).
Bunlar hem öğretici başvuru hem de küçük bir modelin üstüne özellik ekleyebileceği çekirdeklerdir.

## 5 dakikada çalıştır

```bash
cd havuz/sifirdan/dil
uv venv .venv
uv pip install --python .venv/bin/python -r requirements-dev.lock      # kilitten, sabit sürümler
uv pip install --python .venv/bin/python -e . --no-deps
.venv/bin/python scripts/check.py                                      # ruff + biçim + mypy + pytest
```

(`uv` yoksa: `python -m venv .venv && .venv/bin/pip install -r requirements-dev.lock && .venv/bin/pip install -e . --no-deps`.)

Sonra deneyin (sanal ortam etkinken ya da `.venv/bin/python` ile):

```bash
python -m yorumlayici calistir yorumlayici/ornekler/kapanim_sayac.tohum
python -m sanal_makine dok yorumlayici/ornekler/fibonacci.tohum
python -m regex olc
python -m hesap --tr "1.234,5 * 2"
python -m test_cercevesi test_cercevesi/ornekler -v
```

## Mini sistemler

| Sistem | Ne yapar | Öne çıkan | Kaynak satırı | Test (hızlı) |
| --- | --- | --- | ---: | ---: |
| [yorumlayici](yorumlayici/README.md) | **Tohum**: Türkçe anahtar sözcüklü dil; lexer → Pratt ayrıştırıcı → çözümleyici → ağaç yürüyen yorumlayıcı, REPL | kapanımlar, yol gösteren hata iletileri, 14 örnek program, güvenlik sınırları, sabit katlama | 2 485 | 209 |
| [sanal_makine](sanal_makine/README.md) | aynı dil için bayt kodu derleyici + yığın makinesi + döküm aracı | üst değer yakalama; yorumlayıcıyla **farksal test** (rastgele program üreteci) | 1 177 | 286 |
| [regex](regex/README.md) | desen → Thompson NFA → Pike VM | `(a+)+b` doğrusal; grupları dahil `re` ile **aynı sonuç** (hypothesis) | 1 111 | 117 |
| [json_ayristirici](json_ayristirici/README.md) | RFC 8259 ayrıştırıcı + yazıcı + akış (olay) ayrıştırıcısı | satır/sütun + ipuçlu hata; stdlib `json` ile farksal | 1 003 | 75 |
| [sablon](sablon/README.md) | `{{ x \| süzgeç }}`, if/for/include/set; kapanımlara derlenir | varsayılan HTML kaçışı, `Markup`, kum havuzu, XSS testleri | 1 167 | 72 |
| [markdown](markdown/README.md) | Markdown → güvenli HTML (CommonMark'a yakın + GFM) | ham HTML ve `javascript:` elenir; Türkçe→ASCII başlık kimliği, içindekiler | 1 114 | 73 |
| [hesap](hesap/README.md) | güvenli hesap makinesi (shunting-yard), `eval` yok | birim dönüşümü (uzunluk/ağırlık/sıcaklık), Türkçe sayı biçimi `1.234,5` | 803 | 91 |
| [fark](fark/README.md) | Myers farkı, birleşik fark, yama, sözcük farkı, üç yollu birleştirme | en kısa fark (kaba kuvvetle kanıt), GNU `patch` uyumlu | 679 | 24 |
| [test_cercevesi](test_cercevesi/README.md) | mini test çerçevesi: keşif, fixture, parametrize, raises, zaman aşımı | assert yeniden yazımı ile değer gösterimi; kendini sınar | 834 | 10 |

Ayrıca `tests/test_kurallar.py` (253 kural testi): her dosyada Türkçe başlık + "Genişletme:",
~300 satır sınırı, yalnız standart kitaplık, `eval/exec` yasağı, Türkçe büyük/küçük harf tuzağı,
standart modülü gölgeleyen dosya adı yasağı, görünmez karakter yasağı (§6.11), README bölümleri.

Satır sayıları: `cat <sistem>/*.py | wc -l`; test sayıları: `pytest tests/<sistem> --co -m "not yavas"`
(16 Kasım 2026, bu makinede). Parametreli ve hypothesis testleri tek tek sayılır; hypothesis
testlerinin her biri hızlı denetimde 150, `--uzun`'da 2 000 rastgele örnek dener.

## Ortak ilkeler

- **Farksal test:** her sistem bağımsız bir doğruya karşı sınanır — `regex` ↔ `re`, `json_ayristirici` ↔
  `json`, `fark` ↔ kaba kuvvet LCS ve `difflib`, `sanal_makine` ↔ `yorumlayici`, `hesap` ↔ Python
  float, akış ayrıştırıcı ↔ özyinelemeli ayrıştırıcı.
- **Kötü niyetli girdiye dayanıklılık:** adım/derinlik/boyut sınırları ve testleri (sonsuz döngü,
  derin iç içe yapı, dev sayı, felaket regex, döngüsel include…).
- **Yol gösteren hata iletileri:** konum + ne beklendi + ne bulundu + öneri, Türkçe.
- **Türkçe'ye özgü tuzaklar:** `i/İ`, `ı/I` (kendi `upper_tr/lower_tr` kopyaları), NFC, Türkçe sayı biçimi.

## Klasör yapısı

```
dil/
├─ <sistem>/          her mini sistem: kaynak + README.md (ne, nasıl, harita, sınırlar, buradan nereye)
├─ tests/<sistem>/    o sistemin testleri;  tests/test_kurallar.py  ortak kural testleri
├─ scripts/check.py   tek komutluk denetim (--uzun: yavaş + çok örnekli farksal testler)
├─ docs/KARARLAR.md   neden böyle?  ·  docs/MIMARI.md  sistemler ve veri akışı
├─ AGENTS.md          model için talimatlar
└─ havuz.json         makine için kurulum/denetim bilgisi
```

## Sınırlar

- Saf Python: hız için değil, anlaşılırlık ve doğruluk için yazıldı (ör. regex sıradan desenlerde
  `re`'den 30–180 kat yavaş; ölçümler ilgili README'lerde).
- `yorumlayici` (2 485 satır) ve `sanal_makine` görev metnindeki "300–900 satır" aralığını aşar:
  gerçek bir dil (çözümleyici, 19 yerleşik işlev, REPL, yol gösteren hatalar) bu sınıra sığmadı;
  bunun yerine dosyalar ~300 satırın altında tutuldu. `sablon`, `regex`, `markdown`,
  `json_ayristirici` de ~1 000–1 170 satırdır.
- `sanal_makine`, ön ucu `yorumlayici`'dan alır (kopyalarken ikisini birlikte kopyalayın).
- Her sistemin kendi "Sınırlar" bölümü vardır; bilinçli sapmalar (ör. Markdown'da ham HTML'in
  kaçışlanması) orada yazılıdır. CommonMark resmî test takımı ile karşılaştırma yapılmadı.
- Görev metnindeki "İYİ OLUR" maddelerinden yalnız **sabit katlama** yapıldı
  (`yorumlayici/optimize.py`; iki arka uçta da farksal testle doğrulandı). Tip denetleyici,
  sözdizimi vurgulayıcı (`sozdizimi_vurgu`) ve TOML ayrıştırıcı (`ini_toml`) YAPILMADI.
