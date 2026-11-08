# ADR-006: Görsel atılmadan önce anlamlandırılır (renk + nitelik)

**Durum:** Kabul · 2026-11-08 · gorsel-analist + bas-mimar

## Bağlam

Podyum toplayıcısı her look fotoğrafını belleğe indiriyor, renk modülü varsa renk çıkarıyor ve fotoğrafı atıyor
(ADR-002). Siluet, kumaş görünümü, desen, detay gibi nitelikler çıkarılmıyordu; bu yüzden `parca_nitelik` tablosu boş
kalıyor ve nitelik sinyalleri yalnız rapor kaynaklı (düşük güven) geliyordu. Fotoğrafı saklamak yine yasak.

## Karar

1. **Tek geçişte anlamlandır, sonra at.** Görsel baytı bellekteyken sırasıyla renk (`veri/renk_koprusu.py`) ve
   nitelik (`veri/nitelik_koprusu.py` → `gorsel/etiketle.py`) çıkarılır; ardından bayt düşer. İleride gömme vektörü
   de aynı noktada üretilecek (PLAN §4, `NitelikKaydi.gomme`). Diske, depoya, önbelleğe hiçbir görsel yazılmaz;
   API'ye gönderilen küçültülmüş kopya da yalnız istek süresince bellekte yaşar.
2. **Kapalı sözlük, yapılandırılmış çıktı.** Şema `content/taksonomi.json`'dan üretilir: her eksen `enum`,
   `additionalProperties: false`, bütün eksenler zorunlu (`gorsel/istem.py`). İstek `output_config.format`
   (`json_schema`) ile yapılır; Sonnet 5.5 / Opus 5.5 zorunlu `tool_choice` kabul etmediği için araç zorlaması
   kullanılmaz. Yanıt yine taksonomiyle doğrulanır; sözlük dışı değer `bilinmiyor` olur ve uyarı sayılır.
   Bir karedeki her parça (üst, alt, dış, tam, aksesuar) ayrı kayıt; `parca_konumu` zorunlu.
3. **Kişi işlenmez.** İstem yalnız giysiyi ister; yüz, ten, beden, yaş, cinsiyet, kimlik istenmez ve yazılmaz.
4. **Model seçimi (ADR-004 ile aynı).** Toplu: `claude-sonnet-5-5`; denetim (%5 örneklem, tohum 7):
   `claude-opus-5-5`. Kimlikler koda gömülü değil: `MODA_RADAR_ETIKET_MODELI`, `MODA_RADAR_DENETIM_MODELI`
   (yalnız varsayılanlar kodda). `effort: low` (sınıflandırma işi), uyarlamalı düşünme varsayılan.
   Refusal için sunucu tarafı yedek açık (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`);
   yanıtı hangi model verdiyse `etiketleyen_model` odur.
5. **Maliyet düşürücüler.** Görsel uzun kenarı 1024 px'e küçültülüp JPEG'e çevrilir (görsel token'ı alanla
   ölçeklenir). Sistem istemi + şema her istekte aynı önek: `cache_control` ile önbelleğe alınır. Zaten toplu
   etiketi olan görsel haftalık yeniden taramada tekrar etiketlenmez.
6. **Anahtar.** `ANTHROPIC_API_KEY` yalnız GitHub secret olarak; iş akışında yalnız podyum adımına `env` ile verilir.
   Anahtar ya da `anthropic` paketi yoksa köprü sessizce kapanır (bir kez uyarı), toplayıcı yalnız renk + URL yazar.
   Hiçbir hata (ağ, 4xx, ayrıştırma, refusal) taramayı düşürmez; o görsel için kayıt üretilmez.
7. **Kalite.** `python -m moda_radar etiketle --sezon SS27 --denetim` örneklemi ikinci kez etiketler;
   `etiket-uyum` eksen başına Cohen κ'yı `docs/sezonlar/<SEZON>/etiket-uyum.md`'ye yazar. κ < 0,80 → önce sözlük
   daralır, sonra istem düzelir (ADR-004).

## Maliyet kestirimi

Hacim: defile başına ~40 look × 38 marka × 3 sezon ≈ **4.500 görsel**; denetim %5 ≈ 225 görsel.

Görsel başına token (kestirim; ilk gerçek koşuda `usage` ile ölçülüp güncellenecek):

| Kalem                                       |   Token | Gerekçe                                |
| ------------------------------------------- | ------: | -------------------------------------- |
| Görsel (683 × 1024, 2:3 podyum karesi)      |    ~900 | ≈ piksel / 750–784                     |
| Sistem istemi + şema (sabit önek)           |  ~1.600 | 4,7 bin karakter Türkçe + enum'lu şema |
| Çıktı (3–4 parça JSON + düşük efor düşünme) | 400–900 | 3 parça JSON ≈ 300 token               |

Fiyatlar (Anthropic API, MTok başına): Sonnet 5.5 $2 girdi / $10 çıktı / $0,20 önbellek okuma;
Opus 5.5 $4 / $20 / $0,20.

|                                     | Görsel başına | 4.500 görsel (toplu) | 225 görsel (denetim, Opus) |   Toplam |
| ----------------------------------- | ------------: | -------------------: | -------------------------: | -------: |
| Alt (önbellek isabetli, kısa çıktı) |       ~$0,006 |                 ~$27 |                        ~$3 | **~$30** |
| Orta                                |       ~$0,010 |                 ~$45 |                      ~$4,5 | **~$50** |
| Üst (önbelleksiz, uzun çıktı)       |       ~$0,014 |                 ~$63 |                      ~$6,5 | **~$70** |

TL bandı (kur varsayımı 1 USD ≈ 42 TL; güncel kurla düzeltin): üç sezonun ilk doldurulması **≈ 1.250–2.950 TL**,
orta senaryo ≈ 2.100 TL. Sonraki haftalık koşular yalnız yeni görselleri etiketler; tek sezon ≈ 1.500 görsel
≈ 400–1.000 TL.

## Sonuçlar

- `parca_nitelik` görsel kaynaklı dolar; nitelik sinyalleri rapor yerine sayımdan gelir (güven 0,6–0,9).
- Bedel: API maliyeti (yukarıda) ve dış servise görsel gönderimi. Görsel Anthropic'e yalnız işlenmek için gider;
  depoda yine yalnız URL + etiket vardır.
- Öneri (ROADMAP birikim): geçmiş sezon doldurması için Message Batches API (%50 indirim, gecikmeye duyarsız iş);
  gömme vektörü üretimi.
