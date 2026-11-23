# ses — model talimatları

## Bu temel ne yapar

İnternetsiz Türkçe ses hattı (Python paketi `ses`): konuşmayı yazıya çevirir (faster-whisper, CPU int8,
uzun ses parçalı, sözcük zamanlı, SRT/WebVTT), metni seslendirir (Piper; seslendirmeden önce Türkçe metin
normalizasyonu: sayı, tarih, saat, para, yüzde, telefon, kısaltma, kesme işaretli ek), ses yardımcıları
(WAV, yeniden örnekleme, LUFS, sessizlik, VAD, ffmpeg), WER/CER/RTF ölçümü ve OpenAI uyumlu sunucu.
Bütün testler modelsiz ve ağsızdır (`SahteStt`, `SahteTts`). Model kataloğu sabit sürüm + sha256 + lisanslıdır.

## Komutlar

Hepsi bu klasörden (`havuz/ses`) çalışır.

| Komut | Ne yapar |
| --- | --- |
| `uv venv .venv && uv pip install --python .venv/bin/python -e ".[dev]"` | Kurulum (dev: stt, tts, sunucu ekstraları dahil) |
| `uv pip install --python .venv/bin/python -r requirements.lock && uv pip install --python .venv/bin/python --no-deps -e .` | Kilit dosyasından birebir kurulum |
| `uv pip compile pyproject.toml --extra dev --python-version 3.11 --universal -o requirements.lock` | Bağımlılık değişince kilidi yeniden üret |
| `.venv/bin/python scripts/check.py` | **Tek komutluk denetim**: ruff + biçim + mypy + pytest (ağsız, modelsiz) |
| `.venv/bin/python scripts/check.py --duzelt` | Önce lint/biçim hatalarını otomatik düzeltir |
| `.venv/bin/python -m pytest tests/test_normallestir.py -q` | Tek test dosyası |
| `.venv/bin/python -m ses --yardim` | Komut satırı yardımı (Türkçe) |
| `.venv/bin/python -m ses normallestir "…" --ayrinti` | Metnin nasıl okunacağı + hangi kural |
| `.venv/bin/python -m ses indir --stt base --tts tr_TR-dfki-medium` | Model indir (ağ; sha256 doğrulanır) |
| `.venv/bin/python -m ses sun --sahte` | Sunucuyu modelsiz aç: http://127.0.0.1:8460 |
| `SES_MODEL=1 .venv/bin/python -m pytest tests/test_gercek_model.py` | Gerçek modelle duman testi (indirilmiş model ister) |
| `SES_AG=1 .venv/bin/python scripts/gidis_donus.py --stt base --cikti /tmp/gd` | Gerçek gidiş-dönüş ölçümü |
| `.venv/bin/python scripts/hf_dogrula.py` | Kataloğu HF API'siyle doğrular (ağ) |

## Harita

| Şunu değiştireceksen | Şuraya bak |
| --- | --- |
| Türkçe okunuş kuralı (sayı, tarih, para…) | `ses/tts/normallestir/sayi_kurallari.py` (`KURALLAR`) |
| Kısaltma, birim, harf adı sözlüğü | `ses/tts/normallestir/kisaltma.py` |
| Kesme işaretli ekin uyumu ("TL'ye" → "liraya") | `ses/tts/normallestir/ek.py` |
| Kısaltma/simge kuralı, ön ve son temizlik | `ses/tts/normallestir/metin_kurallari.py` |
| Sayı → yazı (kopya, kaynağında düzeltilir) | `ses/tts/normallestir/sayi_yazi.py` ← `havuz/kutuphane/py/kutuphane/sayi_yazi.py` |
| Seslendirme hattı (hız, perde, sessizlik, LUFS) | `ses/tts/seslendirici.py`, ayarlar `ses/tts/motor.py` (`SesAyari`) |
| Piper bağlantısı | `ses/tts/piper_motoru.py` |
| Çıktı biçimleri (wav, pcm, ogg, mp3, flac) | `ses/tts/cikti.py`, `ses/ses_isleme/ffmpeg.py` |
| Whisper bağlantısı | `ses/stt/whisper.py` |
| Uzun ses parçalama, uydurma süzgeci | `ses/stt/uzun.py`, `ses/ses_isleme/parcala.py` |
| SRT / WebVTT | `ses/stt/altyazi.py` |
| WAV okuma/yazma, PCM dönüşümü | `ses/ses_isleme/wav.py`, `ses/ses_isleme/ses.py` |
| Yeniden örnekleme | `ses/ses_isleme/yeniden_ornekle.py` |
| LUFS / RMS / tepe | `ses/ses_isleme/duzey.py` |
| VAD, sessizlik kırpma | `ses/ses_isleme/vad.py`, `ses/ses_isleme/sessizlik.py` |
| WER/CER, ölçüm normalizasyonu, rapor | `ses/olcum/` (`hata_orani.py`, `normallestir.py`, `degerlendir.py`) |
| Model kataloğu, indirme | `katalog/modeller.yaml`, `ses/katalog.py`, `ses/indir.py`, `scripts/hf_dogrula.py` |
| Sunucu uçları / güvenlik / iş sınırı | `ses/sunucu/uygulama.py` / `kapi.py` / `durum.py` |
| Ortam değişkenleri | `ses/ayar.py`, `docs/AYARLAR.md` |
| Komut satırı | `ses/cli.py` (ayrıştırıcı), `ses/komutlar.py` (gövdeler) |
| Tarayıcı sayfası ve yedek hattı | `ses/web/` (`tarayici.html`, `konus.js`, `sozluk.json`) |
| Türkçe harf dönüşümü | `ses/metin.py` |

## Değişmez kurallar

1. Türkçe harf dönüşümü yalnız `ses.metin.kucuk_tr` / `buyuk_tr`; protokol sözcükleri için `kucuk_ascii`. `str.lower()/upper()` yasak — `tests/test_kurallar.py::test_turkce_harf_donusumu_yalniz_metin_modulunde`.
2. Her kaynak dosya Türkçe başlık yorumuyla açılır ve paket dosyalarında `Genişletme:` satırı vardır — `test_her_dosyanin_baslik_yorumu_var`.
3. Kaynakta görünmez karakter yok; gerekiyorsa `chr(0x200B)` biçimi (araçlar `​` yazınca gerçek karaktere çevirebiliyor) — `test_kaynakta_gorunmez_karakter_yok`; düzeltici: `python havuz/araclar/kacis.py havuz/ses`.
4. Dosya ≤ 400 satır (hedef 300), TODO/boş gövde yok — `test_dosya_uzunlugu`, `test_yarim_is_yok`.
5. Paket İÇİNDE tanımlandığı modülden içe aktar (`from ses.stt.whisper import WhisperMotoru`); ağır paketler (faster_whisper, piper, fastapi) yalnız işlev içinde — `test_her_modul_temiz_durumdan_ice_aktarilir`.
6. Paket içinde ses float32 [-1, 1]; STT motoruna HER ZAMAN 16 kHz tek kanal verilir (`yukle.stt_girdisi`) — `tests/test_stt.py`.
7. Modeller çalışırken yalnız yerelden yüklenir; indirme yalnız `python -m ses indir` (sabit commit + sha256) — `tests/test_indir_ayar_katalog.py`.
8. Katalogdaki her kaydın lisansı, ticari durumu, atıf metni ve lisansın okunduğu yer dolu; Piper sesi `MODEL_CARD`'ıyla indirilir; geri çekilen ses indirilmez — `test_katalog_gecerli_ve_lisanslar_dolu`.
9. Seslendirmeye rakam bırakılmaz: her rakam kalıbının kuralı ve tablo testi var — `tests/test_normallestir.py::test_rakam_kalmaz`, `test_tablo`.
10. Sunucuda güvenlik denetimleri gövde okunmadan önce (`kapi.py`); anahtarsız kip yalnız 127.0.0.1; ffmpeg'e biçim açıkça verilir — `tests/test_sunucu.py`, `tests/test_ffmpeg.py::test_calma_listesi_ve_bozuk_dosya_reddedilir`.
11. Testler ağsız ve modelsiz; gerçek model `SES_MODEL=1`, ağ `SES_AG=1` olmadan atlanır (`tests/conftest.py`).
12. Arayüz metni yalnız `ses/web/sozluk.json`'da — `test_arayuz_sozlugu_eksiksiz`.
13. Kurulu faster-whisper ve piper-tts API'si testle denetlenir; sürüm yükselince önce bu testler — `test_kurulu_faster_whisper_api_si_beklenenle_ayni`, `test_kurulu_piper_api_si_beklenenle_ayni`.

## Tarifler

### Yeni normalizasyon kuralı ekle (ör. "5 TL/kg" → "kilosu beş lira")
Dosyalar: `ses/tts/normallestir/sayi_kurallari.py` (rakamlıysa) ya da `metin_kurallari.py`, `tests/test_normallestir.py`.
1. ÖNCE `tests/test_normallestir.py` `TABLO`'ya `("girdi", "beklenen okunuş")` satırı ekleyin; testi koşun (kırmızı).
2. Kuralın işlevini yazın: `def _yeni(m: re.Match[str]) -> str`; sayıyı `ortak.sayi_oku`, eki `ortak.ekle(okunus, m)` ile okuyun.
3. `KURALLAR`'a `Kural("ad", re.compile(...), _yeni)` ekleyin — DAHA ÖZEL kuralların sonrasına, genel "sayı" kuralının ÖNCESİNE (`# YENİ KURAL BURAYA`). Desen kesme işaretli eki de alacaksa sonuna `+ EK` ekleyin.
4. `.venv/bin/python -m ses normallestir "<örnek>" --ayrinti` ile hangi kuralın çalıştığını görün.
Doğrulama: `.venv/bin/python -m pytest tests/test_normallestir.py -q`, sonra `scripts/check.py`.

### Yeni kısaltma ya da birim ekle
1. `kisaltma.py`: noktalıysa `NOKTALI` (küçük harfle anahtar: `"mah.": ("mahallesi", True)` — ikinci öğe iyelikli bileşik mi: "mahallesinde"), noktasız büyük harfliyse `BUYUK`, sayıdan sonra geliyorsa `BIRIMLER`.
2. Harf harf okunması gereken ama sözcük gibi okunan kısaltma → `HARF_HARF`; tersi → `SOZCUK_GIBI`.
3. Tabloya örnek (ekli hâliyle de: `("Mah.'de", "mahallesinde")`).

### Yeni ses ekle (Piper)
1. Sesi bulun ve **MODEL_CARD'ını okuyun**: `Dataset License` ve `Training` (taban ses) satırları. Taban lessac ise ticari değildir (docs/LISANSLAR.md).
2. `.venv/bin/python scripts/hf_dogrula.py --oneri rhasspy/piper-voices --klasor tr/tr_TR/<ad>/<kalite>` → çıktıyı `katalog/modeller.yaml`'a yapıştırın; `DOLDURUN` alanlarını doldurun (`lisans`, `ticari`, `lisans_kaynagi`, `atif`, `ornekleme`).
3. `.venv/bin/python scripts/hf_dogrula.py` → yeni satır "TAMAM" olmalı (katalog/hf_dogrulama.json güncellenir).
4. `python -m ses indir --tts <ad>` ve `python -m ses seslendir "Deneme." --ses <ad>`.
Doğrulama: `tests/test_indir_ayar_katalog.py` ve `scripts/check.py`.

### Başka bir Whisper boyutu kullan
1. Katalogdaysa (`tiny`, `base`, `small`, `medium`): `python -m ses indir --stt small`, sonra `--model small` ya da `SES_STT_MODELI=small`.
2. Katalogda yoksa: `scripts/hf_dogrula.py --oneri Systran/faster-whisper-<boyut>` → `tur: stt` kaydı ekleyin (lisans: model kartı etiketi).
3. Ölçün: `python -m ses degerlendir <liste.jsonl> --model <boyut>`; RTF'yi rapordan okuyun.

### Sunucuyu bir uygulamaya bağla
1. `SES_SUNUCU_ANAHTARI=<uzun rastgele>` ve gerekiyorsa `SES_IZINLI_KOKENLER=https://uygulamam.example` ile `python -m ses sun --adres 0.0.0.0`.
2. Yazıya çevirme (OpenAI istemcisi de olur): `curl -H "Authorization: Bearer $K" -F file=@kayit.m4a -F response_format=srt http://<sunucu>:8460/v1/audio/transcriptions`.
3. Seslendirme: `curl -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"input":"Merhaba","response_format":"wav"}' http://<sunucu>:8460/v1/audio/speech -o m.wav`.
4. Tarayıcıdan: `ses/web/konus.js`'i kopyalayın (cihaz sesi → sunucu yedek; `docs/TARAYICI.md`).
Doğrulama: `tests/test_sunucu.py` (yeni uç eklediyseniz aynı biçimde test yazın).

### Altyazı üret
`python -m ses altyazi video.mp4 --model small --bicim vtt` (ffmpeg gerekir; çıktı `video.vtt`). Satır uzunluğu `--azami-karakter`, ipucu süresi `--azami-sure`. Kod: `ipuclarina_bol(transkript.bolutler)` → `srt_uret`/`vtt_uret`.

### Kendi kayıtlarınızla WER ölç
1. Kayıtları bir klasöre koyun; aynı klasöre `liste.jsonl` yazın: her satır `{"ses": "k1.wav", "metin": "söylenen metin", "etiket": "ilaç"}`.
2. `python -m ses degerlendir klasor/liste.jsonl --model base --cikti klasor/rapor` → `rapor.md` (etikete göre tablo), `rapor.json`.
3. "Sayılar yazıyla" sütununu esas alın (modelin "23 Kasım"ı ile metnin "23.11.2026"sı eşit sayılır).

### Kaydı uygulamaya hazırla (ör. ailenin sesi)
`python -m ses hazirla ham.m4a hazir.wav --lufs -16 --ornekleme 22050` → tek kanal, baş/son sessizlik kırpılmış, aynı ses yüksekliği. Önce `python -m ses bilgi ham.m4a` ile düzeye bakın.

## Sık yapılan hatalar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| `Whisper modeli bulunamadı … python -m ses indir` | Model indirilmemiş ya da `SES_MODEL_DIZINI` başka yeri gösteriyor | `python -m ses modeller` ile dizini görün; `python -m ses indir --stt base` |
| `ffmpeg bulunamadı` | mp3/ogg/m4a için ffmpeg gerekir | Kurun (README) ya da WAV kullanın; Windows'ta `SES_FFMPEG=<yol>` |
| Seslendirmede rakam/kısaltma yanlış okunuyor | Kural yok ya da sırası yanlış | `normallestir --ayrinti` ile bakın; tarif: "Yeni normalizasyon kuralı" |
| "TL'ye" → "Türk lirasıya" gibi ek hatası | Sözlük değerinde iyelik bilgisi yok | `kisaltma.py`'de değeri `("okunuş", True)` yapın |
| Kural testi: "Görünmez karakter" | Araç ` ` gibi diziyi gerçek karaktere çevirdi | `python havuz/araclar/kacis.py havuz/ses` ya da `chr(0xA0)` yazın |
| Kural testi: "Yasaklı harf dönüşümü" | `.lower()`/`.upper()` kullanıldı | `kucuk_tr`/`buyuk_tr` ya da (uzantı, başlık için) `kucuk_ascii` |
| Son sözcük kesik ("arttı" → "art") | Parça sesi sıkı kesildi ya da sonda sessizlik yok | `uzun.py` dolgu ve `parcala.py` payını küçültmeyin (K-09) |
| Sunucu 403 "yerel kipte çalışıyor" | Anahtarsız sunucuya 127.0.0.1 dışı adla erişildi | `http://127.0.0.1:8460` ya da `SES_SUNUCU_ANAHTARI` |
| Sunucu 503 "meşgul" | Aynı anda çok istek | Bekleyip yeniden deneyin; `SES_BEKLEYEN_IS` / `SES_ES_ZAMANLI_IS` |
| Ses −16 LUFS'a ulaşmıyor (≈ −18) | Tepe −1 dBFS tavanı kazancı kıstı (sınırlayıcı yok) | Beklenen davranış (K-07); `--lufs -18` ile hedefi gerçekçi tutun |
| mypy: `Missing named argument` (Pydantic) | pydantic mypy eklentisi yok | `pyproject.toml` → `plugins = ["pydantic.mypy"]` (var; silmeyin) |

## Bitti tanımı

- [ ] `.venv/bin/python scripts/check.py` yeşil (ağsız, modelsiz, ~1 dk)
- [ ] Yeni kuralın/işlevin testi var (normalizasyonda tablo satırı; sunucuda TestClient + sahte motor)
- [ ] Yeni dosyanın Türkçe başlık yorumu ve `Genişletme:` satırı var
- [ ] Kayıt yerlerinde yeni öğe `BURAYA` yorumunun üstünde (`KURALLAR`, `NOKTALI`, `_KOMUTLAR`)
- [ ] Yeni model/ses: lisans MODEL_CARD'dan okundu, `ticari` doğru, `scripts/hf_dogrula.py` "TAMAM", docs/LISANSLAR.md güncel
- [ ] Gerçek modelle bir şey değiştiyse `SES_MODEL=1` testleri koşuldu; ölçüm docs/GERCEK_MODEL_DENEMESI.md'ye yazıldı
- [ ] Kullanıcıya dönük ileti Türkçe ve ne yapılacağını söylüyor; README "Sınırlar" güncel
