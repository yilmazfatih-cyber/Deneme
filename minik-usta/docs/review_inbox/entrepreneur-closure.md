# entrepreneur — revizyon turu kapanışları

Tarih: 2026-10-04 · Güncellenen dosyalar: `docs/BUSINESS.md` (v2), `docs/NAMING.md` (v2), `docs/STORE_LISTING.md`,
`docs/ANALYTICS.md` (§2 olay tablosu, §3 ortak parametreler). BUSINESS'ta orkestratör kararlarına `OR-nn` diye atıf
yapılır (§0); `R-nn` BUSINESS §11 risk kimlikleridir. Yeni web araması yapılmadı; doğrulanamayan kalemler "tahmin" ya da
"doğrulanamadı" diye işaretli.

Özet: 29 yorum satırı · KAPANDI 29 (ikisinde ek olarak proje sahibine AÇIK SORU) · RET 0. Proje sahibine toplam 5 açık soru (sonda).

## product-lead.md → entrepreneur

- product-lead#+5 hamle ve ödüllü reklam (§4.3, §4.5-2) → KAPANDI (reklam yalnız 1. teklifin ödeme alternatifi; reklamla alınan +5 deneme başına 3 uzatma sınırına sayılır; fiyat basamağı uzatma sırasına bağlı; config alanları önerildi — BUSINESS §4.3, §4.5-1/2, P-4)
- product-lead#Köprü harcama tavanı (§4.5-6) → KAPANDI (tavan 4.050 = tek tam eskalasyon, ≈ $8,06 / ≈ 364 TL; `events.json → wobblyBridge.bridgeSpendCapCoins: 4050`; tavanda reklam alternatifi bağımsız — §4.5-6, P-4)
- product-lead#kumbara dolum hızı (§5.3) → KAPANDI (OR-16 varsayılanı: $1,99 / 89,99 TL, kırma 1.000, tavan 2.000, galibiyet başı 50/75/100; "$2,99 uyumlu mu?" sorusunun cevabı: hayır, $1,99 — eşikte altın/$ = Avuç; ≈ Bölüm 36–40'ta kırılabilir; `config:validate` değer kuralı — §5.3, P-3)
- product-lead#içerik sonu (P-8, §9.2) → KAPANDI (hamle = min + 2 kabul; Usta Modu "MVP (onay bekliyor)" + koşullar (a) özgün etiket, (b) Usta Sandığı 250 altın + 1 güçlendirici / 10 galibiyet, (c) giriş kartı; "Sonra" kararında product-lead'in yedek tekrar kuralı yazıldı — §9.2, §12.1, P-8) + AÇIK SORU (kapsam proje sahibinde, OR-17)
- product-lead#LiveOps parametreleri (§7, events.json) → KAPANDI ("pencere" yerine `maxBridgesPerDay` + `cooldownMinutes`; lig ve hafta sonu çarpanları "botlar dahil"; Hafta 8 "günde 2 pencere" → bekleme 60 dk; havuz artışı beklenen pay < 900 korumasına bağlandı — §7, §4.5-8)
- product-lead#B planı (§12.3) → KAPANDI (yalnız S6, sonra S5 kesilir; W8/Y8/S8 kalır; en çok 7 bölüm: 31, 34, 37, 39, 40, 48, 49. G-L yönlendirmesi B planının ilk adımı değil, kendi ölçüm tetiği olan ayrı yedek ("yalnız yavaş düşüş", bölüm 23, 49) — §12.3, P-7)
- product-lead#MVP tablosu K-01…K-33 → KAPANDI ("K-01…K-46 (GDD)" — §12.1)
- product-lead#ödemeyen oyuncu şartı (§5.4) → KAPANDI (OR-16: alt sınır korunur; kontrol ölçüsü medyan bakiye 400–1.500 + kayıp kurtarma karışımı %15–25 / %30–40 / %40–50; bot raporuna "altın / 10 bölüm" ve "+5 sonrası kazanma oranı %70–85" sütunları — §5.4, §6.2, P-11)

## design-lead.md → entrepreneur

- design-lead#S5 / S8 simge ve mağaza görselleri → KAPANDI (S5 yeniden yazıldı: simgede karakter/kask yok, imza hareket; öne çıkan görsel tarifi; "toy box" istemleri çıkar — BUSINESS §3, STORE_LISTING §6)
- design-lead#S2 / S3 sanat ve hikaye tonu → KAPANDI (S15 eklendi: Tuna'nın yaşı oyun içi metin, mağaza ve kreatifte geçmez — §3, P-1) + AÇIK SORU (Tuna'nın görsel yaşı 8 → 10–12; design-lead'in sorusu; benim pozisyonum: destekliyorum ama şart değil, S1–S15 tek başına yeterli)
- design-lead#E5 ve §4.3 eşit düğme boyu ↔ UX §7 → KAPANDI (onay: üç eşit seçenek 920×152, hiyerarşi yalnız renkle, "Az kaldı!" yok, nötr bilgi satırı, Köprü kaybında kural satırı yok — E5, §4.5-4)
- design-lead#E4 bölüm içinde satış penceresi ↔ UX §5 → KAPANDI (E4 kendiliğinden açılan teklifleri kapsar; oyuncunun başlattığı "+" serbest: otomatik açılmaz, bölümü duraklatır, fiyat + gerçek para + eşit boy "Vazgeç" — E4)
- design-lead#E2 gerçek para karşılığı görünümü → KAPANDI (biçim ve konum onaylandı; web MVP TR → TL, EN → USD onaylandı; ayrı `realMoneyPerGold` alanı yerine tek kaynak referans paket `coins_1000` fiyatı, ayrışma olmasın — E2, P-3)
- design-lead#P-5 etiketli botlar ↔ UX §10 → KAPANDI ("Selin_U" türü ad yok; kask + alet avatarı; "Çırak Fındık" / "Apprentice Hazel"; (i) + kural kartı; "çırak" rozeti ilk günden: evet — §4.6, P-5)
- design-lead#S12 yaş ekranı UX'i → KAPANDI (konum, nötr tam sayfa, 4 hane, tuş takımı tarifi S12'ye bağlandı; yalnız mağaza sürümü, OR-23 — S12, P-10)
- design-lead#ad adayları ve sanat yönü (NAMING §5) → KAPANDI (görsel değerlendirme NAMING §5.1'e; EN firma adı "Tuna & Co." onaylandı, TR "Minik Usta İnşaat" hikaye öğesi — NAMING §5.2; Kepche — P-6)
- design-lead#§2 benzerlik kuralları ↔ sanat yönü → KAPANDI (Festival Şatosu ve ozalit kuralları §2'ye; yan yana karşılaştırmaya Hikaye 5 ve oyun ekranı eklendi — §2, P-6)
- design-lead#§12.1 Albüm "Sonra" ↔ UX / STORY / ASSET → KAPANDI (onay, OR-19: kilitli "Yakında" sekmesi; "Albüme eklendi" kartı ve albüm kartı varlıkları Sonra; görev mini sahnesi MVP-lite = yapı belirme + tek satırlık balon — §12.1)
- design-lead#E10 günlük ödül ve LiveOps adları → KAPANDI (kaçırılan gün "bekliyor" gösterimi E10'a; "Kepche's Dig Week"; Hikaye 10 "Gribeton'la Renkli Atölye" — E10, §7, §9.3)

## code-lead.md → entrepreneur

- code-lead#bot davranışının ödemeden bağımsızlığı → KAPANDI (E8 yeniden yazıldı: saf `botSim.ts`, tohum `hash32(eventInstanceId, cohortIndex)`, import yasağı, iki-kayıt eşitlik testi, `event_join` `botSimVersion` + `seedHash` — E8, R-07, ANALYTICS §2)
- code-lead#yaş ekranı P-10 / S12 ülke bilgisi → KAPANDI (ülkeden bağımsız tek kural kabul: < 13 / 13–17 / 18+; SDK'lar onaydan sonra dinamik import; yalnız yaş kovası + onay sürümü saklanır; kovalar 4 → 3 — S12, P-10)
- code-lead#takvim, ekip ve B planı (§10, §12.3, R-09) → KAPANDI (G-L yedeği eklendi; test cihazları Faz 2 başında; §10'a TECH §14 / sanat / MVP eklemeleri mutabakat tablosu; mağaza sürümü paketi +1 hf; toplam 43 hf ≈ 10 ay — §10, §12.3, R-09)
- code-lead#analytics olay listesi → KAPANDI (`ANALYTICS.md` §2 tek kaynak tablo: 24 olay, parametre tipleri, MVP/mağaza etiketi; §3 ortak parametreler; BUSINESS §6.4 tabloya yönlendirir)
- code-lead#Köprü ve reklam sayaçları ("gün" tanımı) → KAPANDI ("gün" = yerel takvim günü; saat geri alınırsa `lastSeenNow`'da dondurma; sayaç anahtarı etkinlik örneği + gün — §4.3)
- code-lead#gerçek para karşılığı (E2) → KAPANDI (MVP: referans paket `coins_1000` USD/TRY alanı + `Intl.NumberFormat` + E9 etiketi; mağaza: SDK mikro-birim fiyatı; şema code-lead'in — E2, §5.1)
- code-lead#isim ve paket kimliği (NAMING §5–§6) → KAPANDI (NAMING §6.1: kimlik isim kararından sonra ve `npx cap init` öncesi, `[a-z0-9.]`, "kids/little/minik" yok, ≤ 12 karakter kısa ad tablosu, `&amp;`, kod adı kimlikleri kalır — P-13, R-20)

## -2 dosyalarında entrepreneur'e değen maddeler

- code-lead-2#kayıt şeması etkisi (`continueSpendCapCoins: 5400`, reklam tavanları "entrepreneur_tbd") → KAPANDI (değer 4.050, alan adı product-lead'in önerdiği `bridgeSpendCapCoins`; reklam tavanları sayı olarak §4.3'te: 1/deneme, 3/gün +5; 2/gün can; 1/gün ×2; toplam 6)
- code-lead-2#config biçimi ("entrepreneur_tbd" dizgeleri) → KAPANDI (benim alanımdaki bütün "tbd" değerleri sayı olarak verildi: BUSINESS §4.3, §5.2–§5.3; belirsiz kalan yok. `null` / `_doc` şeması product-lead + code-lead)
- design-lead-2#kasaba görevleri, c1 t6 tabela `{company}` → KAPANDI (NAMING §5.2 ile uyumlu: TR "Minik Usta İnşaat", EN `{company}` = "Tuna & Co."; görev sayısında OR-07 geçerli, §10 sanat hesabı 35 parça)

## Orkestratör kararlarının uygulanması (yorum değil; kontrol listesi)

- OR-13 bölüm içi devam MVP → KAPANDI (§12.1, P-7, ANALYTICS `level_resume`)
- OR-14 / OR-15 botlar ve teklif etiği → KAPANDI (§4.4–§4.6; P-2, P-4, P-5 "KABUL")
- OR-16 tek değerler → KAPANDI (4.050; kumbara $1,99 / 1.000 / 2.000 / 50-75-100; ödemeyen ölçütü; reklam +5 3 teklife sayılır). İtirazım yok.
- OR-17 Usta Modu "MVP (onay bekliyor)" → KAPANDI (§9.2, §12.1, P-8)
- OR-19 Albüm Sonra → KAPANDI (§12.1)
- OR-23 yaş ekranı yalnız mağaza sürümü + sahte servis arayüzleri MVP → KAPANDI (S12, §8, §12.1, P-10)
- OR-24 EN adlandırma → KAPANDI (P-6, NAMING §5, §5.2; STORE_LISTING)
- OR-07 (35 görev), OR-11 (1.400 ms), OR-20 (debug yalnız geliştirme) etiket tutarlılığı → KAPANDI (§10, §12.1, R-12)
- Kendi tur-1 sözüm (code-lead'e): macOS iOS derleme ortamı bütçesi → KAPANDI (§10, ≈ $1.000, fiyat doğrulanmadı)

## Proje sahibine açık sorular

1. **Usta Modu MVP'de mi?** (OR-17) Önerim: evet (koşullar §9.2). "Sonra" ise yedek tekrar kuralı MVP'ye girer.
2. **Tuna'nın görsel yaşı 8 → 10–12?** (design-lead) Benim için isteğe bağlı; S15 her durumda uygulanır.
3. **Oyun adı** (NAMING §5 ilk 3) ve paket kimliği için **tüzel kişilik adı** (`com.<şirket>.<ad>`); Faz 5 başından önce.
4. **Hedef kitle kararı P-1** (yetişkin, çocuğa yönelik değil) onayı.
5. **B planı ön onayı** (P-7): Faz 3 > 2 hf kayarsa S6 → S5 kesimi proje sahibine tekrar sorulmadan uygulansın mı?
