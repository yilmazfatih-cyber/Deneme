# Tarif: CSV'den tahmin servisi (sentetik veri → temizlik → model → HTTP)

## Amaç

Bir tablodan (CSV) tahmin modeli kurup onu başka programların çağırabileceği bir HTTP servisine çevirmek:
`veri` temeliyle kirli müşteri kaybı verisi üretilir, profili çıkarılıp temizlenir, tahmin anında bilinmeyen
(sızıntı) sütun atılır, `ml-temel` ile sızıntısız değerlendirilmiş model eğitilir ve `python -m ml_temel sun`
ile sunulur. Tarif, `ml-temel`'e bu `sun` komutunu ekler.

```
verihavuzu uret churn --kirli → profil → temizle → hat/calistir.py: sızıntı sütununu at
→ ml_temel egit --grup musteri_id → model.npz (pickle'sız) → ml_temel sun → POST /tahmin (şema doğrulamalı)
```

## Hangi temeller

| Temel | Ne değişir |
| --- | --- |
| `veri` | Değişmez (üreteç, profil, temizlik) |
| `ml-temel` | Yeni komut `sun` (`ml_temel/tablo/cli.py`), servis `ml_temel/tablo/serve.py`, girdi şeması `serve_schema.py`, metinler `messages.py`, 17 testlik `tests/test_serve.py`, README ve AGENTS satırları |
| `hat/` (yeni klasör) | `calistir.py` (uçtan uca hat, yalnız standart kütüphane), `ornek_istek.json`, README |

**Karar: standart kütüphane `http.server` (FastAPI değil).** `ml-temel`'in kuralı "çalışma zamanında yalnız
numpy" (`tests/test_rules.py` korur). FastAPI + Pydantic bu kuralı bozardı; girdi şeması zaten eğitilen
modelden geliyor (sütun adları ve türleri model dosyasında), yani sabit bir Pydantic sınıfı yazılamaz. Doğrulama
`serve_schema.py`'de bu şemadan kurulur ve Pydantic'ten sıkıdır: bilinmeyen alan reddedilir, her alan bulunmalı
(bilinmiyorsa `null`), sayı alanına metin/`true`/`NaN` yazılamaz, tarih biçimi denetlenir, hatalar alan
yoluyla listelenir. Model dosyası `np.load(..., allow_pickle=False)` ile okunur (pickle yok).

## Ön koşullar

- Python 3.11+ ve `uv` (yoksa `pip`). Ağ yalnız kurulumda gerekir.
- Kendi verinizde: başlık satırlı bir CSV, tahmin edilecek sütun ve "tahmin anında bilinmeyecek" sütunların
  listesi (iptal tarihi, sonradan doldurulan alanlar, üretecin gizli olasılığı gibi).

## Adım adım

**1. Tarifi uygulayın** (~5 sn):

```bash
python havuz/tarifler/tarif.py kur csvden-tahmin-servisi ~/projeler/tahmin
cd ~/projeler/tahmin
```

**2. Hattı çalıştırın** (üret → profil → temizle → hazırla → eğit; ~10 sn):

```bash
python hat/calistir.py
```

Beklenen satırlar (bu ortamda): `churn: 3000 temiz, 3115 kirli satır, 3345 bozulma`,
`2687 değer düzeltildi, 41 birebir yineleme atıldı`, `4/5 hazırla: 3074 satır; atılan sızıntı sütunları:
['gercek_olasilik']`, `Bitti (5,3 sn). En iyi model: Doğrusal model.` Rapor: `hat/calisma/model/rapor.md`
(sınama ROC-AUC ~0,73, %95 güven aralığıyla; "Hedefi boş olan 135 satır çıkarıldı" uyarısı).

**3. Servisi başlatın:**

```bash
ml-temel/.venv/bin/python -m ml_temel sun --model hat/calisma/model/model.npz
```

Beklenen: `Tahmin servisi hazır: http://127.0.0.1:8445 (uçlar: /saglik, /sema, /tahmin). Durdurmak için Ctrl+C.`

**4. Tahmin isteyin** (2. terminal, proje kökünden):

```bash
curl -s http://127.0.0.1:8445/sema
curl -s http://127.0.0.1:8445/tahmin -H 'Content-Type: application/json' -d @hat/ornek_istek.json
```

Beklenen (bu ortamda ölçülen):
`{"tahminler": [{"_kimlik": "dusuk-risk", "tahmin": "0", "olasiliklar": {"0": 0.989788, "1": 0.010212}},
{"_kimlik": "yuksek-risk", "tahmin": "1", "olasiliklar": {"0": 0.031974, "1": 0.968026}}]}`.
İstek biçimi: `{"satirlar": [{alan: değer, …}]}`; alan listesi `GET /sema`'da; `_kimlik` isteğe bağlıdır ve
yanıtta aynen döner; bir istekte en çok 1000 satır.

**5. Başka makineden erişim:** anahtar verin; anahtarsız ağa açılmaz:

```bash
ML_TEMEL_ANAHTAR='<rastgele-uzun-anahtar>' ml-temel/.venv/bin/python -m ml_temel sun \
  --model hat/calisma/model/model.npz --adres 0.0.0.0
# istemci: -H 'Authorization: Bearer <rastgele-uzun-anahtar>'
```

Önüne HTTPS'li bir ters vekil koyun (anahtar düz HTTP'de açık gider; `tek-sunucuda-yayin` tarifindeki Caddy
örneği). Model değişince servisi yeniden başlatın (model açılışta bir kez okunur).

## Nasıl doğrulanır

```bash
python havuz/tarifler/tarif.py dogrula csvden-tahmin-servisi
```

(~1 dk.) Denetlenenler: (1) `ml-temel` (480 test; yeni `sun` testleri dahil) ve `veri` kendi denetimleri;
(2) `hat/calistir.py` baştan sona; (3) eğitim verisinde sızıntı sütunu yok, temizlik gerçekten değer düzeltmiş,
sınama ROC-AUC 0,65–0,95 arasında; (4) servis boş kapıda ve geçici anahtarla başlar: `curl` ile örnek istek
(düşük riskli müşterinin olasılığı < 0,3 < yüksek riskli), anahtarsız istek **401**, hatalı alanlar **400** ve
alan yolu (`satirlar[0].yas`). `tests/test_serve.py` ayrıca JSON yoluyla CSV yolunun **aynı olasılıkları**
verdiğini, 1 MiB üstü gövdeyi (413), JSON olmayanı (415), `NaN` yazımını, bilinmeyen yolu (404) ve yöntemi (405)
sınar.

## Sık sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `temizle` sonrası CSV'de **tek satır** kaldı | `--yineleme-sutunlari musteri_id` verildi: kimlikler (C000001, C000002…) birbirine "benzer" sayılıp hepsi tek kümede birleşti (bu ortamda 3115 → 1) | Bulanık yinelemeyi kimlik sütununda kullanmayın; ad/soyad/doğum tarihi gibi sütunlarda kullanın |
| Raporda `musteri_id` "grup" ama aynı müşteri birden çok satırda | Kirli veride yinelenen satırlar var | `--grup musteri_id` (hat zaten verir): aynı müşteri hem eğitimde hem sınamada olmaz |
| Model `gercek_olasilik` sütununa en çok dayanıyor | Sızıntı sütunu atılmadı | `hat/calistir.py → SIZINTI_SUTUNLARI`'na ekleyin (aşağıdaki not) |
| `400` "Model bu alanı tanımıyor" | İstekte `musteri_id`, `churn` gibi modelin girdisi olmayan alan var | `GET /sema`'daki alanları gönderin; kimlik için `_kimlik` |
| `400` "Sayı olmalı (ör. 12.5)" | `"12,5"` gibi metin ya da `true` gönderildi | JSON sayısı yazın (`12.5`) |
| `400` "Alan eksik; değeri bilinmiyorsa null yazın" | Bir alan hiç gönderilmedi | `null` yazın: model eksik değeri eğitimdeki gibi doldurur |
| `401` | Servis `ML_TEMEL_ANAHTAR` ile başladı | `Authorization: Bearer <anahtar>` |
| `Address already in use` | 8445 kapısı dolu | `--kapi 8446` (ya da `--kapi 0`: boş kapı; adres açılış satırında) |
| "AYLIK", "tmeel" gibi değerler ayrı kategori | `temizle` yazım hatası düzeltmez | Kategori eşlemesini hazırlama adımında yapın ve **servise gelen isteklere de** aynısını uygulayın |

**Sızıntı notu (bu ortamda ölçüldü):** `gercek_olasilik` atılmadan eğitilen modelde sınama ROC-AUC 0,734
(atılınca 0,730) ve permütasyon öneminde ilk sırada bu sütun. Başarı belirgin artmadı, çünkü sütun etiketin
kendisi değil, üretecin gerçek olasılığıdır; ama model ona dayanır ve üretimde bu değer bilinmediğinden servis
her istekte onu ister: model **kullanılamaz** olur. Sızıntıyı skordan değil, "bu değeri tahmin anında bilir
miyim?" sorusundan yakalayın.

## Küçük modele yaptırırken

- Kendi CSV'niz için: "`hat/calistir.py`'deki `HEDEF`, `GRUP`, `SIZINTI_SUTUNLARI`'nı değiştir ve 1. adımı
  (`uret`) dosyamı `hat/calisma/ham/`'a kopyalayan bir adımla değiştir; başka bir şeye dokunma" deyin.
- Servise uç eklemek: "`ml_temel/tablo/serve.py`'de `do_GET`/`do_POST` dalı + `messages.py`'ye metin +
  `tests/test_serve.py`'ye test; `python scripts/check.py` yeşil" deyin. Kullanıcıya görünen her metin
  `messages.py`'de olmalı (kural testi kullanılmayan/eksik anahtarı yakalar).
- **Dokundurmayın:** `serve_schema.py`'deki "bilinmeyen alan reddedilir / her alan bulunmalı" kuralları,
  `allow_pickle=False`, anahtarın gövde okunmadan denetlenmesi. "Esnek olsun, bilinmeyen alanı yok sayalım"
  önerisini reddedin: yazım hatası sessizce "eksik değer" olur, tahmin bozulur, kimse fark etmez.
- Modelin başarısını raporun "Uyarılar" ve "Sınama sonuçları" bölümünden okutun (`ml-temel/AGENTS.md` →
  "Rapor okuma").

## Bu tarif ne zaman YANLIŞ seçimdir

- Milyonlarca satır ya da saniyede çok sayıda istek: `ml-temel` numpy ile yazılmıştır (scikit-learn'den 2–3 kat
  yavaş) ve servis tahminleri sırayla yapar; scikit-learn/LightGBM + ölçeklenen bir servis seçin.
- Model sürekli (çevrim içi) güncellenecekse: servis modeli açılışta bir kez yükler; yeniden eğitim + yeniden
  başlatma gerekir, sürümleme yoktur.
- Tarayıcıdan doğrudan çağıracaksanız: CORS yok; önüne kendi API'nizi koyun (`belgeye-soru-uygulamasi` tarifindeki
  vekillik kalıbı).
- Açıklanabilirlik (her tahmin için neden) şartsa: servis yalnız olasılık döndürür.

## Sınırlar

- Veri sentetiktir (nedensel yapısı bilinen kurgusal müşteriler); gerçek bir kayıp verisinde **denenmedi**.
- Servis tek süreçlidir; tahminler bir kilitle sırayla yapılır. HTTPS yoktur (ters vekil gerekir). İstek günlüğü
  `http.server`'ın varsayılanıdır (adres ve yol; gövde yazılmaz).
- Kategori yazım hataları düzeltilmez; eğitimde görülmemiş bir kategori hata değil "bilinmeyen" (sıfır satırı)
  sayılır (ml-temel `OneHotEncoder` davranışı).
- Ölçümler (ROC-AUC 0,73, süreler) bu ortamda, tohum 42 ile alındı; makineye ve tohuma göre değişir.
- Windows'ta denenmedi (`hat/calistir.py` `Scripts/python.exe` yolunu tanır ama koşulmadı).
