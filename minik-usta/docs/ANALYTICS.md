# Analytics planı

Sahip: entrepreneur + code-lead · Durum: §2 olay tablosu v1 (revizyon turu, 2026-10-04); diğer bölümler Faz 5'te
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
| `tutorial_step` | `level` int, `step` int | MVP | FTUE hunisi |
| `level_start` | `level` int, `attempt` int, `mode` enum(story, master), `preBoosters` int | MVP | Bölüm hunisi |
| `level_end` | `level` int, `mode` enum(story, master), `result` enum(win, lose, quit), `movesLeft` int, `wrongPlacements` int, `yao` int (0–100), `durationMs` int, `extensions` int (0–3) | MVP | Zorluk, bölüm süresi bandı |
| `level_resume` | `level` int, `movesMade` int | MVP | OR-13 bölüm içi devam |
| `booster_used` | `booster` enum(economy.json güçlendirici kimlikleri), `level` int | MVP | Ekonomi |
| `offer_shown` | `offer` enum(continue, life, booster_plus, starter, piggy, pack), `placement` enum(out_of_moves, bridge_loss, lives_zero, daily, in_level_plus, pre_level_plus, shop), `offerIndex` int (1–3) \| null, `priceCoins` int \| null | MVP | Teklif hunisi |
| `offer_result` | `offer_shown` alanları + `result` enum(coins, ad, free, declined, unavailable) | MVP | Kurtarma karışımı (BUSINESS §5.4 b) |
| `purchase` | `sku` enum(coins_1000, coins_2750, coins_6000, coins_13000, coins_35000, coins_75000, starter, piggy_break), `fake` bool | MVP | Monetizasyon |
| `ad_rewarded` | `placement` enum(out_of_moves, lives_zero, daily_double), `outcome` enum(rewarded, skipped, unavailable) | MVP | Reklam / DAU, tavanlar |
| `coin_source` | `amount` int, `reason` enum(level_win, bonus, golden_trowel, level_chest, master_chest, daily, bridge, league, piggy_break, purchase), `balanceAfter` int | MVP | Bakiye bandı (§5.4 a) |
| `coin_sink` | `amount` int, `reason` enum(continue, lives, booster, pre_booster), `balanceAfter` int | MVP | Ekonomi |
| `event_join` | `event` enum(bridge, league), `eventInstanceId` str, `botSimVersion` str, `seedHash` str | MVP | Katılım; E8 denetimi |
| `event_continue` | `event` enum(bridge), `plank` int (0–7), `offerIndex` int (1–3), `payment` enum(coins, ad, free), `runCoinsSpent` int | MVP | Etik pano: Köprü +5 payı, 4.050 tavanı |
| `event_eliminated` | `event` enum(bridge), `plank` int | MVP | Elenme tahtası |
| `event_end` | `event` enum(bridge, league), `result` enum(finished, eliminated, timeout, week_end), `plank` int \| null, `rank` int \| null, `rewardCoins` int | MVP | Tamamlama oranı |
| `star_spent` | `task` str (`town.c{n}.t{m}`) | MVP | Meta hunisi |
| `life_lost` | `level` int | MVP | Can ekonomisi |
| `store_open` | `source` enum(nav, out_of_moves, lives_zero, booster_plus) | MVP | Mağaza hunisi |
| `chest_open` | `chest` enum(level, league, master), `contentId` str | MVP | E1 sabit içerik |
| `session_end` | `durationMs` int, `levelsPlayed` int | MVP | Oturum süresi, bölüm / DAU |
| `settings_changed` | `key` enum(sound, music, haptics, lang, colorblind, reduceMotion, heavyGravitySlow), `value` str | MVP | Erişilebilirlik kullanımı |
| `age_gate_result` | `bucket` enum(<13, 13-17, 18+) | Mağaza sürümü | S12; < 13 oranı izleme tetiği |
| `consent_result` | `status` enum(granted, denied), `version` str | Mağaza sürümü | CMP |

## §3 Ortak parametreler

`sessionId` str, `appVersion` str, `platform` enum(web, android, ios), `lang` enum(tr, en), `coins` int, `lives` int,
`highestLevel` int, `payer` bool (en az bir satın alma; MVP'de sahte dahil). `payer` yalnız analitik segmenti içindir;
bot simülasyonuna girmez (BUSINESS E8). MVP'de olaylar yerel halka tampona yazılır; mağaza sürümünde onaydan
(`consent_result`) önce gönderilmez.
