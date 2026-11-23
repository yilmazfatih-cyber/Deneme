# Mimari

## Katmanlar ve bağımlılık yönü

```
            cli.py / komutlar.py                     sunucu/ (FastAPI: kapi, durum, bicim, uygulama)
                     │                                          │
     ┌───────────────┼──────────────┬───────────────────────────┼──────────────┐
     ▼               ▼              ▼                           ▼              ▼
  olcum/          stt/            tts/                       indir.py       ayar.py
 (degerlendir,  (uzun, whisper,  (seslendirici, piper_motoru,  (urllib +     (ortam
  hata_orani,    motor, altyazi,  motor, cikti,               sha256)       değişkenleri)
  duzenleme,     tipler)          normallestir/)                │              │
  normallestir,     │              │                            ▼              ▼
  rtf)              │              │                         katalog.py ◄── katalog/modeller.yaml
     │              │              │
     └──────────────┴──────┬───────┘
                           ▼
           ses_isleme/ (ses, wav, yeniden_ornekle, duzey, vad, sessizlik, parcala, ffmpeg, yukle)
                           │
                           ▼
                metin.py (Türkçe harf)   hatalar.py
```

Kural: oklar yalnız aşağı. `ses_isleme` hiçbir üst katmanı bilmez; `olcum` STT'yi yalnız `SttMotoru`
arayüzüyle kullanır; `tts/normallestir` saf metin işidir (ses bilmez) ve ölçümde de kullanılır.
Ağır paketler (faster-whisper, piper-tts, fastapi) yalnız kullanıldıkları işlevin İÇİNDE içe aktarılır:
çekirdek ve testler onlarsız da yüklenir (kural testi her modülü boş durumdan içe aktarır).

## Veri akışları

### 1. Konuşma → yazı (`python -m ses yaziya kayit.m4a`, `POST /v1/audio/transcriptions`)

```
dosya / bayt ──► yukle.ses_yukle ──► WAV mı? ──evet──► wav.wav_oku (süre sınırı başlıktan)
                     │                 └─hayır─► ffmpeg.ffmpeg_ile_coz (-f <tanınan biçim>, -t sınır)
                     ▼
              Ses (float32, n × kanal) ──► mono + yeniden_ornekle → 16 kHz
                     ▼
              stt/uzun.uzun_yaziya
                 ├─ parcala.konusma_parcalari: VAD bölgeleri ± 0,5 sn, ≤ 28 sn gruplar, sessizlik atlanır
                 ├─ her parça: [0,3 sn sıfır] + parça + [0,7 sn sıfır] → motor.yaziya (Whisper, dil=tr)
                 ├─ zamanlar kaydırılır ve parçaya kıstırılır; güvensiz bilinen uydurma atılır
                 ▼
              Transkript (bölütler, sözcük zamanları, uyarılar)
                 ├─► metin / JSON
                 └─► altyazi.ipuclarina_bol ──► srt_uret / vtt_uret
```

### 2. Metin → ses (`python -m ses seslendir "…"`, `POST /v1/audio/speech`)

```
metin ──► normallestir (sayi_kurallari → metin_kurallari; ek.ek_uyumla) ──► okunuş
      ──► motor.cumleler(okunuş, uzunluk_olcegi = perde_orani / hiz)   [Piper: espeak-ng fonem + ONNX]
      ──► her cümle: sessizligi_kirp(30 ms pay) → perde kaydırma (yeniden_ornekle, fs·r → fs)
      ──► cümleler arası sessizlik + baş/son sessizlik ──► lufs_normallestir (−16 LUFS, tepe ≤ −1 dBFS)
      ──► (isteğe bağlı) çıktı hızı ──► cikti.ses_bayt: wav | pcm | ogg/opus | mp3 | flac (ffmpeg)
```

### 3. Ölçüm (`python -m ses degerlendir liste.jsonl`)

```
JSONL satırı (ses, metin, etiket) ──► stt_girdisi ──► uzun_yaziya (Kronometre: işlem süresi)
      ──► olcum.normallestir.olcum_icin (düz / sayılar yazıyla) ──► duzenleme.hizala ──► S, D, I
      ──► Olcum (WER, CER) ──► topla (derlem) ──► rapor.json + rapor.md (etikete göre tablo, RTF)
```

### 4. Model indirme (`python -m ses indir --stt base`)

```
katalog/modeller.yaml (HF deposu, commit, dosya, boyut, sha256, lisans)
      ──► indir.indir: https://huggingface.co/<depo>/resolve/<commit>/<yol> → <ad>.part
      ──► boyut + sha256 tutarsa yerine taşı ──► <model_dizini>/<tür>/<ad>/ + KAYNAK.json
scripts/hf_dogrula.py: aynı kataloğu HF API'siyle karşılaştırır → katalog/hf_dogrulama.json
```

## Sunucu istek yolu

```
istek ──► IstekKapisi (gövde okunmadan): Host/Origin (anahtarsız kip) | API anahtarı | gövde boyu
      ──► FastAPI ucu ──► SunucuDurumu (motor önbelleği) ──► IsSiniri (1 çalışan + 4 bekleyen, fazlası 503)
      ──► hata: SesHatasi → OpenAI biçimli {"error": {...}} (400/404/413/501/503)
```

## Genişletme noktaları (kayıt yerleri)

| Ne | Nereye |
| --- | --- |
| Yeni normalizasyon kuralı | `tts/normallestir/sayi_kurallari.py` ya da `metin_kurallari.py` → `KURALLAR` (`# YENİ KURAL BURAYA`) |
| Yeni kısaltma / birim | `tts/normallestir/kisaltma.py` (`# YENİ KISALTMA BURAYA`) |
| Yeni model / ses | `katalog/modeller.yaml` (`scripts/hf_dogrula.py --oneri` taslağıyla) |
| Yeni CLI komutu | `komutlar.py` + `cli.py` `_KOMUTLAR` (`# YENİ KOMUT BURAYA`) |
| Başka bir STT/TTS motoru | `stt/motor.py` `SttMotoru` / `tts/motor.py` `TtsMotoru` arayüzüne uyan sınıf |
| Yeni ses biçimi | `ses_isleme/ffmpeg.py` `_KODLAYICILAR` + `tts/cikti.py` `MEDYA_TURLERI` |
