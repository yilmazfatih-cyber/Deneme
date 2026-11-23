# Kararlar

Kısa kayıtlar: ne seçildi, neden; hangi seçenek neden elendi.

## K-01 STT: faster-whisper (CTranslate2), CPU'da int8, Türkçe zorlanır
Whisper çok dilli ve Türkçede bilinen en iyi açık modellerden; faster-whisper aynı ağırlıkları CTranslate2 ile
CPU'da int8 çalıştırır (openai-whisper + torch'a göre çok daha hafif kurulum ve hızlı). Dil her zaman `tr`
verilir: kısa seste dil algılama yanılır (ör. Azerice/Türkmence sanabilir). Elendi: openai-whisper (torch ister),
whisper.cpp (derleme ister; bu ortamda kaynaktan derleme yapılmaz), Vosk (Türkçe modeli zayıf).

## K-02 Model boyutu: varsayılan `base`
Ölçüm (docs/GERCEK_MODEL_DENEMESI.md): tiny hızlı ama gündelik sözcüklerde de yanılıyor; small en doğru ama
CPU'da 2 iş parçacığıyla gerçek zamana yakın (RTF 0,81). base (RTF 0,23, sayılı CER ~%3) hız/doğruluk
dengesi için varsayılan.
Doğruluk gerekiyorsa `--model small`. medium katalogda ama burada indirilmedi/denenmedi.

## K-03 Modeller yalnız yerelden; indirme ayrı komut, sabit sürüm + sha256
Çalışırken ağa çıkılmaz (`local_files_only=True`; Piper için ONNX oturumunu biz kurarız). `python -m ses indir`
Hugging Face'ten **commit'e sabitlenmiş** dosyaları indirir ve sha256 doğrular; katalog
`scripts/hf_dogrula.py` ile HF API'sine karşı yeniden doğrulanabilir. İndirici yalnız stdlib `urllib` kullanır:
huggingface_hub'ın Xet aktarımı bu ortamda takılabiliyordu (düz HTTPS ile `HF_HUB_DISABLE_XET=1` aynı etkiyi
verir) ve TTS-yalnız kurulumda huggingface_hub hiç yoktur. Elendi: faster-whisper'ın kendi otomatik indirmesi
(sürüm sabit değil, özet denetimi yok, ilk kullanımda sessizce ağa çıkar).

## K-04 TTS: Piper (piper-tts 1.8) ve tek Türkçe ses
Piper hafif (ONNX), CPU'da gerçek zamanın çok altında çalışır (ölçüm: RTF ≈ 0,06–0,16) ve Köprü zaten onunla
ses üretmiş. `rhasspy/piper-voices`'ta tek Türkçe ses `tr_TR-dfki-medium` ve **ticari kullanıma kapalı**
(docs/LISANSLAR.md). fahrettin/fettah sesleri katkıcıların isteğiyle kaldırılmış; kataloğa "kullanmayın" diye
yazıldı, indirilemez. piper-tts 1.8 GPL-3.0 olduğu için isteğe bağlı ekstra (`tts`) ve tembel içe aktarma.
ONNX oturumunu kendimiz kurarız (iş parçacığı sınırı için); `normalize_audio=False` (Piper her cümleyi ayrı
tepeye büyütüyordu — cümleler arası düzey zıplaması), düzeyi tüm metin için LUFS'la biz ayarlarız.

## K-05 Ses hattı tek biçim: float32, tek kanal; dosya sınırında PCM
Paket içinde ses float32 [-1, 1]; STT girdisi her zaman 16 kHz tek kanal. 16 bit PCM'e yazarken ölçek 2^15 ve
okurken aynı bölen: 16 bitlik veri birebir geri gelir (testli). WAV okuyucu kendimizin (float, 24 bit,
extensible, kesik dosya; `wave` 3.11'de bunları okumaz), yazıcı stdlib `wave`.

## K-06 Yeniden örnekleme: Kaiser-sinc çok fazlı FIR, numpy ile
scipy bağımlılığı eklemek yerine (≈ 60 satır) kendi süzgecimiz: geçirme bandı alt Nyquist'in %90'ı, durdurma
≥ 80 dB, gecikme telafili. Testler: SNR > 75 dB, durdurma > 78 dB, düzlük < 0,01 dB, kaba kuvvet eşitliği.
Hız: 60 sn 48 kHz → 16 kHz ≈ 1,4 sn (paylaşımlı 4 çekirdek). ffmpeg ile gelen biçimlerde dönüştürmeyi ffmpeg
yapar. Elendi: FFT ile tek seferde örnekleme (kenarda dairesel sızıntı), doğrusal ara değerleme (katlanma).

## K-07 Ses düzeyi: BS.1770-4 LUFS (geçitli), tepe tavanı −1 dBFS, sıkıştırma yok
"Basit RMS" sessiz bölümleri de ortalamaya katar; konuşmada yanıltır. LUFS'un K süzgeci libebur128 yöntemiyle
her örnekleme hızı için üretilir (48 kHz'de standarttaki katsayıları 1e-10 içinde verir; tam ölçekli 997 Hz
sinüs −3,01 LUFS). IIR süzgeç kırpılmış dürtü yanıtıyla FFT üzerinden (fark < 1e-7). Hedef −16 LUFS
(telefon/podcast yaygını); tepe −1 dBFS'i aşacaksa kazanç kısılır ve bilgi döner — Piper sesinde bu
çoğunlukla −18 LUFS civarında kalır (tepe/ortalama oranı yüksek). Sınırlayıcı (limiter) bilerek yok.
RMS normalizasyonu da var (`rms_normallestir`) ama varsayılan LUFS.

## K-08 Türkçe metin normalizasyonu: kurallar sırayla, rakam bırakılmaz
Piper'ın (espeak-ng) kendi rakam okuması tarih, para, telefon, sıra sayısı ve kesme işaretli eklerde yanlış
(ölçüldü: normalizasyonsuz seste small modelin sayılı CER'i 2–5 kat yüksek). Kurallar özelden genele:
IBAN → telefon → işlem simgeleri → tarih → saat → IP → noktalı dizi → para → yüzde → birim → kesir → sıra
sayısı → rakam rakam → genel sayı → kısaltmalar → büyük harfli kısaltma → simge. Okunuş kararları:
- Tarih: gün ve yıl asıl sayı ("yirmi üç Kasım iki bin yirmi altı"); ay adı büyük harfle.
- Saat: "14:30" → "on dört otuz", "09:05" → "dokuz sıfır beş", ":00" söylenmez; "14.30" yalnız "saat"ten
  sonra ya da kesme işaretli ekle saat sayılır (TDK saati noktayla yazar, ama "14.30" ondalık da olabilir).
- Telefon grupları virgülle ayrılır (kısa durak: dinleyen yazabilsin); baştaki 0 "sıfır".
- Sıra sayısı: "3." ardından küçük harfli sözcük ya da bilinen büyük harfli sözcük ("Dünya") gelirse sıra,
  yoksa cümle sonu sayılır ("Toplam 3. Sonra…" → "üç."). Roma rakamı yalnız I, V, X ile (CD, MD gibi
  kısaltmalar Roma rakamı sanılmasın).
- Kesir paydadan okunur: "3/4" → "dörtte üç".
- Noktayla ondalık ("2.5") "iki nokta beş" okunur: Türkçe ondalık ayırıcı virgüldür, yanlış anlamı
  seslendirmek yerine yazıldığı gibi okunur.
- Kesme işaretli ek okunuşa göre YENİDEN uyumlanır (`ek.py`): "100 TL'ye" → "yüz liraya", "4'ü" → "dördü",
  "Cad.'de" → "caddesinde". Elendi: eki olduğu gibi bırakmak ("yüz lirae"), eki atmak (anlam kaybı).
- Büyük harfli kısaltma: ünlüsüz, 2 harfli ya da Türkçe heceye uymayan öbekle biten → harf harf
  ("ABD" → "a be de"); okunabilir → sözcük ("NATO" → "nato"). İstisnalar sözlükte.

## K-09 Uzun ses: kendi VAD'ımızla ≤ 28 sn parçalar, 0,5 sn pay, gerçek sessizlik dolgusu
Whisper 30 sn pencereyle çalışır ve uzun sessizlikte uydurur. Parçaları sessizliklerden bölüyor, sessizliği
modele vermiyoruz. **Ölçümle bulunan hata:** ilk sürüm parçayı konuşma bölgesine 0,1 sn payla kesiyordu;
"arttı"daki kapantıdan sonra gelen kısa "-tı" enerji eşiğinin altında kalıp dışarıda kalıyor ve son sözcük
kesik çıkıyordu (base: sayılı WER %19,6). Çözüm: bölgeye 0,5 sn pay + modele verilen parçanın başına 0,3 sn,
sonuna 0,7 sn gerçek sıfır eklemek (Whisper ses sessizlikle bitmeyince son sözcüğü yarım bırakıyordu); zamanlar
parçaya kıstırılır. Sonra (iki koşu): base sayılı WER %14,3–18,0, CER %3,0–3,4; small WER %6,8–9,0,
CER %1,7–1,8 (docs/GERCEK_MODEL_DENEMESI.md). Bedeli: kısa cümlede ~%35 fazla işlem (dolgu).
faster-whisper'ın Silero VAD'ı kullanılmadı: ayrı ONNX modeli, parça sınırı üzerinde denetim yok; enerji
VAD'ı bağımlılıksız ve testli. Bilinen Türkçe uydurma kalıpları ("Altyazı M.K." vb.) yalnız güvensizse atılır.

## K-10 VAD gürültü tabanı: 300 ms kayan ortalamanın en küçüğü + üst sınır
İlk sürüm tabanı çerçevelerin %10'luk dilimiyle tahmin ediyordu; sesin %10'undan azı sessizse taban konuşmaya
denk gelip HİÇ konuşma bulunmuyordu (parçalamada tüm ses düşerdi — en kötü hata). Şimdi taban kayan
ortalamanın en küçüğü ve eşik, en yüksek çerçevelerin 6 dB altını geçemez: yanılırsa "her yer konuşma" der
(zararsız), "hiç konuşma yok" demez.

## K-11 Sunucu: OpenAI uyumlu uçlar, yz/kapi.py'den güvenlik, iş sınırı
`/v1/audio/transcriptions` (json, text, srt, vtt, verbose_json) ve `/v1/audio/speech`. Güvenlik `havuz/yz`'den
kopyalandı: anahtarsız kipte yalnız 127.0.0.1/localhost adı (DNS yeniden bağlama) ve aynı köken (CSRF);
anahtar `hmac.compare_digest`; gövde sınırı gövde okunmadan önce (Content-Length) ve okunurken. Ek olarak:
yüklenen dosyanın biçimi baytlardan tanınıp ffmpeg'e `-f` ile verilir (m3u8/concat gibi başka dosya açan
okuyucular kapalı, `-protocol_whitelist file`); ses süresi sınırı (varsayılan 30 dk) veri belleğe alınmadan
uygulanır (küçük ama çok uzun sıkıştırılmış dosya belleği dolduramaz); aynı anda 1 iş + 4 bekleyen, fazlası
503 + Retry-After. Seslendirmede OpenAI'nin varsayılanı mp3'tür; biz **wav** dönüyoruz (ffmpeg gerektirmez).
Bilinmeyen model/ses adları ("whisper-1", "alloy") varsayılana düşer (OpenAI istemcileri değiştirmeden çalışsın).

## K-12 Ölçüm: WER/CER sıfırdan, iki normalizasyon
Düzenleme uzaklığı numpy ile satır satır (eklemeler birikimli en küçükle), geri izlemeyle S/D/I. Türkçe
normalizasyon: Türkçe küçük harf (İ → i, I → ı), şapka düzleme, kesme işaretinin silinip ekin birleşmesi
("Ankara'ya" = "Ankaraya"), noktalama. "Sayılar yazıyla" seçeneği iki tarafı da seslendirme
normalizasyonundan geçirir: modelin "23 Kasım"ı ile doğru metnin "23.11.2026"sı eşitlenir. Rapor ikisini de
verir; asıl ölçüt sayılı olandır (yazım biçimi farkını hata saymaz). Toplu oran = toplam hata / toplam N.

## K-13 Tarayıcı: önce cihazın sesi, sonra sunucu, sonra sessiz
`ses/web/konus.js`: Web Speech API'de Türkçe ses varsa (çevrimdışı olan öncelikli) onu kullanır; yoksa
`/v1/audio/speech`'e düşer; o da yoksa "yok" döner ve arayüz metni gösterir. Bağımlılıksız tek ES modülü,
PWA'ya kopyalanır. Tarayıcıda uçtan uca test bu temelde YOK (README Sınırlar).
