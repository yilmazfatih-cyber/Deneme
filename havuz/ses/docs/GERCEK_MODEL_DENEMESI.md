# Gerçek modellerle gidiş-dönüş denemesi (23 Kasım 2026)

Amaç: metin → Piper sesi → Whisper yazısı zincirini **gerçek modellerle** koşup hattın (normalizasyon,
yeniden örnekleme, parçalama, ölçüm) gerçekte nasıl davrandığını görmek; neyin tutmadığını dürüstçe yazmak.
Küçük örneklem (20 cümle, ~57 sn ses, tek sentetik ses) — sonuçlar bu sese ve bu cümlelere özgüdür, insan
konuşmasına genellenemez.

## Düzen

| | |
| --- | --- |
| Seslendirme | Piper `tr_TR-dfki-medium` (22 050 Hz), piper-tts 1.8.0, onnxruntime 1.32, 2 iş parçacığı |
| Yazıya çevirme | faster-whisper 1.2.1, `tiny` / `base` / `small` (Systran, katalogdaki sabit sürümler), CPU int8, 2 iş parçacığı, `beam_size` 5, dil `tr` zorlanmış, sözcük zamanı kapalı |
| Cümleler | `veri/gidis_donus.jsonl`: 20 kısa gündelik cümle (sayı, tarih, saat, para, yüzde, telefon, sıra sayısı, kısaltma) — bu temel için yazıldı, eğitim verisi değil |
| İki seslendirme kipi | **normal**: bu temelin Türkçe normalizasyonuyla · **ham**: normalizasyonsuz (rakamları espeak-ng kendisi okur) |
| Ölçüt | WER/CER `ses/olcum`; "sayılı" = iki taraf da normalizasyondan geçer ("23 Kasım" = "23.11.2026") — asıl ölçüt |
| Donanım | Paylaşımlı makine, Intel Xeon @ 2,30 GHz, 4 çekirdek (aynı anda başka işler çalışıyor) |
| Komut | `SES_AG=1 .venv/bin/python scripts/gidis_donus.py --stt tiny --stt base --stt small --ham --cikti <klasör>` |
| Ham sonuçlar | `veri/gidis_donus_sonuclari.json` (üç koşunun her cümlesi) |

İndirme: dört dosya grubu (`python -m ses indir`) sha256 doğrulamasıyla, düz HTTPS (Xet yok); 63 MB'lık ses
~7 sn'de indi.

## Sonuç (düzeltilmiş hat, iki koşu: koşu 1 / koşu 2)

| Model | Sayılı WER | Sayılı CER | Düz WER | RTF (koşu 2, temiz) | Model boyutu |
| --- | ---: | ---: | ---: | ---: | ---: |
| tiny | %18,8 / %24,1 | %4,4 / %8,8 | %69,6 / %66,7 | 0,14 | 78 MB |
| base | %14,3 / %18,0 | %3,0 / %3,4 | %34,3 / %40,2 | 0,23 | 148 MB |
| small | %6,8 / %9,0 | %1,8 / %1,7 | %20,6 / %20,6 | 0,81 | 486 MB |

- **RTF** = işlem süresi / ses süresi, model yükleme hariç, yalnız koşu 2 (koşu 1'de aynı anda testler
  koşuyordu, RTF'si kirli). Her cümleye eklenen 1 sn sessizlik dolgusu (K-09) dahil: kısa cümlede bu işi ~%35
  artırıyor; 28 sn'lik parçalarda etkisi ~%4.
- **Seslendirme RTF'si** 0,09–0,11 (normalizasyon + Piper + LUFS; ilk koşuda model yükleme dahil 0,16):
  57 sn ses ~5–6 sn'de.
- **Koşudan koşuya oynama** belirgin (tiny CER %4,4 ↔ %8,8): Piper her sentezde gürültü örnekler, ses her
  seferinde biraz farklı. Tek koşunun sonucuna güvenmeyin.
- "Düz" WER yüksek görünür çünkü model sayıları rakamla yazar ("15 aralıkta") ama doğru metin bazen yazıyla
  bekler ya da tersi; asıl ölçüt sayılı olandır.

## Normalizasyonun etkisi (normal ↔ ham, sayılı CER)

| Model | normal (koşu 1 / 2) | ham (koşu 1 / 2) |
| --- | ---: | ---: |
| tiny | %4,4 / %8,8 | %13,5 / %13,0 |
| base | %3,0 / %3,4 | %8,8 / %9,5 |
| small | %1,8 / %1,7 | %9,1 / %8,0 |

Normalizasyonsuz seste Piper'ın (espeak-ng) yaptığı ve modelin doğru duyduğu hatalar:
- "23.11.2026" → "yirmi üç **nokta** on bir **nokta** iki bin yirmi altı" (tarih tanınmıyor)
- "₺1.234,50" → "bin iki yüz otuz dört …" + anlaşılmaz parça (₺ ve kuruş okunmuyor)
- "3. sınıf" → "üç sınıf" (sıra sayısı değil), "Dr." → "Dere", "13'e 8" → "13 S8" (kesme işaretli ek)
- "0532 123 45 67" → rakam rakam ya da karışık gruplar
Normalizasyonla bunların hepsi doğru okunuyor ve modeller doğru yazıyor (ör. small: "Emekli maaşım 12.500 lira
oldu", "Dr." → "Doktor").

## Bulunan ve düzeltilen hata: son sözcük kesiliyordu

İlk koşuda (düzeltmeden önce) birçok cümlenin son sözcüğü kesikti: "arttı" → "art", "gecikti" → "geci…",
"açık mı?" → "aç", "konuşur musun?" → "konuşuruz". Neden (deneyle ayrıştırıldı, small modelle):
- Sesin tamamı doğrudan verilince doğruydu; bizim `uzun_yaziya` hattımızdan geçince kesikti → hata bizde.
- Parçalama, sesi VAD bölgesine 0,1 sn payla kesiyordu; "arttı"daki kapantıdan (sessiz "tt") sonra gelen kısa
  "-tı" enerji eşiğini aşamıyor, parçanın dışında kalıyordu.
- Ayrıca Whisper ses sessizlikle bitmezse son sözcüğü yarım bırakıyor (aynı sese 1 sn sessizlik eklenince düzeldi).
Düzeltme (`ses_isleme/parcala.py`, `stt/uzun.py`): bölgelere 0,5 sn pay + modele verilen parçaya başta 0,3 sn,
sonda 0,7 sn gerçek sessizlik; zamanlar parçaya kıstırılır; regresyon testi
`tests/test_vad_sessizlik_parcala.py::test_sondaki_kisik_hece_parcada_kalir`. Etki (sayılı CER, önce → sonra):
tiny %9,9 → %4,4–8,8 · base %7,0 → %3,0–3,4 · small %4,9 → %1,7–1,8.

## Normalizasyondan sonra kalan hatalar (hangi tür cümlede?)

1. **Birinci tekil ekler ikinci tekil duyuluyor** — en önemli bulgu: "yatırdım" → "yatırdın", "Torunum" →
   "Torunun", "Annem" → "Annen", "kalktım" → "kalktın" (üç modelde de, iki koşuda da). Sözcük sonundaki /m/
   bu seste /n/'ye benziyor ya da model /n/'ye yatkın. Anlam değişir (ben → sen). Köprü gibi birinci tekil
   cümle kuran bir uygulamada bu sesle üretilen kaydın yazıya çevrilmesi güvenilmez; insan sesiyle ayrıca
   ölçülmeli (bu denemede insan kaydı YOK).
2. **Ses kalitesinden gelen sözcük hataları**: "Randevun" → "Brandevun/Pran Devun", "Kasım" → "Kasın",
   "tablet" → "tabiat/tabi et", "litresi" → "litesi", "Eczane" → "Elzane/Eccane", "İlacını" → "İlaycını".
   Bunlar small'da da sürüyor (üç modelde benzer yanlış duyuş): kaynağı büyük olasılıkla sesin kendisi
   (dfki "medium" kalite) — doğrulanmadı.
3. **Ekli saat**: "Sabah 7'de" → seslendirme "yedide" → tiny/base "hediye" duyuyor; small "7'de" yazıyor.
4. **Saat/sayı biçimi**: model "09:15'te"yi "9-15", "915'te", "9.15'de" yazıyor; "915'te" ölçümde hata sayılır
   (sayılı normalizasyon "dokuz yüz on beş" okur). Saatin kesin biçimi gerekiyorsa yazıdan sonra ayrıca
   ayrıştırılmalı.
5. **Telefon**: tiny bir koşuda numarayı tamamen bozdu ("4-5-6-2-2-3…"); base/small normal kipte doğru.
6. **Gündelik cümleler** (g01, g16, g20) small ve base'de neredeyse hep doğru.

## Ne denenmedi

- **İnsan sesi**: hiçbir gerçek insan kaydıyla ölçülmedi (Piper sesi temiz, gürültüsüz, tek konuşmacı —
  gerçek kayıtta hata oranı muhtemelen daha yüksek; doğrulanmadı). Kendi kayıtlarınızla ölçmek için
  AGENTS.md "Kendi kayıtlarınızla WER ölç".
- `medium` modeli (1,5 GB) indirilmedi; GPU denenmedi; Windows/macOS denenmedi.
- Uzun ses (> 28 sn, birden çok parça) gerçek modelle denenmedi; parçalama yalnız sentetik sinyalle testli.
- Sözcük zamanlarının doğruluğu (altyazı senkronu) yalnız "sıralı ve ses içinde" diye denetlendi
  (`tests/test_gercek_model.py`), elle ölçülmedi.
