# ses — Türkçe ses temeli (internetsiz)

Konuşmayı yazıya çevirir (Whisper), metni Türkçe seslendirir (Piper), sesi ölçer ve düzenler; hepsi
**internetsiz**, CPU'da, lisansı açıkça işaretli modellerle. Uygulamalarınız (ör. Köprü: konuşan pano) için
hazır bir ses hattı: doğru örnekleme hızı, tek kanal, ses yüksekliği (LUFS), sessizlik kırpma, Türkçe
sayı/tarih/para okunuşu, altyazı ve OpenAI uyumlu bir sunucu.

## 5 dakikada çalıştırma

Bu klasörde (`havuz/ses`) sırayla:

```bash
uv venv .venv
uv pip install --python .venv/bin/python -e ".[dev]"
.venv/bin/python scripts/check.py                       # her şey yeşil mi? (ağ ve model gerekmez)
.venv/bin/python -m ses normallestir "23.11.2026'da saat 14:30'da ₺1.234,50 ödendi."
#  → yirmi üç Kasım iki bin yirmi altıda saat on dört otuzda bin iki yüz otuz dört lira elli kuruş ödendi.
```

`uv` yoksa: `python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"`. Sürümleri birebir kurmak için:
`uv pip install --python .venv/bin/python -r requirements.lock` ve ardından `uv pip install --python .venv/bin/python --no-deps -e .`

Modelleri bir kez indirin (ağ gerekir; ~210 MB; sha256 doğrulanır, sonra internet gerekmez):

```bash
.venv/bin/python -m ses indir --stt base --tts tr_TR-dfki-medium
.venv/bin/python -m ses seslendir "Saat 14:30'da ilacını almayı unutma." --cikti ilac.wav
.venv/bin/python -m ses yaziya ilac.wav                   # örn. → İlacını saat 14.30'da almayı unutma.
.venv/bin/python -m ses altyazi video.mp4 --bicim vtt      # mp3/m4a/mp4 için ffmpeg gerekir
.venv/bin/python -m ses sun                                # http://127.0.0.1:8460 (OpenAI uyumlu)
```

ffmpeg (yalnız mp3/ogg/m4a/flac/webm girdisi ve ogg/mp3 çıktısı için): Ubuntu `sudo apt install ffmpeg`,
macOS `brew install ffmpeg`, Windows `winget install ffmpeg`. WAV için gerekmez.

## Neler var?

| Komut | Ne yapar |
| --- | --- |
| `python -m ses yaziya DOSYA [--model small] [--bicim metin\|json\|srt\|vtt]` | Konuşmayı yazıya çevirir (Türkçe; uzun ses parça parça) |
| `python -m ses altyazi DOSYA [--bicim srt\|vtt]` | Ekrana sığan, satırları dengeli altyazı |
| `python -m ses seslendir "METİN" [--hiz 0.9] [--perde 1] [--cikti a.ogg]` | Türkçe seslendirme (hız, perde, cümle arası sessizlik, LUFS) |
| `python -m ses normallestir "METİN" --ayrinti` | Seslendirmede nasıl okunacağını ve hangi kuralın çalıştığını gösterir |
| `python -m ses degerlendir liste.jsonl [--model base]` | Kendi kayıtlarınızla WER/CER/RTF raporu |
| `python -m ses modeller` / `indir` | Katalog: boyut, lisans, ticari kullanım, indirildi mi / indir + doğrula |
| `python -m ses bilgi DOSYA` / `hazirla GIRDI CIKTI` | Ses düzeyi bilgisi / kaydı uygulamaya hazırla (tek kanal, kırpma, LUFS) |
| `python -m ses sun` | `POST /v1/audio/transcriptions`, `POST /v1/audio/speech`, tarayıcı sayfası `/tarayici` |

Kod düzeyinde (ayrıntı `docs/MIMARI.md`):
- **Ses yardımcıları** (`ses/ses_isleme/`): WAV okuma/yazma (16/24/32 bit, float, extensible), yeniden
  örnekleme (Kaiser-sinc, ≥ 80 dB bastırma), LUFS (ITU-R BS.1770-4) ve RMS, sessizlik kırpma, enerji VAD'ı,
  parçalama, güvenli ffmpeg dönüştürücü.
- **Türkçe metin normalizasyonu** (`ses/tts/normallestir/`): sayı, ondalık virgül, binlik nokta, sıra sayısı
  (bağlama göre), tarih, saat, para, yüzde, birim, kesir, telefon, IBAN, kısaltma; kesme işaretli ek okunuşa
  göre yeniden uyumlanır ("100 TL'ye" → "yüz liraya", "4'ü" → "dördü", "Cad.'de" → "caddesinde").
- **Ölçüm** (`ses/olcum/`): WER ve CER (sıfırdan, Türkçe normalizasyonlu, "sayılar yazıyla" seçeneği), RTF.
- **Sunucu** (`ses/sunucu/`): OpenAI uyumlu; varsayılan yalnız 127.0.0.1; isteğe bağlı API anahtarı.

## Modeller ve lisanslar

| Ad | Tür | Boyut | Lisans | Ticari kullanım | Ölçüm (bu temelde, sentetik ses) |
| --- | --- | ---: | --- | --- | --- |
| `tiny` | Whisper (STT) | 78 MB | MIT | evet | sayılı CER %4–9, RTF 0,14 |
| `base` (varsayılan) | Whisper | 148 MB | MIT | evet | sayılı CER %3,0–3,4, RTF 0,23 |
| `small` | Whisper | 486 MB | MIT | evet | sayılı CER %1,7–1,8, RTF 0,81 |
| `medium` | Whisper | 1531 MB | MIT | evet | denenmedi |
| `tr_TR-dfki-medium` (varsayılan) | Piper (TTS) | 63 MB | veri CC BY-NC-SA 4.0 + taban ses lessac | **HAYIR** | RTF ~0,1 |

**Dikkat:** Türkçe için ticari kullanıma açık, doğrulanmış bir Piper sesi bugün yok; `tr_TR-dfki-medium`
yalnız kişisel/araştırma kullanımı içindir. `tr_TR-fahrettin/fettah` sesleri katkıcıların isteğiyle
kaldırıldı — kullanmayın. Seslendirme motoru piper-tts GPL-3.0'dır. Ayrıntı, atıf metinleri ve ticari
seçenekler: [`docs/LISANSLAR.md`](docs/LISANSLAR.md). Ölçümlerin tamamı: [`docs/GERCEK_MODEL_DENEMESI.md`](docs/GERCEK_MODEL_DENEMESI.md).

## Klasörler

```
ses/            paket: ses_isleme, stt, tts (normallestir/), olcum, sunucu, web; cli.py, komutlar.py
katalog/        modeller.yaml (sabit sürüm + sha256 + lisans), hf_dogrulama.json (HF API çıktısı)
scripts/        check.py (denetim), hf_dogrula.py (katalog doğrulama), gidis_donus.py (gerçek model ölçümü)
tests/          çevrimdışı testler; test_gercek_model.py yalnız SES_MODEL=1 ile
veri/           gidiş-dönüş sınama cümleleri ve ölçüm sonuçları
docs/           MIMARI, KARARLAR, LISANSLAR, AYARLAR, TARAYICI, GERCEK_MODEL_DENEMESI
modeller/       (indirilince oluşur; depoya girmez)
```

Model için talimatlar: `AGENTS.md`. Ortam değişkenleri: `docs/AYARLAR.md`. Tarayıcı ve PWA: `docs/TARAYICI.md`.

## Sınırlar

- **İnsan sesiyle ölçülmedi.** Bütün gerçek model ölçümleri Piper'ın sentetik sesiyle (temiz, tek konuşmacı)
  yapıldı; gerçek kayıtlarda (gürültü, aksan, afazili konuşma) hata oranı büyük olasılıkla daha yüksektir —
  `python -m ses degerlendir` ile kendi kayıtlarınızla ölçün. Afazili konuşma için hiçbir ölçüm yok.
- **Birinci tekil ekler** ("yatırdım", "Annem") bu ses + Whisper zincirinde sıkça ikinci tekil ("yatırdın",
  "Annen") yazıldı; anlam değişir. İnsan sesinde durumu bilinmiyor.
- **Ticari Türkçe ses yok** (yukarıda). piper-tts GPL-3.0: Piper'ı içeren bir programı dağıtmak GPL
  yükümlülüğü doğurabilir (hukuki danışmanlık değildir).
- **Konuşmacı ayrımı (diarization) yok.** Enerji/sessizlik tabanlı bir "konuşmacı değişti" sezgisi bilerek
  eklenmedi: duraklama ile konuşmacı değişimini ayıramaz, yanıltır. Uzun duraklar `vad` bölgelerinden görülür.
- **VAD yalnız enerjiye bakar**: müzik, öksürük, durağan yüksek gürültü "konuşma" sayılır; gürültülü ortamda
  kısık konuşma kaçabilir. Parçalama bu yüzden konuşmanın iki yanına 0,5 sn pay bırakır.
- **Normalizasyon kapsamı**: İngilizce sayı biçimi ("1,234.56"), web adresi ve e-posta, kimyasal/matematik
  ifadeler, bağlam isteyen okunuşlar ("1/2" her zaman kesir) desteklenmez; "2.5" "iki nokta beş" okunur.
  Roma rakamı yalnız I, V, X ile ve noktalı sıra sayısı olarak ("XIX. yüzyıl"). Bilinmeyen büyük harfli
  kısaltmanın okunuşu bir sezgidir (`kisaltma.py`).
- **Ses yüksekliği**: tepe −1 dBFS'i aşmamak için kazanç kısılır; sınırlayıcı (limiter) olmadığı için Piper
  sesi −16 LUFS hedefinde genellikle ~−18 LUFS'ta kalır. Tepe ölçümü örnek tepesidir (gerçek tepe değil).
  Tek kanal BS.1770 ağırlığıyla ölçülür (çift-mono +3 dB düzeltmesi yok).
- **Perde kaydırma** biçimlendiricileri de kaydırır; ±3 yarım tonun dışı doğal duyulmaz.
- **Piper sesi her seferinde biraz farklıdır** (gürültü örnekler); aynı metin bayt bayt aynı WAV vermez.
- **Tarayıcı sayfası ve `konus.js` gerçek tarayıcıda/telefonda denenmedi** (bu ortamda ses aygıtı yok; uçtan
  uca tarayıcı testi yok). Sunucunun sayfayı sunduğu ve metinlerin sözlükte olduğu testli.
- Windows, macOS ve GPU denenmedi. `medium` modeli indirilmedi. Uzun (birden çok parçalı) ses gerçek modelle
  denenmedi; parçalama sentetik sinyallerle testli.
- ffmpeg'e giden dosya baytlardan tanınan biçimle sınırlanır ama ffmpeg'in kendi çözücülerindeki olası
  güvenlik açıklarına karşı ayrı bir yalıtım (sandbox) yoktur; sunucuyu güvenilmeyen kullanıcılara açacaksanız
  ffmpeg'i güncel tutun.
