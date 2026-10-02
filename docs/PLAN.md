# Afazi Uygulaması — Ürün ve Geliştirme Planı

2 Ekim 2026 · @fatih · Çalışma adı: **Köprü**

## Özet ve vizyon

Kelime bulmakta zorlanan afazili yetişkinlerin bugün resimlerle kendini ifade etmesini ve zamanla kelimelerini geri
kazanmasını sağlayan, telefondan tarayıcıyla açılan, ana ekrana eklenince internetsiz de çalışan Türkçe bir web uygulaması.

**İki amaç**

1. **İfade et (birincil):** Kişi aklındakini resim seçerek bulur, cihaz sesli söyler. Temel bir ihtiyaç en fazla
   3 dokunuşta, yardımsız ifade edilir.
2. **Öğren (ikincil):** Kişinin kendi hayatından kelimelerle, ipuçlarıyla desteklenen 10–15 dakikalık günlük pratik yolculuğu.

**Bağlayan fikir:** Panoda sık seçilen kelimeler öğrenme yolculuğuna öneri olarak düşer. Yolculukta öğrenilen kelimeler
panoda "artık söyleyebiliyorsun" işaretiyle görünür. Pratik, gerçek iletişim ihtiyacından beslenir.

### Başarı ölçütleri (MVP)

| Ölçüt                         | Hedef                                                           |
| ----------------------------- | --------------------------------------------------------------- |
| Temel bir ihtiyacı ifade etme | ≤ 3 dokunuş, ≤ 10 saniye                                        |
| Bakım verenin ilk kurulumu    | ≤ 15 dakikada 10 kişisel öğe                                    |
| Pratik düzeni                 | Haftada ≥ 3 gün, oturum başına 10–15 dakika                     |
| Kelime kazanımı               | 4 haftada kişisel hedef kelimelerde ipucusuz adlandırmada artış |
| Kullanılabilirlik             | 5 afazili kullanıcıyla testte görev tamamlama ≥ %80             |

**MVP kapsamı dışında:** konuşma tanıma, bulut senkronizasyonu, Türkçe dışındaki diller, ayrı terapist paneli,
App Store / Google Play sürümü.

## Kullanıcılar

Afazili kişi uygulamayı kullanır, bakım veren kurar ve kişiselleştirir, terapist hedef belirler; konuşma partneri ekrana bakar.
Afazi çoğunlukla inme sonrası ortaya çıkar; zekâyı değil dile erişimi etkiler (anomi). Tasarımı belirleyen eşlik eden durumlar:
sağ tarafta güçsüzlük (sol elle, tek elle kullanım), görme alanı kaybı, okuma ve yazma güçlüğü, çabuk yorulma,
değişken anlama düzeyi.

**Personalar:** Ayşe (67, inme sonrası 8. ay, "su", "ilaç" gibi kelimeleri bulamıyor, sol elini kullanıyor; hedefi
torunuyla konuşmak) · Mehmet (54, anomik afazi, eski muhasebeci; hedefi yarı zamanlı işe dönmek) · Zeynep (38, Ayşe'nin
kızı; akşamları 15 dakikada kurulum yapmak, annesinin hangi kelimeleri çalıştığını görmek istiyor).

## Ürün ilkeleri

On ilke [`CLAUDE.md`](../CLAUDE.md) dosyasındadır; dört ajanın ortak anayasasıdır.

## Modül A — Görsel iletişim panosu

| Ekran            | Amaç                                 | Temel öğeler                                                              |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| Ana ekran        | Üç ana yol                           | Konuş, Öğren, Ben kartı; her zaman görünür Evet/Hayır                     |
| Hızlı ihtiyaçlar | Acil ve temel ifadeler tek dokunuşta | Evet, Hayır, Ağrım var, Su, Tuvalet, Yardım, Bekle, Tekrar et, Bilmiyorum |
| Kategori panosu  | Konuya göre seçim                    | 2×3'ten 3×5'e ayarlanabilen ızgara; kategori renk kodu                    |
| Cümle şeridi     | Seçilenleri cümleye çevirme          | Üstte şerit; Söyle, Geri al, Temizle                                      |
| Vücut haritası   | Ağrının yeri ve şiddeti              | Ön/arka vücut çizimi; 0–10 yüz ifadeli ölçek                              |
| Partner ekranı   | Karşıdakine gösterme                 | Büyük yazı, ekranı çevir, "Lütfen yavaş konuşun"                          |
| Ben kartı        | Kendini tanıtma                      | "Afazim var. Anlıyorum ama konuşmakta zorlanıyorum."; acil durum kişisi   |
| Kişisel öğe ekle | Bakım veren için                     | Fotoğraf çek, kelimeyi yaz, sesi kaydet                                   |

**Kelime bulma yolları:** kategori ağacı (en fazla 3 seviye), sık kullanılanlar (ayrı satır), ilk harf veya hece,
bağlam sahneleri (Faz 3), zamana göre öneri (Faz 3).

**Türkçe cümle kurma:** Çekim otomatik üretilmez. (1) Her kelime kartı hazır çekimli biçimlerle gelir. (2) Kalıp kartları
seçilebilir ("___ istiyorum", "___ ağrıyor", "___ nerede?", "___ gitmek istiyorum"); kelime seçilince kalıbın hazır biçimi
okunur. (3) Hazır biçim yoksa kelimeler yalın sırayla okunur. (4) Faz 3'te basit bir çekim yardımcısı değerlendirilir.

## Modül B — Kelime öğrenme yolculuğu

Dayanak: Big CACTUS çalışmasında evde kendi kendine yürütülen bilgisayarlı kelime bulma pratiği adlandırmayı iyileştirdi;
iyileşmeyle en çok ilişkili unsurlar egzersizlerin kişiye titizlikle uyarlanması ve kelimelerin işlevsel cümleler içinde
çalışılmasıydı. Kişi pratik ettiği kelimelerde ilerler; kişisel kelimeler en önce gelir.

**Duraklar** (8–12 kelime): 1 Ben ve ailem · 2 Temel ihtiyaçlar · 3 Evim · 4 Mutfak ve yemek · 5 Sağlık ·
6 Dışarıda · 7 Duygular ve sohbet · 8 Hobilerim ve işim. Bakım veren veya terapist sırayı değiştirebilir.

**Bir kelimenin dört aşaması**

| Aşama   | Ne yapılır                          | Sonraki aşamaya geçiş      |
| ------- | ----------------------------------- | -------------------------- |
| Tanı    | Resim–kelime eşleştir, dinle ve seç | Üst üste 2 doğru           |
| Hatırla | İpuçlu adlandırma                   | İpucu ihtiyacı azalıyor    |
| Kullan  | Cümle tamamlama, gündelik senaryo   | Cümle içinde söyleyebildi  |
| Sürdür  | Aralıklı tekrar                     | 14 gün sonra hâlâ söylüyor |

**İpucu basamakları:** (1) resim, süre sınırı yok · (2) anlam ipucu · (3) cümle tamamlama · (4) ilk ses ·
(5) yazılı kelime · (6) model. Varsayılan azalan ipucu (zamanla daha az ipucu); terapist artan ipucuna geçebilir.

**Değerlendirme:** MVP'de konuşma tanıma yok. Kişi veya yanındaki kişi üç düğmeyle işaretler:
Söyledim · Yardımla söyledim · Henüz değil. İsteğe bağlı olarak kendi sesini kaydedip modelle karşılaştırabilir.

**Tekrar planı:** Beş kutu (1, 2, 4, 7, 14 gün). İpucusuz başarı bir kutu ilerletir; ipuçlu başarı yerinde tutar;
"henüz değil" bir kutu geri alır — ekranda asla "kaybettin" yazmaz.

**Oturum:** 10–15 dakika, 8–10 kelime, başarı ~%70–80'de kalacak şekilde otomatik zorluk; yanıt süreleri belirgin
uzarsa "Mola verelim mi?". Her oturum en az üç farklı aktivite türü karıştırır.

**Aktiviteler:** resim–kelime eşleştir, dinle ve seç, ipuçlu adlandırma, cümle tamamla, dinle-tekrar et-kaydet,
otomatik diziler (Faz 2) · anlam özelliği çarkı, hangisi farklı, heceleri diz, sahnede bul, gündelik senaryo (Faz 3).

**Oyunlaştırma:** sakin ve yetişkin. Yok: konfeti, çocuksu karakter, kırmızı çarpı, "seri bozuldu".
Var: sade onay sesi, haftalık özet, "Bugün 9 kelime çalıştın" gibi nötr cümleler.

## Teknoloji

TypeScript (strict) + React + Vite, `vite-plugin-pwa` (Workbox), React Router, IndexedDB + Dexie, Zustand, Zod,
hazır ses dosyaları + Web Speech API, MediaRecorder, Vitest + Testing Library, Playwright + axe, ESLint + Prettier.
Sunucu yok; statik HTTPS barındırma. Ayrıntı ve gerekçe: [`decisions/ADR-001-teknoloji.md`](decisions/ADR-001-teknoloji.md).

**Web'e özgü üç risk:** (1) Türkçe ses her telefonda yok → hazır ses dosyaları + kurulumda ses testi.
(2) Tarayıcı veriyi silebilir → ana ekrana ekleme, kalıcı depolama isteği, tek dokunuşla yedek.
(3) İzinler → ihtiyaç anında açıklamayla istenir; reddedilirse uygulama o özellik olmadan çalışır.

## Görsel tasarım

Bkz. [`design/tasarim-sistemi.md`](design/tasarim-sistemi.md) ve `src/theme/tokens.ts`.

## Ajan ekibi ve kalite kapıları

Bkz. [`CLAUDE.md`](../CLAUDE.md) ve `.claude/agents/`.

## Riskler, etik, gizlilik, lisanslar

| Risk                            | Önlem                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Klinik doğruluk                 | DKT danışmanlığı; içerikçi her yaklaşımı kaynağıyla yazar; hedef kelime ve ipucu sırası ayarlanabilir |
| Tıbbi iddia                     | "Tedavi eder" denmez; "iletişim ve pratik desteği"; açılışta kısa uyarı                               |
| Kişisel sağlık verisi (KVKK)    | Veri yalnızca telefonda; sunucu, analitik, reklam yok                                                 |
| Sembol lisansı                  | Mulberry (CC BY-SA): "Hakkında" ekranında atıf. ARASAAC (CC BY-NC-SA) yalnız ticari olmayan sürümde   |
| Türkçe ses kalitesi             | Hazır ses dosyaları, kurulumda ses testi, telaffuz listesi                                            |
| Veri kaybı                      | Ana ekrana ekleme, kalıcı depolama, ayda bir yedek hatırlatması                                       |
| Ajan çıktısının sürüklenmesi    | Anayasa, klasör sahipliği, tur sınırı, karar kayıtları, her sprintte insan onayı                      |
| Gerçek kullanıcıdan uzak kalmak | Faz 1 ve Faz 2 sonunda 5 afazili kullanıcıyla test                                                    |

**Kullanıcı testlerinde etik:** resimli, afazi dostu bilgilendirilmiş onam; katılımcı istediği an bırakabilir;
bakım veren yanında olabilir; kayıtlar anonim.

## Kaynaklar

- Claude Code — Alt ajanlar, ajan takımları, skills, kurulum: https://code.claude.com/docs
- Big CACTUS: bilgisayarlı afazi terapisinin etkin bileşenleri (JMIR Rehabilitation and Assistive Technologies, 2023)
- Mulberry Symbols — https://mulberrysymbols.org
- ARASAAC — Global Symbols lisans bilgisi
- WebKit — Depolama politikası güncellemeleri
- Readium — Tarayıcı ve işletim sistemlerinde SpeechSynthesis
