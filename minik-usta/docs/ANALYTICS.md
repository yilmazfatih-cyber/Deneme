# Analytics planı

Sahip: entrepreneur + code-lead · Durum: §2 olay tablosu v5 (2026-10-06, son tutarlılık turu 3: `store_open.source` +=
`coin_plus`, `piggy`, `bridge_loss`; UX mağaza girişlerinin tamamı eşlendi); v4 (2026-10-05, son tutarlılık turu 2:
`level_start.mode` / `level_end.mode` += `replay` (D-026 yedeği, `masterMode.variant`); v3: 2026-10-05, son tutarlılık turu: `star_spent.task` =
`economy.json` görev `id`'si, günlük reklam yerleşimi iki olayda `daily_double`, `offer` +`daily_double`,
+`level_load_failed`, +`cutscene_missing`; v2: 2026-10-05, F-1: +`level_resume_invalid`, +`save_corrupt`, `level_end`
+`exitFree` +`truckHelps`, `ad_rewarded.placement` +`bridge_loss`, `coin_source.reason` +`refund`; v1: revizyon turu,
2026-10-04); diğer bölümler Faz 5'te
Bağlayıcı girdiler: `docs/BRIEF.md` §12 (MVP olay listesi), `docs/BUSINESS.md` §6 (KPI hedefleri, ek olay önerileri,
panolar), §3 S12 (yaş ekranı: yalnız yaş kovası saklanır).

## Taslak iskelet

1. **İlkeler** — `track(event, params)`; MVP'de konsol/yerel; kişisel veri yok; doğum yılı saklanmaz.
2. **Olay listesi** — aşağıdaki §2 tablosu (tek kaynak).
3. **Ortak parametreler** — aşağıdaki §3.
4. **Huniler** — FTUE; bölüm hunisi; mağaza → satın alma; Köprü katılım → elenme → +5; 50. bölüm → Usta Modu.
5. **Panolar** — tutma kohortları; FTUE; zorluk sıçramaları (LEVEL_REPORT karşılaştırması); ekonomi kaynak/çıkış ve
   ödemeyen oyuncu ölçütü (medyan bakiye 400–1.500, kurtarma karışımı; BUSINESS §5.4); monetizasyon; etkinlik; etik
   koruma panosu (Köprü +5 payı ≤ %25, iade, "pay to win" yorumları).
6. **Mağaza sürümü** — SDK seçimi, onay (CMP) akışı, KVKK yurt dışı aktarım bildirimi, veri saklama süresi.

## §2 Olay tablosu (tek kaynak)

Kural: olay adları ve parametreleri **yalnız bu tabloda** tanımlanır. code-lead TECH_DESIGN §11.4 `AnalyticsEvent` tip
birliğini bu tablodan üretir ve tablodaki her olayın kodda var olduğunu bir testle denetler; tabloda olmayan olay eklenmez.
Değişiklik: entrepreneur (ad, amaç) + code-lead (tip). Tipler: `int`, `str`, `bool`, `enum(...)`. Kişisel veri yok.

| Olay | Parametreler (tip) | Etiket | Amaç / pano |
| --- | --- | --- | --- |
| `app_open` | — | MVP | Tutma |
| `save_corrupt` | `stage` enum(parse, migrate, validate), `recovered` enum(backup, defaults) | MVP | TECH §11.1 kayıt kurtarma; `defaults` = ilerleme kaybı (BUSINESS §8 Kapı 0 "kritik hata 0") |
| `tutorial_step` | `level` int, `step` int | MVP | FTUE hunisi |
| `level_start` | `level` int, `attempt` int, `mode` enum(story, master, replay), `preBoosters` int | MVP | Bölüm hunisi |
| `level_end` | `level` int, `mode` enum(story, master, replay), `result` enum(win, lose, quit), `movesLeft` int, `wrongPlacements` int, `yao` int (0–100), `durationMs` int, `extensions` int (0–3), `exitFree` bool, `truckHelps` int | MVP | Zorluk, bölüm süresi bandı; cezasız çıkış (GDD K-43/2); kilitlenme sıklığı ↔ LEVEL_REPORT |
| `level_resume` | `level` int, `movesMade` int | MVP | OR-13 bölüm içi devam |
| `level_resume_invalid` | `level` int, `movesMade` int, `cause` enum(level_hash, rules_version, both) | MVP | GDD K-43/4, E-45 geçersiz deneme; güncelleme kaynaklı iptal sıklığı |
| `level_load_failed` | `level` int, `stage` enum(schema, logic), `code` str \| null | MVP | UX §4 hata durumu ("Bu bölüm hazırlanamadı" → Ana ekran); TECH §8.3 yükleme anı denetimi; sahada bozuk bölüm verisi (BUSINESS §8 Kapı 0 "kritik hata 0") |
| `booster_used` | `booster` enum(economy.json güçlendirici kimlikleri), `level` int | MVP | Ekonomi |
| `offer_shown` | `offer` enum(continue, life, booster_plus, starter, piggy, pack, daily_double), `placement` enum(out_of_moves, bridge_loss, lives_zero, daily_double, in_level_plus, pre_level_plus, shop), `offerIndex` int (1–3) \| null, `priceCoins` int \| null | MVP | Teklif hunisi |
| `offer_result` | `offer_shown` alanları + `result` enum(coins, ad, free, declined, unavailable) | MVP | Kurtarma karışımı (BUSINESS §5.4 b) |
| `purchase` | `sku` enum(coins_1000, coins_2750, coins_6000, coins_13000, coins_35000, coins_75000, starter, piggy_break), `fake` bool | MVP | Monetizasyon |
| `ad_rewarded` | `placement` enum(out_of_moves, bridge_loss, lives_zero, daily_double), `outcome` enum(rewarded, skipped, unavailable) | MVP | Reklam / DAU, tavanlar |
| `coin_source` | `amount` int, `reason` enum(level_win, bonus, golden_trowel, level_chest, master_chest, daily, bridge, league, piggy_break, purchase, refund), `balanceAfter` int | MVP | Bakiye bandı (§5.4 a); `refund` = K-43/4 iadesi |
| `coin_sink` | `amount` int, `reason` enum(continue, lives, booster, pre_booster), `balanceAfter` int | MVP | Ekonomi |
| `event_join` | `event` enum(bridge, league), `eventInstanceId` str, `botSimVersion` str, `seedHash` str | MVP | Katılım; E8 denetimi |
| `event_continue` | `event` enum(bridge), `plank` int (0–7), `offerIndex` int (1–3), `payment` enum(coins, ad, free), `runCoinsSpent` int | MVP | Etik pano: Köprü +5 payı, 4.050 tavanı |
| `event_eliminated` | `event` enum(bridge), `plank` int | MVP | Elenme tahtası |
| `event_end` | `event` enum(bridge, league), `result` enum(finished, eliminated, timeout, week_end), `plank` int \| null, `rank` int \| null, `rewardCoins` int | MVP | Tamamlama oranı |
| `star_spent` | `task` str (`economy.json` görev `id`'si: `ch{n}_t{m}`) | MVP | Meta hunisi |
| `cutscene_missing` | `scene` str (STORY sahne kimliği: `story.prologue`, `story.ch{n}.start`, `story.ch{n}.end`) | MVP | UX §8 hata durumu (sahne verisi yoksa atlanır); eksik içerik paketi |
| `life_lost` | `level` int | MVP | Can ekonomisi |
| `store_open` | `source` enum(nav, coin_plus, piggy, out_of_moves, bridge_loss, lives_zero, booster_plus) | MVP | Mağaza hunisi |
| `chest_open` | `chest` enum(level, league, master), `contentId` str | MVP | E1 sabit içerik |
| `session_end` | `durationMs` int, `levelsPlayed` int | MVP | Oturum süresi, bölüm / DAU |
| `settings_changed` | `key` enum(sound, music, haptics, lang, colorblind, reduceMotion, heavyGravitySlow), `value` str | MVP | Erişilebilirlik kullanımı |
| `age_gate_result` | `bucket` enum(<13, 13-17, 18+) | Mağaza sürümü | S12; < 13 oranı izleme tetiği |
| `consent_result` | `status` enum(granted, denied), `version` str | Mağaza sürümü | CMP |

**Değer tanımları (v2, F-1; v3 son tutarlılık turu; v4 son tutarlılık turu 2; v5 son tutarlılık turu 3).** Tablodaki ad ve tiplerin anlamı; kod eşlemesi TECH §11.4'te.

- `level_start.mode` / `level_end.mode` (v4): Bölüm 1–50 hikaye ilerlemesinde `story`; 50'den sonraki içerik sonu
  döngüsünde (11…50, sonra yeniden 11) `economy.json → masterMode.variant` değeri: `master` = Usta Modu (solver
  minimumu + 2), `replay` = D-026 yedeği (özgün LEVELS bütçesi; UX §3). `level` iki döngüde de özgün bölüm numarasıdır.
  Aynı denemenin `level_start` ve `level_end`'i aynı `mode`'u taşır. Zorluk ve bölüm süresi panoları (BUSINESS §6.2
  bölüm süresi bandı, §6.4 pano 3) yalnız `mode = story` ile hesaplanır; `master` ve `replay` ayrı satırdır (çözümü
  bilinen tekrar galibiyetleri hikaye eğrisine karışmaz). Usta Sandığı iki döngüde de `chest_open.chest = master` ve
  `coin_source.reason = master_chest`'tir.

- `ad_rewarded.placement` = aynı penceredeki `offer_shown.placement`: Sallanan Köprü denemesinde 1. teklifin reklam
  alternatifi `bridge_loss`, etkinlik dışında `out_of_moves`. `bridge_loss` ayrı tavan değildir; günlük sayaç
  `out_of_moves` ile ortaktır (BUSINESS §4.3: `outOfMoves.rewardedAdOffer.perDay: 3`; toplam `ads.dailyCapTotal: 6`).
  Günlük ödül ×2 reklamı iki olayda da `daily_double`'dır (v3; eski `offer_shown.placement = daily` kaldırıldı):
  `offer_shown { offer: daily_double, placement: daily_double, offerIndex: null, priceCoins: null }`, reklam izlenince
  `ad_rewarded { placement: daily_double }`. `offer = daily_double` yalnız bu yerleşimde gönderilir.
- `store_open.source` (v5): Mağaza'yı açan dokunuşun yeri; UX'teki her giriş tek değere eşlenir. `nav` = alt nav Mağaza
  sekmesi (UX §3; Bölüm 5 `tut.meta.shop` açılışı dahil); `coin_plus` = üst çubukta altın sayacı / yeşil (+) (UX §3);
  `piggy` = sağ kenardaki kumbara ikonu (UX §3; Mağaza kumbara kartında açılır); `out_of_moves` = "Hamleler bitti"
  penceresindeki "Altın al" (UX §7, etkinlik dışı); `bridge_loss` = aynı düğme Sallanan Köprü denemesinde (UX §7 Köprü
  durumu); `lives_zero` = Can penceresindeki "Altın al" (UX §3.1); `booster_plus` = mini satın alma penceresindeki "Altın
  al" (bölüm öncesi "+" UX §4, bölüm içi "+" UX §5.1; aynı pencere). Kayıp penceresi ve Can penceresi girişleri aynı penceredeki
  `offer_shown.placement` değerini taşır; mini satın almada bölüm içi / öncesi ayrımı `offer_shown.placement`
  (`in_level_plus`, `pre_level_plus`) ile yapılır. Listede olmayan yeni bir giriş eklenirse önce bu tabloya değer eklenir.
- `star_spent.task` = `config/economy.json → town.chapters[].tasks[].id` (`ch1_t1` … `ch5_t7`, 35 görev, D-016); i18n
  anahtarı (`town.ch{n}.t{m}.name`) gönderilmez.
- `level_end.exitFree` = `result = quit` ve `m = 0` (GDD K-43/2, E-41: can ve oyun öncesi güçlendiriciler iade, seri
  bozulmaz); diğer her durumda `false`. Kayıp oranı ve zorluk panosunda `exitFree = true` denemeler kayıp sayılmaz.
- `level_end.truckHelps` = bu denemede çalışan Kamyon Yardımı sayısı (GDD K-30); Geri Al ile geri alınan yardım düşülür
  (E-37). LEVEL_REPORT'un "Kamyon Yardımı sayısı" sütunuyla bölüm başına karşılaştırılır (BUSINESS §6.4 pano 3).
- `level_resume_invalid`: açılışta `inLevel`, `levelHash` ya da `rulesVersion` uyuşmazlığıyla geçersiz sayılınca bir
  kez (GDD K-43/4, TECH §11.1 `voidAttempt`). `movesMade` `level_resume` ile aynı tanımdır. Deneme oynanmamış
  sayıldığından bu denemede `level_end`, `level_resume`, `life_lost` ve `event_eliminated` gönderilmez; bölüm hunisinde
  `level_start`'ı kapatan olay budur. `levels[id].attempts` geri alınmaz (TECH §11.1); sonraki `level_start.attempt`
  iptal edilen denemeyi de sayar.
- `coin_source.reason = refund`: yalnız `voidAttempt`'in `offerSpendCoins` iadesi; tutar > 0 ise tek olay,
  `amount` = iade edilen altın. Can, güçlendirici iadesi ve `m = 0` çıkışı altın olmadığından `coin_source` üretmez.
- `level_load_failed`: oyunda bölüm JSON'u yükleme anı denetiminden geçmeyince bir kez (TECH §8.3: zod şeması →
  `stage = schema`, `code = null`; oyunda koşan mantık kuralları (L-02, L-04, L-05, L-08, L-09, L-24, L-25, L-26) → `stage = logic`, `code` = TECH §8.3 tablosundaki K-45 hata kodu).
  Deneme başlamadığından bu bölüm açılışında `level_start` ve `life_lost` gönderilmez; oyuncu Ana ekrana döner (UX §4).
- `cutscene_missing`: tetiklenen ara sahnenin verisi (panel listesi ya da metin anahtarları) yoksa, sahne atlanmadan
  önce bir kez (UX §8). Panel görseli henüz yüklenmemişse bu olay gönderilmez (sahne yer tutucu SVG ile oynar).
- `save_corrupt`: kayıt yüklemesinde ana kayıt `stage` adımında (JSON parse → migration → şema doğrulama) başarısız
  olunca bir kez. `recovered = backup`: yedekten kuruldu; `defaults`: yedek de bozuk, varsayılanlarla başladı (ilerleme
  kaybı). Bozuk metin gönderilmez; yalnız yerelde (`minikusta.save.corrupt`) kalır.

## §3 Ortak parametreler

`sessionId` str, `appVersion` str, `platform` enum(web, android, ios), `lang` enum(tr, en), `coins` int, `lives` int,
`highestLevel` int, `payer` bool (en az bir satın alma; MVP'de sahte dahil). `payer` yalnız analitik segmenti içindir;
bot simülasyonuna girmez (BUSINESS E8). MVP'de olaylar yerel halka tampona yazılır; mağaza sürümünde onaydan
(`consent_result`) önce gönderilmez. `save_corrupt`, `level_resume_invalid` ve `coin_source{refund}` kurtarma / iade
yazımından **sonra** gönderilir; ortak parametreler (`coins`, `lives`, `highestLevel`) yeni durumu taşır.
