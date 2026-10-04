# Analytics planı

Sahip: entrepreneur + code-lead · Durum: Faz 5'te birlikte doldurulacak (yalnız taslak iskelet, 2026-10-04)
Bağlayıcı girdiler: `docs/BRIEF.md` §12 (MVP olay listesi), `docs/BUSINESS.md` §6 (KPI hedefleri, ek olay önerileri,
panolar), §3 S12 (yaş ekranı: yalnız yaş kovası saklanır).

## Taslak iskelet

1. **İlkeler** — `track(event, params)`; MVP'de konsol/yerel; kişisel veri yok; doğum yılı saklanmaz.
2. **Olay listesi** — brief §12 olayları + BUSINESS §6.4 ek önerileri (`offer_result`, `ad_rewarded`, `coin_source`,
   `coin_sink`, `event_continue`, `store_open`, `chest_open`, `session_end`, `settings_changed`; mağaza sürümünde
   `age_gate_result`, `consent_result`). Her olay için parametre tablosu ve tipler (code-lead).
3. **Ortak parametreler** — oturum kimliği, uygulama sürümü, bölüm kimliği, ekonomi bakiyesi (altın, can).
4. **Huniler** — FTUE; bölüm hunisi; mağaza → satın alma; Köprü katılım → elenme → +5.
5. **Panolar** — tutma kohortları; FTUE; zorluk sıçramaları (LEVEL_REPORT karşılaştırması); ekonomi kaynak/çıkış;
   monetizasyon; etkinlik; etik koruma panosu.
6. **Mağaza sürümü** — SDK seçimi, onay (CMP) akışı, KVKK yurt dışı aktarım bildirimi, veri saklama süresi.
