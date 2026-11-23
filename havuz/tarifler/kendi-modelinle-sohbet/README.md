# Tarif: kendi modelinle sohbet (dil-modeli sunucusu → yz istemcisi)

## Amaç

`dil-modeli` temeliyle eğittiğiniz (ya da örnek) modeli, `yz` temelinin bütün araçlarıyla (sohbet, ölçme,
yapılı çıkarım, ajan, RAG) kullanılabilir kılmak. İki ayrı süreç arasında gerçek HTTP bağlantısı kurulur:
`python -m dil_modeli sun` OpenAI uyumlu bir uç açar, yz'nin `openai_uyumlu` sağlayıcısı ona bağlanır.
Tarifin asıl değeri **sözleşmeyi** (hangi özelliğin desteklendiğini) ölçüp yazmasıdır; örnek modelin
yanıtları anlamsızdır ve bu beklenen bir sonuçtur (aşağıda "Çıktının dürüst yorumu").

## Hangi temeller

| Temel | Ne değişir |
| --- | --- |
| `dil-modeli` | Değişmez; ortamı yalnız sunucu için kurulur (`sun` ekstrası: torch + fastapi + uvicorn) |
| `yz` | Yeni ayar dosyası `yz.dil-modeli.yaml` (profil `dil_modeli`: `127.0.0.1:8430`, `yapili_kip: kapali`, kısa yanıt) |
| `baglanti/` (yeni klasör) | `dene.py`: sunucuyu başlatıp yz komutlarını koşan, sonunda kapatan tek komut |

## Ön koşullar

- Python 3.11+ ve `uv` (torch PyPI'den ~1 GB iner; uv önbelleği varsa saniyeler).
- Kendi modeliniz için: `dil-modeli` ile eğitilmiş bir model klasörü (`config.json`, `model.safetensors`,
  `tokenizer.json`). Örnek model depoda hazır: `dil-modeli/ornek-model`.

## Adım adım

**1. Tarifi uygulayın** (~10 sn; torch uv önbelleğindeyse):

```bash
python havuz/tarifler/tarif.py kur kendi-modelinle-sohbet ~/projeler/model
```

**2. Model sunucusunu başlatın** (1. terminal):

```bash
cd ~/projeler/model/dil-modeli
.venv/bin/python -m dil_modeli sun --model ornek-model
```

Beklenen: `Deneme sayfası: http://127.0.0.1:8430/  ·  API: http://127.0.0.1:8430/v1`. Model adı
`/v1/models` listesinde klasör adıdır (`ornek-model`); `--ad` ile değişir.

**3. yz ile bağlanın** (2. terminal):

```bash
cd ~/projeler/model/yz
.venv/bin/python -m yz modeller --ayar yz.dil-modeli.yaml              # → ornek-model  (dil-modeli)
.venv/bin/python -m yz sohbet --ayar yz.dil-modeli.yaml -m "Merhaba"   # akışlı yanıt
.venv/bin/python -m yz degerlendir gorevler/siniflandirma.yaml --ayar yz.dil-modeli.yaml --sinir 5
```

`degerlendir` tablosu (bu ortamda ölçülen): `Doğruluk %0.0 · Biçim geçerliliği %0.0 · Hata 0 · Gecikme p50
0.03 sn · 413 girdi / 50 çıktı belirteci`. Rapor `.yz/kosular/<ad>-<zaman>/rapor.md` (+ `rapor.html`).

**4. Ya da tek komutla** (proje kökünden; sunucuyu boş kapıda başlatır, üç yz komutunu koşar, kapatır):

```bash
cd ~/projeler/model && python baglanti/dene.py          # kendi modeliniz: --model dil-modeli/calisma/x/en-iyi
```

**5. Kendi modelinize geçiş:** sunucuyu `--model <klasör> --ad <ad>` ile başlatın, `yz.dil-modeli.yaml` →
`model: <ad>` yazın. Ağa açacaksanız sunucuya `DIL_MODELI_ANAHTAR` verin; yz aynı değişkeni okur
(`api_anahtari_ortam: DIL_MODELI_ANAHTAR`; dosyaya anahtar yazılmaz).

## Çıktının dürüst yorumu

Örnek model 1,3 milyon parametreli, Vikipedi metniyle 13 dakika eğitilmiş bir **dil** modelidir; sohbet ya da
talimat için ince ayar görmemiştir. Bu ortamda ölçülenler:

- `yz sohbet -m "Merhaba"` → "Mayıs \n\nMayıs …" ya da "Kültür\n\nK" gibi kendini tekrar eden parçalar.
- Sınıflandırma görevinde 5 örneğin 5'i yanlış; çıktılar "��1.000.000.000.", "Spor Kurk" gibi. Baştaki "�"
  işareti: bayt düzeyindeki model geçersiz bir UTF-8 bayt dizisi üretebiliyor, sunucu bunu yerine-geçen
  karakterle (U+FFFD) çözüyor. Bağlantı hatası **değildir**.
- `yz cikar … --katmanlar istem,alan`: istem katmanı 3 turda JSON alamadı, alan alan sorma katmanı "BAŞARILI"
  dedi ama değerler anlamsız ("ğımızda, \"Bilin\" (beksem)"). **Şemaya uyan çıktı doğru çıktı değildir.**

Sonuç: bağlantı, akış, kullanım sayımı ve hata yolları çalışıyor; model bu işler için **yetersiz**. Kendi
modelinizi aynı komutlarla ölçün; görev kümesi olarak `yz/gorevler/*.yaml` biçimini örnek alın.

## Nasıl doğrulanır

```bash
python havuz/tarifler/tarif.py dogrula kendi-modelinle-sohbet
```

(~1 dk.) Denetlenenler: (1) yz kendi denetimi (yeni ayar dosyası kurallarını bozmuyor mu); (2) gerçek
`dil_modeli sun` süreci boş kapıda; HTTP ile sözleşme: `/v1/models`, akışsız sohbet ve `usage`, SSE akışında
parçalar + son `usage` parçası + `[DONE]`, `tools` → **400**, `response_format` → 200 ama uygulanmıyor
(bilgi olarak kaydedilir); (3) yz'nin GERÇEK komutları ayrı süreçte: `modeller`, `sohbet -m`,
`degerlendir --sinir 5` (sıfır bağlantı hatası), `cikar` (hata izi vermeden, Türkçe bir sonuçla biter);
(4) `baglanti/dene.py` baştan sona.

## Sık sorunlar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `yz modeller`: bağlantı reddedildi | Sunucu kapalı ya da `localhost` IPv6'ya (`::1`) çözülüyor; sunucu yalnız `127.0.0.1` dinler | Sunucuyu başlatın; adreste `127.0.0.1` kullanın (ayar dosyası böyle) |
| `404 … model` ya da yanlış ad | `model` alanı `/v1/models`'taki adla aynı değil | `yz modeller` çıktısındaki adı yazın ya da sunucuyu `--ad` ile başlatın |
| `yz cikar` şema katmanında boşuna 3 tur | Sunucu `response_format`'ı sessizce yok sayar | `yapili_kip: kapali` (bu dosyada öyle) ve `--katmanlar istem,alan` |
| `yz sohbet --arac`: "kip: metin" ve uzun anlamsız çıktı | Sunucu araç çağrısını 400 ile reddeder, yz metin (ReAct) kipine geçer | Beklenen; araç için araç çağrısı destekleyen bir model sunucusu gerekir |
| Yanıt hep kısa kesiliyor | `azami_belirtec: 64` (bilerek kısa) ve sunucu sınırı 512 | Ayar dosyasında artırın; sunucuda `--azami-belirtec` |
| Çıktıda "�" | Bayt düzeyi model geçersiz UTF-8 üretti | Modelin sorunudur; daha iyi eğitilmiş model |
| `401` | Sunucu `DIL_MODELI_ANAHTAR` ile başladı, istemcide yok | Aynı değişkeni yz'nin ortamına da verin |

## Küçük modele yaptırırken

- "Önce `yz/AGENTS.md` → 'Ollama'ya / havuz/dil-modeli sunucusuna bağlan' tarifini oku. yz'nin koduna dokunma;
  yalnız `yz.dil-modeli.yaml`'ı düzenle" deyin. Bağlantı sorununda ilk istek: `yz modeller` çıktısı.
- Kendi görev kümeniz için: "`yz/gorevler/siniflandirma.yaml` + `.jsonl`'yi kopyala, 10–20 örnek, puanlayıcı
  seç, `degerlendir --sinir 3` ile biçimi dene" (yz kuralı: örnek kümeler 10–20 örnek, eğitim verisi değil).
- Modelin çıktısına bakmadan "çalışıyor" dedirtmeyin: `rapor.md`'deki örnek çıktıları okutun.

## Bu tarif ne zaman YANLIŞ seçimdir

- Uygulamanızda gerçekten iş görecek bir yanıt istiyorsanız: dil-modeli'nin minik modelleri bunun için
  değildir; `ince-ayar` temeliyle açık bir modeli uyarlayın ya da yz'yi Ollama/llama.cpp ile bir hazır modele
  bağlayın (yz README). Bu tarif bağlantıyı ve ölçmeyi kurar, kaliteyi değil.
- Çok kullanıcılı bir hizmet planlıyorsanız: dil-modeli sunucusu istekleri **sırayla** işler (aynı anda tek
  üretim); vLLM/llama.cpp gibi bir sunucu gerekir.
- Yapılı çıktı (JSON şeması) ya da araç çağrısı şartsa: bu sunucu ikisini de desteklemez.

## Sınırlar

- Yalnız örnek modelle ve CPU'da denendi; kendi eğittiğiniz büyük bir modelle (GPU) **denenmedi**.
- yz'nin `sun` (sohbet arayüzü + vekil) komutu bu zincirde denenmedi; yalnız komut satırı araçları.
- Ölçülen gecikmeler (p50 0,03 sn) paylaşımlı 4 çekirdekli makinede, 10 belirteçlik yanıtlarla alındı; uzun
  yanıtlarda ve büyük modelde süre katlanır.
- `response_format`'ın sessizce yok sayılması dil-modeli sunucusunun bugünkü davranışıdır (bu tarif onu
  değiştirmez); sunucu ileride reddederse yz bir sonraki katmana kendiliğinden geçer.
