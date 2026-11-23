# Lisanslar — modeller, sesler, kütüphaneler

**Hukuki danışmanlık değildir.** Aşağıdakiler 23 Kasım 2026'da kaynaklarından okunarak yazıldı; her satırda
nereden okunduğu var. Ticari bir ürün çıkarmadan önce bir hukukçuya danışın.

## Özet (önce bunu okuyun)

| Ne | Lisans | Ticari kullanım | Not |
| --- | --- | --- | --- |
| Bu temelin kodu (`ses/`, `scripts/`, `tests/`) | MIT | evet | |
| Whisper modelleri (tiny, base, small, medium) | MIT | **evet** | atıf önerilir |
| `tr_TR-dfki-medium` (tek Türkçe Piper sesi) | veri: CC BY-NC-SA 4.0 + taban ses lessac | **HAYIR** | iki ayrı engel (aşağıda) |
| `piper-tts` paketi (seslendirme motoru) | GPL-3.0-or-later | dikkat | dağıtım GPL yükümlülüğü getirir |
| `faster-whisper`, `ctranslate2`, `onnxruntime` | MIT | evet | |
| `ffmpeg` (sistem programı, ayrı süreç) | LGPL/GPL (derlemeye göre) | dikkat | ayrı süreç olarak çağrılır |

**Türkçe seslendirme için bugün ticari kullanıma açık, doğrulanmış bir Piper sesi YOK.** Piper projesinin
kendi "ticari kullanım" listesinde (docs/COMMERCIAL_USE.md, 2026-11-23'te okundu) Türkçe ses bulunmuyor.
Ticari ürün için seçenekler en sonda.

## Konuşma → yazı: Whisper (faster-whisper / CTranslate2)

| Model | HF deposu (sabit sürüm) | Boyut | Lisans | Ticari |
| --- | --- | ---: | --- | --- |
| tiny | `Systran/faster-whisper-tiny` @ `d90ca5f` | 78 MB | MIT | evet |
| base | `Systran/faster-whisper-base` @ `ebe41f7` | 148 MB | MIT | evet |
| small | `Systran/faster-whisper-small` @ `536b066` | 486 MB | MIT | evet |
| medium | `Systran/faster-whisper-medium` @ `08e178d` | 1531 MB | MIT | evet (bu ortamda denenmedi) |

Nereden okundu:
- Systran depolarının model kartı etiketi `license: mit` (HF API, `katalog/hf_dogrulama.json`). Kart, ağırlıkların
  `openai/whisper-*` modellerinden `ct2-transformers-converter` ile dönüştürüldüğünü söyler.
- OpenAI'nin özgün deposu (raw.githubusercontent.com/openai/whisper, README "License" bölümü): *"Whisper's code and
  model weights are released under the MIT License."* LICENSE dosyası: MIT, © 2022 OpenAI.
- Not: Hugging Face'teki `openai/whisper-base` kartının etiketi `apache-2.0` diyor; özgün kaynak (OpenAI GitHub)
  MIT dediği için MIT esas alındı. İkisi de ticari kullanıma izin verir.

Atıf metni (önerilen): *"Konuşma tanıma: OpenAI Whisper (MIT lisansı), CTranslate2 dönüşümü Systran/faster-whisper."*

## Metin → ses: Piper sesleri

### `tr_TR-dfki-medium` — TİCARİ KULLANIMA KAPALI

| Alan | Değer |
| --- | --- |
| Depo | `rhasspy/piper-voices` @ `e9c8a39` (`tr/tr_TR/dfki/medium/`) |
| Dosyalar | `tr_TR-dfki-medium.onnx` (63,2 MB), `.onnx.json`, `MODEL_CARD` — sha256'lar `katalog/modeller.yaml`'da |
| Veri kümesi | DFKI, github.com/marytts/dfki-ot-data — **CC BY-NC-SA 4.0** (sesin `MODEL_CARD` dosyası) |
| Eğitim | *"Finetuned from U.S. English lessac voice (medium quality)"* (aynı `MODEL_CARD`) |
| Ticari | **Hayır** |

Neden iki engel var (Piper'ın kendi belgelerinden, raw.githubusercontent.com/OHF-Voice/piper1-gpl, 2026-11-23):
1. **Veri kümesi CC BY-NC-SA 4.0**: "NC" ticari olmayan kullanım demektir; "SA" türetilen işin aynı lisansla
   paylaşılmasını ister.
2. **Taban ses lessac**: Piper'ın `docs/LICENSING.md` dosyasına göre `en_US-lessac-medium`, Lessac Blizzard 2013
   verisiyle eğitilmiştir ve bu verinin lisansı kullanımı "konuşma teknolojileri araştırması" ile sınırlar ve
   ortaya çıkan sentezin ticari kullanımını dışlar. lessac'tan ince ayarlanan her ses bu zinciri taşır.
3. Piper projesi seslere kendi adına lisans **vermez**: *"The Piper project makes no license grant of its own over
   voice models"*; hakları ses verisi ve sesi eğiten kişi belirler.

Bu ses kişisel kullanım, araştırma ve deneme içindir. Köprü'nün hazır sesleri de bu sesle üretilmiştir (depo
kökündeki README "Lisanslar": *"ticari kullanım için başka bir ses gerekir"*) — bu temel o notu doğruladı.

Sesi yeniden dağıtırsanız (ör. `.onnx`'i bir uygulamayla birlikte verirseniz) **`MODEL_CARD`'ı yanında verin**:
Piper belgelerine göre lisans bilgisi yalnız orada durur. İndiricimiz `MODEL_CARD`'ı da indirir.

Atıf metni (kişisel/araştırma kullanımında): *"Ses: Piper tr_TR-dfki-medium; veri: DFKI (marytts/dfki-ot-data),
CC BY-NC-SA 4.0; taban ses: en_US-lessac."*

### Geri çekilen Türkçe sesler — KULLANMAYIN

`tr_TR-fahrettin-medium` ve `tr_TR-fettah-medium`, `rhasspy/piper-voices` deposundan **30 Aralık 2025'te
katkıcıların isteğiyle kaldırıldı** (commit `b145f2ac26`: *"Remove fahrettin and fettah voices at request of
contributors"*; HF commit geçmişinden okundu). Başka depolarda (ör. `speaches-ai/…`, `csukuangfj/…`) kopyaları
duruyor ve eski `MODEL_CARD`'ları "CC0" yazıyor; ama sesin sahipleri yayından çekilmesini istediği için bu temel
onları indirmez (`python -m ses indir --tts tr_TR-fahrettin-medium` → açıklamalı hata).

### İncelenip kataloğa ALINMAYAN topluluk sesleri

| Depo | Etiket | Neden alınmadı |
| --- | --- | --- |
| `dcx514ai/piper_tts_turkish_high` | MIT | Konuşmacı ("Cem", 4490 cümle) ve kaydın kaynağı/izni yazmıyor |
| `dcx514ai/piper_tts_turkish_xlow` | CC-BY-4.0 | Veri kümesi belirtilmemiş |
| `99eren99/piper-turkish-tts` | yok | Lisans yok |

Etiketin MIT ya da CC-BY olması yetmez: kayıtların kime ait olduğu ve izni bilinmiyorsa ticari kullanım
güvenli değildir. Sahibine yazıp verinin kaynağını öğrenirseniz kataloğa ekleyebilirsiniz (AGENTS.md tarifi).

## Kütüphaneler (kurulu sürümlerin paket bilgisinden, 2026-11-23)

| Paket | Sürüm | Lisans | Nerede |
| --- | --- | --- | --- |
| numpy | 2.5.5 | BSD-3-Clause (+ alt bileşenler) | çekirdek |
| pydantic | 2.14.4 | MIT | çekirdek |
| PyYAML | 6.0.4 | MIT | çekirdek |
| faster-whisper | 1.2.1 | MIT | `stt` ekstrası |
| ctranslate2 | 4.9.1 | MIT | `stt` |
| tokenizers | 0.23.3 | Apache-2.0 | `stt` |
| huggingface-hub | 2.4.0 | Apache-2.0 | `stt` (biz indirmede kullanmıyoruz) |
| av (PyAV) | 19.0.2 | BSD-3-Clause; tekerleği FFmpeg kitaplıklarını içerir (o kitaplıkların lisansı **doğrulanmadı**) | `stt` (faster-whisper bağımlılığı) |
| onnxruntime | 1.32.0 | MIT | `stt`, `tts` |
| **piper-tts** | 1.8.0 | **GPL-3.0-or-later** (PyPI bilgisi; depoda COPYING = GPLv3) | `tts` |
| fastapi | 0.165.0 | MIT | `sunucu` |
| uvicorn | 0.54.0 | BSD-3-Clause | `sunucu` |
| python-multipart | 0.0.34 | Apache-2.0 | `sunucu` |

### piper-tts neden GPL ve ne anlama gelir

PyPI bilgisine göre piper-tts 1.2.0 MIT'ti (rhasspy/piper); 1.3.0'dan beri GPL-3.0-or-later'dır
(OHF-Voice/piper1-gpl) ve espeak-ng'yi (GPL-3.0) içine gömer (kurulu pakette `espeakbridge.so`, `espeak-ng-data/`). Bu temel piper-tts'i **isteğe bağlı** (`tts` ekstrası) ve **tembel** içe aktarır
(`ses/tts/piper_motoru.py`); çekirdek, STT ve ölçüm kısmı onsuz çalışır.
- Piper'ı içeren bir programı **dağıtırsanız** (kurulum paketi, uygulama), GPL yükümlülükleri o programa da
  uzanabilir (kaynak kodunu GPL ile verme). Hukuki yorum gerektirir.
- Sunucuda çalıştırıp yalnız **ses dosyası üretmek** dağıtım değildir; GPL (AGPL değil) ağ kullanımını
  kapsamaz. Üretilen sesin lisansını motor değil, **ses modeli** (yukarıda: dfki → ticari değil) belirler.
- Köprü gibi bir PWA'ya yalnız önceden üretilmiş ses dosyaları konursa piper-tts dağıtılmış olmaz.

### ffmpeg

Sistemdeki `ffmpeg` programı ayrı bir süreç olarak çağrılır (kütüphane olarak bağlanmaz); kodumuzun lisansını
etkilemez. ffmpeg'i uygulamanızla birlikte dağıtırsanız onun lisansına (derlemeye göre LGPL ya da GPL) uyun.

## Ticari bir Türkçe ses için seçenekler

1. **Kendi kaydınız** (Köprü'nün "ailenin sesi" yaklaşımı): `python -m ses hazirla` kayıtları tek düzeye getirir.
2. **Cihazın kendi sesi** (Web Speech API): telefonun yerleşik Türkçe sesi; lisans cihaz üreticisinin.
   Bkz. `docs/TARAYICI.md`.
3. **Kendi Piper sesinizi eğitmek**: veri kümesi ticari kullanıma açık (CC0/CC BY) **ve** taban ses lessac
   olmamalı (Piper'ın önerdiği tabanlar: `nl_BE-rdh-medium` CC0, `en_US-hifi_tts_92-medium` CC BY 4.0).
   Piper'ın retrain çalışması sürüyor; Türkçe için `rhasspy/piper-voices` tartışmalarında sorulabilir.
4. Ticari lisanslı bir bulut hizmeti — internet ister, bu temelin "internetsiz" ilkesiyle çelişir.
