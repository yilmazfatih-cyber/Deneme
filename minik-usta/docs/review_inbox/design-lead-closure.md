# design-lead kapanışları — Faz 1 revizyon turu (2026-10-04 / 2026-10-05)

Güncellenen dosyalar: `docs/ART_DIRECTION.md`, `docs/UX_FLOWS.md`, `docs/JUICE.md`, `docs/STORY.md`,
`docs/ASSET_LIST.md`, `src/theme/tokens.json` (v2; geçerli JSON, yinelenen anahtar yok, Prettier'dan geçti). Tur bir API
hatasıyla yarıda kesildi; ikinci oturumda her yorum dosyaların **güncel metnine** karşı yeniden denetlendi. Eksik kalanlar
bu oturumda tamamlandı: ASSET_LIST revizyonunun tamamı, ara sahne tetikleyicisinin META §1'e eşitlenmesi (UX §8, STORY
§3), tokens `audio.sfx` / `audio.seq` ZzFX dizileri, iki küçük ad düzeltmesi (ART §2.4, JUICE §0.1).

Özet: **68 yorum → 68 KAPANDI · 0 RET · 0 AÇIK SORU** (2 not yorumu dahil; ikisinde öneri kararla değişti, gerekçe satırda).
Proje sahibine giden sorular kararlardan ve kendi önerilerimden gelir (sonda).

## code-lead.md (15)

- code-lead.md#layout sözleşmesi (120 px hücre, 60 px duvar, çapa grupları) → KAPANDI (tokens `layout.grid.*`: `cellPx` 120, `wallW` 60, `yardX` 30, `wallX` 750, `buildX` 810; `layout.top.*` / `layout.bottom.*` (`*BottomPx`) / `layout.board.*` (`expandShare` 0,5) / `layout.popup.*`; değişmezler `layout._doc`'ta ve sayısal olarak tutuyor; UX §0.1, §5.1. Not: yol `layout.grid.cellPx` — TECH §2.2'deki `tokens.layout.cellPx` atfı code-lead'e)
- code-lead.md#tokens.json biçimi (tek kaynak, ad birliği, 700 ms, birimler) → KAPANDI (türetilmiş renkler `check.*` "salt kontrol"; `block.cellPx`, `radius.blockCorner`, `stroke.outlinePx`, `block.contactShadow*`, `drag.liftedShadow*`, `alpha.*Shadow` kaldırıldı → `shadow.*`, `block.*Ratio/Factor`; tek ad `color.ghost.*` (ART §2.3); `rules.heavyGravityHoldMs` çıktı; `meta.units` eklendi; `layout.wallWidthCells` bilerek eklenmedi, tek kaynak `wallW`)
- code-lead.md#blok çizim yöntemi (Graphics/RenderTexture yerine) → KAPANDI (ART §3: bölüm başında parça bazlı pişirme, Canvas2D `Path2D` → `CanvasTexture`, siluet dokuları, iç köşe çeyrek yayı, parça düzeyinde parlama; ASSET §2 `blk_<şekil>_<renk>[_bayrak]`, `blk_sil_*`, `ghost_*`; renk körü modunda yeniden pişirme)
- code-lead.md#plan hücresi tarifi P-2 (katman sırası, hangisi esas) → KAPANDI (ART §4 sıra: ozalit → plan hücreleri → ızgara dokusu → inşa cephesi → bloklar; esas `board.planUnderlay` + `alpha.planFill`, `check.plan` salt kontrol; renk körü modunda `a11y.colorBlindPlanFill` 0,9)
- code-lead.md#JUICE kural 3 ↔ TECH §6.3 girdi kilidi → KAPANDI (R-12: JUICE §0 kural 3 ve UX §0.3 "tutma anında tahtayı değiştiren bekleyen animasyonlar son karesine atlar"; kilit yalnız dilim kayması 600 / kamyon 700 / Kamyon Yardımı 900 ms)
- code-lead.md#maske gerektiren efektler → KAPANDI (JUICE kural 11 ve #12, #18, #47 Filter'sız: `setCrop` silme, ADD tint flaşı, ekran kenarı kırpması; UX §13.1 spot ışığı 4 dikdörtgen + 4 çeyrek daire; ASSET `ui_spotlight`)
- code-lead.md#Baloo 2 yükleme → KAPANDI (ART §8: preload + `@font-face` 400–800 `font-display: block`, Boot iki `document.fonts.load` bekler; `tnum` yerine en geniş haneye göre sabit hane yuvaları; iOS ağırlık sorunu çıkarsa iki statik örnek)
- code-lead.md#FTUE "8,0 s, 0 dokunuş" iddiası → KAPANDI (UX §2.1: kritik yol yalnız font + 3 panel ≤ 300 KB; doku/ses/`level_001` panellerin arkasında; `npm run perf` kapısı, 4× CPU + web için Fast 4G; aşılırsa panel 1,8 → 1,5 s; ASSET §9 tembel yükleme)
- code-lead.md#parçacık bütçesi (`win` 80 ↔ `maxPerBurst` 40) → KAPANDI (tokens `particles.win` 40 + `winWaves` 2; JUICE kural 4 doku ailesi başına emitter, `maxAliveParticles`)
- code-lead.md#ses (ZzFX, ön-çizim, kilitli bağlam) → KAPANDI (JUICE kural 6: 22,05 kHz mono, sahne bazında dilimli ön-çizim, kilitliyken istek atılır, perde/ses `rate`/`volume`; `sfx_fall` en uzun hâliyle 1,8 s; bu oturumda tokens `audio.sfx` (20 ses) + `audio.seq` (9 çok notalı) Faz 2 P0 dizileri ZzFX 1.4.0 `buildSamples` ile çizilip doğrulandı: NaN yok, tepe ≤ 0,91)
- code-lead.md#kasaba katmanları bellek maliyeti → KAPANDI (ASSET §7: sınır kutusuna kırpma + `{x, y}` ofset `town_ch<n>.json`, hikaye bölümü başına 1–2 atlas 2048², yalnız aktif bölüm bellekte; §9 panel belleği gösterilen + sıradaki)
- code-lead.md#mağaza görüntüleri ve ekran aracı → KAPANDI (ASSET §11 `--profile ios67` 430×932 @3 = 1290×2796, `--profile android` 360×640 @3 = 1080×1920; UX §0.1 çapa sözleşmesi iki oranda)
- code-lead.md#Albüm kapsamı → KAPANDI (R-19: UX §3 Albüm kilitli "Yakında" sekmesi [Sonra], §8 son panel yalnız yapı kartı, §12 akışta Albüm Sonra; JUICE #75; STORY §4.1 p4; ASSET `album_card_*` P2 [Sonra])
- code-lead.md#hafif yerçekiminde yönlendirme girdisi → KAPANDI (R-10: tahtaya dokunma, dokunulan taraf = yön, boş noktadan yatay kaydırma da geçerli; "şantiyenin yarısına dokun" önerisi bunun alt kümesi; UX §5.6, JUICE #46, `hud.steerChipPx`)
- code-lead.md#ağır yerçekimi 700 ms ve "Zaman baskısı yok" → KAPANDI (R-11: kural 700 ms; Ayarlar › Erişilebilirlik "Zaman baskısını azalt" = 1400 ms; UX §5.7, §11, §14; JUICE #45; STORY `tut.l15.setting`, `settings.timePressure`. "İndirilemez" davranışı kararla seçilmedi)

## code-lead-2.md (1 yorum + 2 not)

- code-lead-2.md#K-07 tutma eşiği (0,3 hücre ↔ 8 px) → KAPANDI (UX §5.3: `drag.startThresholdPx` 8 / `holdMs` 100; eşik altı bırakma = dokunma; K-07 sayı içermez (product-lead), test token okur)
- code-lead-2.md#balon tavanı — design-lead görsel notu (ip gerilir, aşağı süzülür) → KAPANDI (JUICE #43: tavanın üstünden bırakılan balonlu blok ipi gerilerek kirişe süzülür, `duration.ceilingSettle` 200; UX §5.4 balon gölgesi her durumda kirişin altında)
- code-lead-2.md#K-34 maliyeti — design-lead notu (Altın Mala vurgusu `eligibleTrowelCells`) → KAPANDI (UX §5.2 tablosu ve §5.5: Altın Mala'nın seçilebilir hücreleri = inşa cephesi = `eligibleTrowelCells`, tek görsel dil)

## entrepreneur.md (28)

- entrepreneur.md#UX §7 +5 penceresi, seçenek asimetrisi → KAPANDI (R-15: üç eşit 920×152 düğme alt alta, hiyerarşi yalnız renkle, "Hayır, teşekkürler" dolgulu krem — metin düğme değil, × aynı sonuç; UX §0.3 teklif penceresi kuralı, `layout.popup.*`)
- entrepreneur.md#UX §7 fiyat bilgisi ve eskalasyon → KAPANDI (`PriceLabel` "● 900 / ≈ 81 TL"; "Teklif n/3", 1.350 / 1.800, "son teklif"; reklamla +5 sınıra sayılır; 3. uzatmadan sonra doğrudan can kaybı; ömür ilk teklifi `lose.offer.gift`)
- entrepreneur.md#UX §7 + Köprü kaybı baskı dili → KAPANDI ("Kalan: 2 hücre" nötr; Tuna "kararlı", balon yok; Köprü'de tek satır `lose.bridge`; kalan oyuncu ve havuz kayıp penceresinde yok; STORY `lose.tuna` kaldırıldı)
- entrepreneur.md#UX §9 Köprü kural kartı ve bot etiketi → KAPANDI (R-14: kural kartı ilk "Katıl"da bir kez + (i) ile her zaman; "Rakiplerin: Renkli Tepe çırakları" ekranda kalıcı; STORY `bridge.rule_card.*`, `bridge.bots_label`, `bridge.bots_info`)
- entrepreneur.md#UX §10 Usta Ligi bot görünümü → KAPANDI (R-14: kask + alet avatarı, `npc.apprentice.*` adı + "çırak" rozeti, bayrak/çevrimiçi ışığı/kullanıcı adı biçimi yok; "Selin_U" kaldırıldı; (i) kural kartı `league.rule_card.*`; ASSET `chr_bridge_helmet_bot_*` alet simgesi, `ui_bot_badge`)
- entrepreneur.md#UX §11 Mağaza paket miktarları → KAPANDI (UX §11 economy.json/BUSINESS §5 ile aynı: ● 1.000 / 2.750 / 6.000 / 13.000 / 35.000 / 75.000; Başlangıç 2.500 + 2 Çekiç + 1 Vinç + 2 Termos, geri sayım yok; kartta fiyat + "+%n" değer etiketi; "en popüler / en iyi değer" yok; sayılar config'ten)
- entrepreneur.md#UX §3–§5 mini satın almalarda gerçek para → KAPANDI (ortak `PriceLabel` bileşeni UX §0.3: Can penceresi, bölüm öncesi "+", güçlendirici "+"; referans `priceDisplay.referenceSku`; ASSET `ui_price_label`)
- entrepreneur.md#UX §3, §7 ödüllü reklam yerleşimleri → KAPANDI (Can penceresi "+1 can (bugün 2/2)", günlük ödül "×2", kayıp +5; tavanda gri "Yarın tekrar", reklam yoksa "Şu an reklam yok", gizlenmez; [MVP yer tutucu])
- entrepreneur.md#UX günlük ödül ekranı tanımsız → KAPANDI (UX §3.1: 7 günlük takvim, ödüller önceden görünür, "Bir gün gelmezsen ilerlemen kaybolmaz.", kaçırılan gün "bekliyor" saat simgesi, sıfırlama/geri sayım yok; JUICE #86; STORY `daily.*`; ASSET `icon_wait_clock`)
- entrepreneur.md#UX §6, §10 sandık açılışı → KAPANDI (UX §3.1: içerik kapalı sandığın üstünde baştan görünür; kapak kalkar, ikonlar gösterilen sırayla uçar; çark/slot/yavaşlayan kart/"neredeyse" yok; JUICE #85)
- entrepreneur.md#UX §11 Kumbara kartı → KAPANDI (UX §11: "Kumbarada ● n / 2.000", "● 1.000'de kırılabilir", "Kır · $1,99" her zaman görünür, eşik altında gri, "Dolu" rozeti, bildirim/geri sayım yok; R-16 değerleri)
- entrepreneur.md#UX §2 FTUE yaş ekranı ve onay → KAPANDI (UX §2.3 [Mağaza]: Bölüm 3 Kazanma → Yaş → CMP → Ana ekran; web MVP'de yok. "Doğum yılı kaydırıcısı" yerine boş 4 hane + sayısal tuş takımı: kaydırıcı varsayılan yıl önerir; BUSINESS S12 bu tarifi onayladı)
- entrepreneur.md#UX §11 Ayarlar mağaza satırları → KAPANDI ("Gizlilik" ve "Harcama limiti" [Mağaza] satırları; web MVP'de gizli, yerleri ayrıldı)
- entrepreneur.md#UX §7 "Altın al" → Mağaza yönlendirmesi → KAPANDI (kayıp bağlamında eksik altını karşılayan en küçük paket çerçeveli + `shop.covers`; önseçim, otomatik kaydırma, pahalı paket vurgusu yok; UX §7, §11)
- entrepreneur.md#UX kapsam etiketleri → KAPANDI (UX başlığında etiket sözlüğü; Sol el [Sonra], Albüm [Sonra], Kaydı sıfırla / Lisanslar / oyuncu kimliği [MVP], panorama önizleme [MVP-lite], bağlamsal öğreticiler [MVP]; EXPAND R-06 gereği proje sahibine soruldu, belgeler FIT ve EXPAND'de aynı çapalarla çalışır)
- entrepreneur.md#UX §1 açılış logosu → KAPANDI (UX §1: ad `app.title` marka sabitinden, 8–12 harfe ölçeklenir, "MİNİK USTA" yer tutucu; ASSET `logo_wordmark` final isim kararından sonra, insan sanatçı)
- entrepreneur.md#STORY §7.2 çırak adları ve bot bilgi metinleri → KAPANDI (STORY §7.4: 100 takma ad çifti `npc.apprentice.n001…n100` (99 bot için yeterli; 120 gerekmedi), gerçek ad-soyad / kullanıcı adı / hikaye karakteri adı yok; `bridge.bots_info`, `league.bots_info`, `bridge.rule_card.*`, `league.rule_card.*`, `npc.apprentice.badge`)
- entrepreneur.md#STORY §7.3 vazgeç metni → KAPANDI (`lose.decline` "Hayır, teşekkürler / No thanks"; `lose.giveup` ve `lose.tuna` kaldırıldı; "Az kaldı!" yalnız oyun içi `react.tuna.last` [Sonra])
- entrepreneur.md#STORY genel ton ve çocuk sinyali → KAPANDI (STORY §0-8: yetişkin kasaba halkı en az çocuklar kadar; Ch1 bitiş p1 komşular, Hikaye 3'te veliler + emekli okurlar, "kasabanın tek kütüphanesi"; ASSET §8 figüranlar 2 yetişkin / 1 çocuk / 2 balıkçı; "Tuna & Co." yalnız oyun içi firma adı)
- entrepreneur.md#STORY kapsam etiketleri → KAPANDI (STORY başlığı: §7.1 tepki balonları [Sonra], "Devamı yolda…" [MVP]; JUICE #81 [Sonra])
- entrepreneur.md#ASSET §11 app_icon → KAPANDI (imza hareket: ikaz şeritli duvar başlığı + kancadaki blok + kesik yay; karakter, yüz, kask, harf, küp yığını yok (BUSINESS S5 "kask yok" ile aynı); Faz 5'te 2 varyant, A/B yalnız 18+ hedeflemeyle; uyarlanabilir ikon ve PWA aynı motif)
- entrepreneur.md#ASSET §11 store_feature_graphic → KAPANDI (sol yarı tahta ölçeğinde kaldır–aşır–indir anı, sağ yarı fener ya da fırın (ağaç ev değil), Tuna küçük ve köşede)
- entrepreneur.md#ART §11.8 Color Block Jam eksik → KAPANDI (ART §11.8 satırı: geçit duvar içinde kestirme, kapı rengi yalnız W6 ve damla dilinde, mağaza görsellerinde duvar üstü hareket öne çıkar)
- entrepreneur.md#ASSET §0.1, §8 üretim yöntemi ve fikri mülkiyet → KAPANDI (ASSET §0: ana 4 karakter, logo, uygulama ikonu insan sanatçı; araçlar yalnız keşif/eskiz; §15 üretim kaydı tablosu; genel ve satır istemlerinden marka/karakter adları çıktı (Geppetto dahil), yerine öğe tarifi; "toy box/toy-like" çıktı; marka başvurusu notu)
- entrepreneur.md#ASSET final sanat maliyeti ve süresi → KAPANDI (Öncelik sütunu P0/P1/P2/kod ve tanımı §0; §14 iş yükü tablosu ≈ 126 sanatçı-günü (P0 ≈ 67), 1,5 FTE ile ≈ 17 hafta; Hikaye 4–5'i 4 panele indirme §9'da yedek plan)
- entrepreneur.md#ART §11.6, ASSET §8 ifade seti kapsamı → KAPANDI (ana 4 karakter 6 ifade, yan 4 karakter 3 ifade (mutlu, şaşkın, üzgün), kalan [Sonra]; ART §11.6 ve ASSET §8 satırları)
- entrepreneur.md#JUICE #52 +5 çipi döngüsel zıplama → KAPANDI (çip pencere açılırken bir kez zıplar; üç düğme aynı giriş animasyonu; R-15)
- entrepreneur.md#JUICE kapsam etiketleri → KAPANDI (JUICE §0 kural 12: Faz 2 P0 #1–13, 18, 19, 50–53, 55–58, 69–71, 83–84; engel olayları Faz 3; [MVP-lite] #16, #75, #79; [Sonra] #81, #82, §7; satır başlarında da etiket. Ayrı sütun yerine liste: 10. sütun 90 satırlık olay tablosunu telefonda okunmaz yapardı, bilgi aynı; code-lead Faz 2 #11 aynı listeye bağlı)

## product-lead.md (22)

- product-lead.md#ağır yerçekimi erişilebilirliği (→ code-lead, design-lead; "sayaç hiç olmasın") → KAPANDI (R-11 karar verdi: ayar açıkken 1400 ms; "sayaç yok" önerisi kararla değişti; UX §5.7 halka sayaç iki durumda da görünür)
- product-lead.md#öğretici sırası ile LEVELS çözümü → KAPANDI (UX §13.2 Bölüm 1–10 satırları LEVELS `tutorial[]` ile birebir: B3 temel → ray Z → ray tutar; B4 pencere → `front` + `tut.ctx.support` → ray Z; B9 temel → dar geçit Z; `piece:<i>` = LEVELS tablo sırası, parantezde LEVELS kimliği). **Not (tutarlılık denetimi tur 2):** product-lead'in sonraki `tutorial[]` değişiklikleri (B1 adım 2 Y + `piece:0`; B2 3 adım; B4 adım 2 ×2, adım 3 `piece:2`; B7 `at: [0, 6]`) bu satır yazıldıktan sonra geldi; "birebir" ancak tur 2 #0 eşitlemesinden sonra yeniden doğrudur.
- product-lead.md#K-34'ün öğretimi yok → KAPANDI (UX §5.4: rozet "↓" + eksik destek hücrelerinde yatay tarama, 45° yalnız renk uyuşmazlığında; §5.5 dört katman; `tut.ctx.support`; `tut.ctx.bounce.color/window/offplan` nedenlere ayrıldı; JUICE #83, #84; tokens `plan.front*`, `color.ghost.support`, `duration.supportFlash`)
- product-lead.md#gizli hücrede gölge → KAPANDI (UX §5.4 satırı: açılmamış `?` hücresine değen gölge bütün zorluklarda nötr, rozet yok; JUICE #7 `sfx_ghost_ok` çalmaz; çatlak cam yine görünür)
- product-lead.md#hafif yerçekiminde yönlendirme girdisi → KAPANDI (R-10 girdiyi "tahtaya dokunma, dokunulan taraf = yön" olarak bağladı; şantiye + vinç alanıyla sınırlama bu yüzden alınmadı. Endişe UX §5.6 "tutma ile ayrım" kuralıyla giderildi: bir bloğun üstünde başlayıp eşiği aşan dokunuş yönlendirme değil tutmadır (GDD E-40); `tut.l23.steer` "Düşerken bir yana dokun, o yana kaysın.")
- product-lead.md#bölümden çıkış onayı → KAPANDI (UX §5.1: `m = 0` "Henüz hamle yapmadın; can gitmez." + güçlendirici iadesi, `m ≥ 1` "Çıkarsan 1 can gider.", Köprü ek satırı; STORY `exit.*`; R-13)
- product-lead.md#güçlendirici akışı K-36…K-40 → KAPANDI (UX §5.2 tablosu: Vinç şantiyede yalnız doğru (K-34 dahil) hedef, Fırça yalnız bölümün plan renkleri, Geri Al gri durumları + `booster.noUndo`, Altın Mala yalnız `eligibleTrowelCells`; `tut.ctx.goldtrowel` "Altın Mala'yla parlayan bir hücreye dokun.")
- product-lead.md#Açık Kepenk → KAPANDI (UX §4 ve §5.2: W4/W7 yoksa gri "Bu bölümde kepenk yok"; JUICE #67 bayrak yalnız Kepenk ve Kilitli geçitte; `tut.l20.openshutter` "beş hamle kepenkler ve kilitler açık")
- product-lead.md#Bölüm 8 öğreticisi → KAPANDI (LEVELS B8 verisine göre: adım 1 Y `tut.l8.heavy` "Bu çok geniş. Kenara çek ya da kır." (iki yol açık), adım 2 Y Çekiç; zorunlu Çekiç adımı kalktı. LEVELS adım 1'i Z yerine Y seçti, UX LEVELS'e uyar)
- product-lead.md#Bölüm 27 `repeat` öğreticisi → KAPANDI (UX §13.2: el ve ok aynı dilimde `period` satır aşağıdaki açık hücreden `?`'e dikey; panorama yalnız B29 `mirrorOf`; `tut.l27.repeat` "Aşağıdaki desen tekrar ediyor.")
- product-lead.md#Bölüm 22 boya kapısı öğreticisi → KAPANDI (UX §13.2: adım 1 Z boya + sahaya geri çek (`via`), adım 2 Y duvar üstünden, adım 3 Y Fırça; `tut.l22.paint`, `tut.l22.over`)
- product-lead.md#Köprü'yü bitirme durumu → KAPANDI (UX §9 "bitirdi, bekliyor" ve "ödeme" durumları; STORY `bridge.finished` / `bridge.payout`; "Topla" yalnız köprü kapanınca)
- product-lead.md#Usta Ligi çizgileri ve ödül bantları → KAPANDI (UX §10: bronzda düşme çizgisi yok, elmasta terfi çizgisi yok; satır sağında ödül bandı ikonu 1–3 / 4–20 / 21–50; ASSET `icon_reward_*`)
- product-lead.md#Bonus İnşaat örnek sayıları → KAPANDI (UX §6 "+7 hamle → ● 21", "Altın Mala ×1 → ● 10", ödül satırı 30 + 21 + 10; JUICE #56 en çok 10 hamle canlanır; bütün sayılar economy.json)
- product-lead.md#kasaba görevleri (STORY §5 ↔ META §1) → KAPANDI (UX §2.2 `town.ch1.t1.name` "Ağaç basamakları"; §3 boş durum `home.empty` "Yeni yapılar yolda" (yalnız Hikaye 5 sonunda); STORY §5 maliyetleri META ile birebir, "öneri" notu kalktı)
- product-lead.md#ipucu satırlarının kurala uygunluğu → KAPANDI (STORY §6: `tut.l35.mortar` "Harçlı blok yanlış yere düşerse yapışır.", `tut.l18.bag`, `tut.l10.crane` "Vinç gömülü bloğu da çıkarır, döndürür." ("istediğin yere" şantiyede yanlış olacağı için alınmadı); ekranda görünen metnin tek kaynağı STORY §6 (R-08); product-lead kapanışındaki R-08 doğrulama maddeleri de güncel: `tut.ctx.bounce.*`, `tut.l15.heavyfall`, `tut.l23.steer`, `tut.l20.openshutter`, `tut.ctx.goldtrowel`, `tut.l29.mirror`, `tut.l5.segments`, `tut.ctx.support`, `tut.l15.setting`; LEVELS/GDD/OBSTACLES/META'daki bütün `tut.*` anahtarları STORY'de var)
- product-lead.md#olay oynatma sırası (JUICE ↔ K-35) → KAPANDI (JUICE §0 kural 10: adım 1–4 sıralı, 5 eşzamanlı, 6 kademeli, 8 → 9 sıralı ve kilitli, 10 eşzamanlı (en uzun 500 ms), Kamyon Yardımı, kazanma/kaybetme en son)
- product-lead.md#Kamyon Yardımı ve cam animasyonları → KAPANDI (JUICE #21a D1 zincir/ıslaklık, #21b D2 eksik `B1` teslimi, #21c D3 yeniden diziliş + üç Dede balonu; #42 cam blok K-17 sırasıyla başlangıç hücresine döner)
- product-lead.md#balon tavanı görünürlüğü → KAPANDI (ART §4 tavan kirişi her bölümde, 12 px `plan.ceilingBeamPx`, asansörle hareket eder; JUICE #43 "tavana takılır"; ASSET `board_ceiling_beam`)
- product-lead.md#saklı nesne ışıltısı → KAPANDI (ART §6: ışıltı + 28 px soluk vida/anahtar simgesi her zorlukta; ASSET `obs_glint`; GDD K-42 ile aynı)
- product-lead.md#palet ve renk adı (P-1, P-9) → KAPANDI (R-05: ART §2.1 "Gök Mavisi" / Sky Blue, palet P-1; benim belgelerimde eski ad ve brif hex'leri yalnız ART §2.1 karşılaştırma sütununda ve ad notunda)
- product-lead.md#FTUE'de bölüm öncesi pencerenin atlanması → KAPANDI (UX §2: Bölüm 1–2'de pencere yok; can yine bölüm başında ayrılır, üst çubukta gösterilmez)

## Kararlar (R-xx) uygulaması

- [x] R-01 K-34 görünürlüğü: UX §5.4–5.5, §13.2 (B3, B4), bağlamsal `tut.ctx.support`; ART §4 inşa cephesi + eksik destek taraması; JUICE #83, #84; tokens `plan.front*`, `plan.supportHatch*`, `color.board.buildFront`, `color.ghost.support`, `alpha.buildFrontGlow`, `alpha.supportHatch`, `duration.supportFlash`. Proje sahibi onayı bekliyor.
- [—] R-02 (GDD/TECH): dosyalarımda değişiklik gerekmedi; oynatma sırası K-35'e bağlı (JUICE kural 10).
- [x] R-03 Duvar = sıfır genişlikli sınır: UX §5.1, ART §5 ifadesi (60 px yalnız görsel şerit).
- [x] R-04 Ölçüler: tokens `layout.grid.cellPx` 120, `wallW` 60, üst/alt/tahta/pencere çapa grupları ve değişmezler.
- [x] R-05 Palet P-1, plan hücresi P-2, sembol mürekkebi P-3, çift kodlu gölge P-7, "Gök Mavisi" P-9: ART §2–§4, tokens `color.block`, `check.*`; bu oturumda ART §2.4 ızgara token adı tokens'a eşitlendi.
- [x] R-06 FIT ↔ EXPAND: tokens `meta.scale` + çapa sözleşmesi; UX §0.1 iki kip; proje sahibine soru.
- [x] R-07 35 görev esas: STORY §5 değişmedi, maliyetler META §1 ile aynı; ASSET 35 kasaba parçası.
- [x] R-08 Öğretici metinleri: tek küme `tut.l{n}.{konu}` / `tut.ctx.*` / `tut.meta.*`, "blok", renk adı yok, `{n}`; metin STORY §6.
- [x] R-09 Ara sahne tetikleyicisi: bu oturumda UX §8 ve STORY §3 META §1'e eşitlendi (`story.chN.start` = o bölümün 1. görevi; bir eylem bir sahne).
- [x] R-10 G-L girdisi: UX §5.6, JUICE #46, `tut.l23.steer`, tokens `drag.steerSwipeMinPx`, `hud.steerChipPx`.
- [x] R-11 1400 ms erişilebilirlik ayarı: UX §5.7, §11, §14; JUICE #45; STORY `tut.l15.setting`.
- [x] R-12 Animasyon sırasında girdi + "Animasyonları azalt" = solma: JUICE kural 3 ve 8, UX §0.3, §14.
- [x] R-13 Bölüm içi devam + çıkış onayı: UX §1, §5.1, §12; JUICE #87; STORY `exit.*`, `resume.title`, `tut.ctx.resume`.
- [x] R-14 Botlar: UX §0.3, §9, §10; STORY §7.2, §7.4; ASSET bot kaskları + `ui_bot_badge`.
- [x] R-15 Teklif etiği: UX §0.3, §7; JUICE #52; STORY §7.3.
- [x] R-16 Tek değerler ekranda: UX §7 Köprü tavanı ● 4.050, §11 kumbara 1.000 / 2.000 / $1,99 (sayılar config'ten).
- [x] R-17 Usta Modu "MVP (onay bekliyor)": UX §3 içerik sonu kartı, STORY `master.*`, ASSET `icon_master_chest`.
- [—] R-18 (hamle bütçeleri): dosyalarımı etkilemiyor.
- [x] R-19 Albüm Sonra: UX §3, §8, §12; JUICE #75; STORY §4.1; ASSET §7, §10.
- [—] R-20 (debug yalnız DEV): kod kararı; UX/TECH CVD ekran aracı yalnız DEV'de.
- [—] R-21 (Bölüm 4 geçidi boy 2): UX §13.2 B4 adımları LEVELS'e göre; görsel değişiklik yok.
- [x] R-22 Panorama önizlemesi oyun durumunu değiştirmez: UX §5.1.
- [x] R-23 Yaş ekranı yalnız mağaza sürümü: UX §2.3 [Mağaza], §12; ASSET `ui_keypad_key`.
- [x] R-24 EN adlandırma: STORY §0-6 / §0-10 "Kepche", `{company}` = "Tuna & Co.", "Little Builder" yok; ASSET `logo_wordmark`.

## Diğer ajanlara bağımlılıklar (bu turdan doğan)

- code-lead: `layout` ölçüleri `layout.grid.*` altında (TECH §2.2 `layout.cellPx` atfı); plan / sembol mürekkebi hazır renkleri
  `check.*` altında (TECH §10.2 `color.plan.X`, `color.symbolInk.X`, `color.planStroke.X` atıfları); yeni `audio.seq`
  biçimi `[ms, ZzFX parametreleri][]` (tek arabellekte toplama) — `sfx.ts` şeması buna göre; `audio._doc` anahtarı ad
  değildir.
- product-lead: yok (UX §13.2 ve STORY §6, tur 2 #0 eşitlemesinden sonra LEVELS'in güncel `tutorial[]` verisiyle birebir; B1 adım 2, B2 adım 2–3, B4 adım 2–3 ve B7 adım 1 satırları 2026-10-05'te LEVELS'e eşitlendi).
- entrepreneur: ASSET §14 iş yükü tablosu BUSINESS §10'la karşılaştırılabilir (≈ 126 sanatçı-günü, P0 ≈ 67).

## Proje sahibine açık sorular (yorumlardan değil, karar ve önerilerden)

1. R-01: K-34 "Alttan Üste" kuralı görünürlük katmanlarıyla (UX §5.5) onaylanıyor mu?
2. R-06: Ölçekleme FIT (brif) mi, EXPAND (öneri) mi? Belgeler ikisinde de çalışır.
3. Tuna'nın görsel yaşı: brifteki 8 mi kalsın, 10–12 görünüme mi çekilsin? (Yaş her durumda oyun içi metinde geçmez.)
4. Bilgi: blok paleti (P-1) brifteki hex'lerden renk körlüğü nedeniyle değişti; renk kodları ve B'nin adı "Gök Mavisi".

## Tutarlılık denetimi (tur 1)

Tarih: 2026-10-05. Bağımsız denetim + şüpheci onayı; yalnız design-lead dosyaları düzenlendi.

- #0 Panorama gelecek dilimleri (K-06) → KAPANDI (UX §5.1: gelecek dilimler plan renkleriyle %30 opak `alpha.panoramaFuture`, `?` hücreleri `?` etiketiyle, semboller büyük önizlemede; ASCII taslak `▣▣ [▣▣] ░░ ░? ░░`; ASSET `segment_mini_<n>`; tokens `alpha.panoramaFuture` 0,3)
- #1 Harç maliyeti önizlemesi (K-07, Y8) → KAPANDI (UX §5.1: "−2" çipi yalnız şantiyeye yapışmış harçlı blokta; sahadaki harçlı blokta çip yok; iptal öngörüsünde çip soluk)
- #2 Gölge/geri sekme nedenleri ↔ `verdict.reasons` → KAPANDI (UX §5.4: "renk / şekil" → "renk (`color`)"; yeni `debris` satırı (rozet "!" + tarama + moloz vurgusu); satırlar `debris`/`outside`/`window`/`color`/`support` ile birebir + "birincil neden" notu; UX §13.2 ve STORY §6: `debris` geri sekmesi `tut.l17.debris` satırına eşlendi, yeni anahtar yok)
- #3 Vinç alanı "2 sıra" işareti (K-05 `10 − height`) → KAPANDI (ART §5: açık yükseklik işareti `10 − height` çentik, duvar 7 → 3; UX §5.3 koşul "boy > `10 − height`"; UX §13.2 bağlamsal satır)
- #4 Geri Al sayaç dönüşü (K-39) → KAPANDI (JUICE #64: sayaç harcanan miktar kadar, +1 ya da +2 geri döner)
- #5 Dar geçit (W3) bir katman → KAPANDI (ART §5 "Dar" satırı: `size = 1` olan her tipe çene + 10 px çerçeve katmanı, tip işaretleri korunur; dar kepenk/kayar kapı/boya kapısı/kilitli görünümü tanımlı; ASSET `gap_narrow_jaw`)
- #6 Bölüm 17 vurgu kimliği → KAPANDI (UX §13.1 sözlüğüne `debris:<i>` = `build.debris[]` sırası; satır 17 `debris:0`)
- #7 Kamyon Yardımı D1 ikinci dalı → KAPANDI (JUICE #21a: zincir/ıslaklık yoksa ya da hâlâ D1 ise #21c + `tut.ctx.reshuffle`, birlikteyse 900 ms içine bindirme; #21c D1 `reshuffle` / D3 `reshape` ayrımı; UX §13.2 bağlamsal tablo; STORY `tut.ctx.truckhelp.free` metni her D1 dalında doğru olacak biçimde "Kamyon yardım etti, bloklar serbest. Devam!")
- #8 Harç yapışmasında eksik destek → KAPANDI (JUICE #14: `mortarStuck.reason = support` ise ardından #84; #84 başlığı genişletildi; UX §5.5 madde 3 "geri sekme ya da harç yapışması", §5.4 ve §13.2 aynı)
- #9 [Engel] ch2–ch5 başlangıç sahnesi tetikleyicisi → KAPANDI (STORY §3 tablo 2–5. satırlar ve metin META §1 / `economy.json town.cutscenes` ile birebir: ch1 = 1. görev, chN (N ≥ 2) = N−1 bitişinden sonra ana ekranın bir sonraki açılışı, bitiş sahnesinin kapanması açılış sayılmaz; UX §8 tetikleyici maddesi aynı metin + META örneği; UX §3 yeni durum "Başlangıç sahnesi bekleniyor"; UX §12 akışına H → S kenarı)
- #10 Köprü altın düğmesi gri koşulu → KAPANDI (UX §7: `tur harcaması + bu teklifin fiyatı > 4.050` ise gri + `lose.bridgeCap`, örnekli; STORY `lose.bridgeCap` metni "Bu turun altın sınırı bu teklife yetmez." — tavan dolmadan da doğru)
- #11 Usta Modu kazanma ekranı → KAPANDI (UX §6: yıldız yok, Bonus İnşaat ve Altın Mala normal, miktarlar özgün zorluk etiketinden (META §8.5); "yalnız kazanma tabanı" yalnız BUSINESS §9.2 "Sonra" yedeği notu)
- #12 Galibiyet serisi bonusu Termos ikonuyla → KAPANDI (UX §4 ve JUICE #68: "Altın Mala ×N" + "+N hamle" çipi `ui_moves_chip`; Termos ikonu yalnız Termos güçlendiricisi; ASSET yeni `ui_moves_chip`)
- #13 Günlük ödül ×2 altınsız günler → KAPANDI (UX §3.1: 2./4./6. günde ×2 düğmesi gösterilmez, "Topla" tek başına, reklam hakkı tüketilmez; 7. günde yalnız altın ikiye katlanır; STORY `daily.double` "Reklam · altın ×2")
- #14 ●, ✓, ≈ font alt kümesi → KAPANDI (ART §8: alt kümeye U+2248 eklendi, pyftsubset ile ölçüldü 38.648 B; "i18n metninde alt küme dışı karakter yok" kuralı + code-lead test notu; STORY §0-11 satır içi simge yer tutucuları `{coin}` → `icon_coin`, `{ok}` → `ghost_badge_ok`; STORY'de 14 ● ve 1 ✓ değiştirildi; UX §0.3 wireframe "●" = simge notu, UX §9 `{coin}{share}`)
- #15 128 px altı dokunma hedefleri → KAPANDI (UX §0.3 yeni "Görsel + pay" genel kalıbı; üst çubuk hapları 112 + 2×8 = 128; döndürme okları ve renk düğmeleri 112 + her yanda 8 = 128; durum şeridindeki Usta Serisi mala 96 + 2×16 = 128)
- #16 PriceLabel 2. satır kontrastı + ART inkSoft değeri → KAPANDI (UX §0.3 ve ASSET `ui_price_label`: renkli düğmede `ui.ink` (turuncu 6,5:1, yeşil 5,3:1), krem zeminde `ui.inkSoft`; ART §2.3 inkSoft "8,1:1" → ölçülen 6,5:1 + renkli zeminde kullanılmaz notu)
- #18 JUICE §0.1 K-19 cümlesi → KAPANDI (JUICE §0.1 dipnotu "GDD K-19 hız değeri içermez"; GDD'de değişiklik gerekmedi, K-19 zaten doğru)
- #19 İskele sönme süresi → KAPANDI (200 ms tek değer: JUICE #18 ve ART §4 aynı; tokens `duration.scaffoldFade` 200 + mevcut `alpha.segmentDoneScaffold`)
- #20 Kazanma süresi (#55) → KAPANDI (tokens `duration.winGlow` 400, `winRibbon` 600, `winConfetti` 1500; `duration.win` = toplam 2500 (eski 1500); JUICE #55 süre sütunu ve UX §6 sırası token adlarıyla)
- #21 Anahtarsız görsel değerler + Kamyon Yardımı kilit süresi → KAPANDI (tokens: `a11y.colorBlindSupportHatchPx` 8, `colorBlindPaintSymbolScale` 1,3, `colorBlindContrastBoost` 0,15, `colorBlindGhostStrokeAddPx` 2, `duration.frontShift` 160, `truckHelpUnchain` 600, `truckHelpDeliver` 700, `bounceToQueue` 400, `alpha.ghostGlow` 0,4, `stroke.ghostGlowPx` 8; ART §10 token tablosu, "kontrast +%15" tanımı sayıyla; JUICE #21a/b, #83, #88 token adları; JUICE kural 3 ve UX §0.3 kilit "600–900 ms (varyanta göre)")
- #22 Çıkış onayı "Kal" düğme boyu → KAPANDI (UX §0.3 yeni "Eşit çift düğme" kalıbı 440×152, birincil en küçük boy kuralının bilinçli istisnası, ≥ 128 px; çıkış onayı, günlük ödül, kural kartı, Usta Modu kartı bu kalıp; nötr düğme örneğinde "Kal" → "Çık" (Kal yeşil))
- #23 B plan sembol mürekkebi kontrastı → KAPANDI (tokens `color.planInk.B` #FFFFFF → #14233D (4,8:1; inşa cephesinde 5,8:1); ayrıca `alpha.planInkLight` 0,9 → 1,0: R inşa cephesinde beyaz %90 ile 2,9:1'e düşüyordu, şimdi 3,2:1; ART §4 ölçülmüş kontrast listesi)
- #24 "Gök Mavisi" adının ekrandaki yeri → KAPANDI (ART §2.1: renk adları yalnız belgelerde, oyuncuya görünen hiçbir metinde yok; STORY'ye `color.name.*` eklenmedi; ART §10'da ad etiketi yok notu)
- #25 Hikaye Bölümü 4 arka plan katmanları → KAPANDI (ART §7 tokens'a eşitlendi: Uzak ufuk #7FD8D2, Orta deniz #2FB7B3, Yakın kayalık #3F7F8C + köpük; ch5 Yakın'a token #2E2464 yazıldı; "ilk hex = `color.chapter.*`" kuralı)
- #26 Nötr düğme varyantı → KAPANDI (ASSET `ui_button_<primary/secondary/neutral/danger/disabled>`)
- #27 Sembol brifi çizgi/dolu → KAPANDI (ASSET `sym_<W..P>`: W, R, O, C çizgi 7–9 %; Y, G, B, P dolu siluet, G ve P'de taban renkli oyma; ART §3.1'e atıf)
- #30 Köprü kayıp penceresinde kural satırı (R-15) → KAPANDI (UX §7 Köprü durumundan `lose.bridge` çıkarıldı, yalnız nötr "Kalan: n hücre"; kural yalnız `bridge.rule_card.*` ve (i) panelinde; STORY §7.3'ten `lose.bridge` silindi, "Kaldırılanlar" notuna eklendi)
- #31 `tut.l26.key` ve JUICE §0.1 dipnotu → KAPANDI (STORY: "Anahtarın üstündeki bloğu kaldır, kilit açılsın!" / "Move the block off the key to unlock!"; JUICE §0.1 dipnotu #18 ile aynı düzeltme)

Bu turdan doğan bağımlılıklar:
- code-lead: TECH §8.2 vurgu sözlüğü regex'i ve L-17'ye `debris:<i>` (< `build.debris` boyu); i18n alt küme testi ("i18n glyphs within Baloo 2 subset") ve `{coin}` / `{ok}` satır içi simge çizimi; `duration.win` 1500 → 2500 (toplam) + yeni `winGlow`/`winRibbon`/`winConfetti`; Kamyon Yardımı kilidi varyanta göre (`truckHelpUnchain` 600, `truckHelpDeliver` 700, `reshuffle` 900; TECH §5 "reshuffle 900" satırı); `lose.bridge` anahtarı kaldırıldı; `color.planInk.B` ve `alpha.planInkLight` değişti.
- entrepreneur: BUSINESS §4.5-6 "tavana ulaşılınca 'Bir sonraki köprüde görüşürüz'" ifadesi UX §7'deki gri düğme + `lose.bridgeCap` ile eşitlenebilir (sunum UX'te; kural değişmedi).

## Tutarlılık denetimi (tur 2)

Tarih: 2026-10-05. Bağımsız denetim + şüpheci onayı; yalnız design-lead dosyaları düzenlendi.

- #0 UX §13.2 Bölüm 1, 2, 4, 7 ↔ LEVELS `tutorial[]` → KAPANDI (UX §13.2: B1 adım 2 Z → **Y**, vurgu `piece:0 (a)` + `build`, el yok (LEVELS `—`; `a` oyuncunun parmağında); B2 adım 2 `piece:2 (c)` hold, gölge "!" + yeni adım 3 `piece:1 (b)` drag, `tut.l1.match`, `placementCorrect` ×1; B4 adım 2 `placementCorrect` ×2, adım 3 `piece:2 (p)`; B7 adım 1 `yardMove` ×1 + `at: [0, 6]`; B3, B5, B6, B8, B9, B10 yeniden karşılaştırıldı, fark yok. Bu dosyadaki iki "birebir" satırına tur 2 notu eklendi; STORY §6'da yeni anahtar gerekmedi)
- #1 Kilitli yuvada adet (META §4) → KAPANDI (UX §0.3 "Kilitli öğe": adet > 0 ise sağ üst köşede gri adet rozeti Ø 56, `ui.badgeLocked` + beyaz sayı, kilitliyken "+" yok; UX §4 kilitli yuva durumu Bölüm 10 sandığı → Bölüm 11 Termos örneğiyle, açılışta 1 + 3 = 4; UX §5.1 bölüm içi yuvalar aynı; UX §2: 3–11 arası pencerede üç yuva kilitli görünür; UX §3.1 yeni "Kilitli güçlendirici ödülde ve pakette" paragrafı (günlük ödül, sandıklar, başlangıç paketi: tam renkli ikon + asma kilit + "Bölüm N"), §11 başlangıç paketi notu; tokens `color.ui.badgeLocked` #6B5440 (beyaz 7,1:1) + ART §2.3 satırı; ASSET `ui_booster_slot`; STORY §7.5 yeni `common.unlockAt` "{n}. bölümde açılır" (sayıya göre ek uyumu gerektirmeyen biçim), UX §0.3 ve JUICE #73 bu anahtara bağlandı)
- #2 Kural özetleri ↔ GDD son hali → KAPANDI (UX §5.5/1 ve ART §4: inşa cephesi "doğru dolu ya da **boş** `.`; sütun tamamsa ya da altındaki `.`'da moloz / yapışmış harç varsa cephe yok, K-34 kanca 1, E-43"; UX §5.4 `support` satırı ve ART §4 tarama: eksik destek = `missingSupport` (boş plan hücreleri + yanlış nesneli `.`), ART'ta "geri sekme ya da harç yapışmasından sonra"; JUICE #84 "eksik destek hücreleri (`missingSupport`)"; JUICE #64 "+1 / +2 / +3" (yapışmış harçlı cam 3, K-07); UX §5.2 Altın Mala satırındaki §5.4 atfı §5.5 yapıldı)

Bu turdan doğan bağımlılıklar:
- code-lead: yeni token `color.ui.badgeLocked`; yeni i18n anahtarı `common.unlockAt` (`{n}` sayı); `ui_booster_slot` kilitli + adet > 0 durumu (gri rozet) ve ödül / paket pencerelerinde kilitli güçlendirici işareti (`icon_lock` 40 px + "Bölüm N").

## Son tutarlılık turu 1

Tarih: 2026-10-05. Yalnız design-lead dosyaları düzenlendi (UX_FLOWS, STORY, JUICE, ASSET_LIST, tokens.json).

- #0 Bölüm 23 ve 32 Z adımlarında tutulabilir blok yok (GDD §14.1/4a) → KAPANDI (UX §13.2: B32 vurgu `piece:<i>` (çözümün ilk 1 genişlikli bloğu) + `fan` + `build`, el drag + hold; B23 iki adım: 1 Z `piece:<i>` (1 genişlikli) + `crane` + `build`, yeni `tut.l23.light` "Hafif yerçekimi! Bloklar yavaş düşer.", `overWall` ×1; 2 Y `build` + düşüşte "↔" çipi, `tut.l23.steer`, `steered` ×1; 14, 22, 38 Z satırlarında blok vurgusu `piece:<i>` olarak açık yazıldı; §13.2 başına "Z satırı kuralı" notu. LEVELS §3 `done` tablosu product-lead'e bağımlılık: 23·1 `overWall`, yeni 23·2 Y `steered`)
- #1 D-035 "Yapı tamam!" sunumu yok → KAPANDI (UX §5.1 yeni "Şantiye kapalı" durumu: altın kurdele 306×96, x 750–1056, y 960–1056, −6°, `build.done`, 8,5:1; eksik `clear` sayacında 3 nabız + kalan nesnelerde bir parlama; şantiye üstünde ↩ iptal öngörüsü, gölge yok, harç çipi soluk; §5.3 iptal öngörüsü ve §5.4 gölge tablosuna E-27 satırı; JUICE #89 (kurdele `duration.siteClosedRibbon` 400 + 3 × `goalNudge` 600) ve #90 (kapalı şantiyeye bırakma); STORY §7.5 `build.done` TR "Yapı tamam!" / EN "Build complete!"; tokens `layout.board.siteRibbon*`, `duration.siteClosedRibbon`, `duration.goalNudge`; ASSET `ui_site_ribbon`)
- #2 UX §3 Usta Modu "Sonra" iken pasif düğme → KAPANDI (UX §3 içerik sonu `masterMode.variant` ile iki düzen: `master` Usta Modu; `replay` "Tekrar · Bölüm {n}" 11…50 döngüsü, özgün bütçe, yıldız yok, yalnız kazanma tabanı, seri/Köprü/Lig'e sayılır, Usta Sandığı verilir; iki düzende de düğme oynanabilir ve "Yeni bölümler yolda" bandı kalır; pasif düğme tarifi kaldırıldı; UX §6 "Tekrar turu" kazanma durumu; §12 akışına 50 sonrası kenarı; STORY `replay.button`, `replay.card.title`, `replay.card.body`)
- #3 LiveOps parametrelerinin sunumu → KAPANDI (STORY §7.2: `league.rule_card.points` ve yeni `league.points_line` `{easy}` `{normal}` `{hard}` `{superhard}` (çarpansız taban); yeni `league.bonus.all`, `.weekend.factor`, `.weekend.add`, `.levels.some/.all`, `.fair`, `.now`, `.starts`, `difficulty.*`; `bridge.rule_card.extra`, `bridge.extra.got`, `bridge.rule_card.daily`, `bridge.dailyLimit`, `{extras}` satır içi simge tanımı ve görünürlük koşulları; UX §10 LiveOps bandı 1000×120 + "Şimdi geçerli / Başlıyor" çipi + "Bonus çıraklara da uygulanır" (E8), alt puan satırı config'ten, kazanma ekranında çarpanlı puan + çip; UX §9 kural kartına ek ödül ve günlük sınır satırları (t_0 donması), havuz altına ek ödül satırı, "bitirdi" durumunda `bridge.extra.got`, yeni "günlük sınır doldu" durumu; UX §6 7. tahtada ek ödül satırı; ASSET `ui_bonus_band`)
- #4 Tuna'yı küçük gösteren espri (S15, D-044) → KAPANDI (STORY §4.1 Panel 2 Gribeton: "Renkli ilan mı? Verimsiz! Gerçek işler gri betondan yapılır." / "A colorful poster? Inefficient! Real work is made of gray concrete." — bitiş sahnesindeki "Verimsiz… ama ilginç" ile eşleşir; §3 Sorun: "Yeni açılan firmaya kimse iş vermez (referans yok); Gribeton burun kıvırır"; STORY'de yaşa değinen başka satır yok)
- #5 Config sayıları metne gömülü (D-017) → KAPANDI (STORY: `tut.l12.thermos`, `tut.l20.openshutter`, `tut.ctx.streak`, `tut.meta.bridge`, `tut.meta.chest`, `bridge.rule`, `bridge.rule_card.win` `{n}`; `bridge.remaining` `{n}/{max}`; `league.rule_card.lines` `{up}`/`{down}` ("Hafta bitince", hafta sonu bonusuyla karışmasın); `league.bots_info` `{n}`; `lives.full` `({max})`; `master.card.chest` `{n}`; aynı sınıftan `lose.offer`, `lose.offer.gift`, `lose.ad` `+{n}`, `lose.offer.count` / `.last` `{n}/{max}`; her tabloya config anahtarı eşleme notu)
- #6 Devam akışında teklif penceresi ve kazanma ekranı istisnaları → KAPANDI (UX §1: `outcomeWindow = 'outOfMoves'` ise Duraklat açılmaz, Pencere 1 aynı "Teklif n/3" ile açılır; kazanma ekranında kapandıysa ana ekran, ödül tekrar verilmez, bekleyen sandık penceresi ana ekranda bir kez açılır; UX §5.1 aynı not; §12 akışına iki kenar; §13.2 `tut.ctx.resume` teklif penceresine dönüşte gösterilmez; JUICE #87 istisnalar)
- #7 Bölüm 12 ve 16'da `pre:` adımı 2. sırada → KAPANDI (UX §13.2: 12 ve 16'da `pre:` adımı 1., oyun içi adım 2.; §13.1 "`pre:` vurgulu adım her zaman 1. adımdır" + adım alanlarına `startOn`. LEVELS §3 tablosunda 12·1↔12·2 ve 16·1↔16·2 sırası product-lead'e bağımlılık)
- #8 "Hamleler bitti" seçenekleri rahat bölge dışında → KAPANDI (pencereler alttan çapalanır: yeni token `layout.popup.panelBottomPx` 296 + `_doc` değişmezi; UX §0.1 kural; §7 tel çerçeve panel 456–1624, seçenekler 1056–1560; §4 bölüm öncesi pencere 344–1624'e kaydırıldı; tek düğmeli pencerede düğme 1408–1560 (birincil ≥ 1400). TECH §1706 "dikey ortalanır" satırı code-lead'e bağımlılık)
- #9 Yedek plan panel tasarrufu −3 yerine −4 → KAPANDI (ASSET §9: ch4 5→4, 5→4, ch5 başlangıç 4, final 6→4 = −4 panel, 47 → 43; §14 "−4 panel = −4 gün", talep ≈ 122 g; STORY §4.4–§4.5 "Yedek plan" notları: ch4 başlangıç Panel 3, bitiş Panel 5 kesilir; final Panel 1+2 ve 3+4 birleşir, balonlar korunur)
- #10 ASSET "tampon yok" ↔ BUSINESS kapasite → KAPANDI (ASSET §14 BUSINESS §10'un güncel hesabına eşitlendi: talep ≈ 126 g, kapasite 1,0 FTE × 22 hf + 0,5 FTE × 16 hf ≈ 150 g, pay ≈ %16 (≈ 24 g); "1,5 FTE ile ≈ 17 hafta" yalnız süre hesabı olarak açıklandı; yedek planla pay ≈ %19. BUSINESS §10 şu an 126 g / 150 g / %16 yazıyor — denetimdeki 127 / 155 / %18 değerleri eski; entrepreneur'e bildirilecek fark kalmadı)

Bu turdan doğan bağımlılıklar:
- product-lead: LEVELS §3 "11–38 `tutorial[]` `done` eşlemesi": 12·1 `{ event: tap }` (`pre:thermos`) ↔ 12·2 `{ timeoutMs: 2000 }`; 16·1 `{ event: tap }` (`pre:trowel`) ↔ 16·2 `{ event: turnEnd }`; 23·1 Z `{ event: overWall }` + yeni 23·2 Y `{ event: steered }`; "11–50 öğretici notları"nda Bölüm 23 iki adım.
- code-lead: yeni tokenlar `layout.popup.panelBottomPx`, `layout.board.siteRibbon{X,Y,W,H,TiltDeg,NotchPx}`, `duration.siteClosedRibbon`, `duration.goalNudge`; TECH §1706 pencere çapası (ortalama → alttan); yeni i18n anahtarları (`tut.l23.light`, `build.done`, `replay.*`, `bridge.rule_card.extra/.daily`, `bridge.extra.got`, `bridge.dailyLimit`, `league.points_line`, `league.bonus.*`, `difficulty.*`) ve mevcut anahtarlarda yeni yer tutucular (`{n}`, `{max}`, `{up}`, `{down}`, `{easy}`…`{superhard}`, `{extras}`); devam açılışında `outcomeWindow` → doğrudan Pencere 1; kazanma ekranında kapanmada bekleyen sandık penceresinin ana ekranda bir kez açılması için kayıt işareti; `siteClosed` iptalinde JUICE #90.

## Son tutarlılık turu 2

Tarih: 2026-10-05. Yalnız design-lead dosyaları düzenlendi (JUICE, UX_FLOWS, STORY, ART_DIRECTION, tokens.json).

- #0 JUICE Faz 2 P0 listesi ↔ TECH §14.1 kapsamı (K-33, K-43, K-26/K-17 adım 3, W1) → KAPANDI (JUICE §0 kural 12: Faz 2 P0 = #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88; #16 MVP-lite kalır; engel kuralına istisna "Faz 2'deki W1/S1/S2'nin olayları Faz 2'de: W1 = #22, #23; S1 = #18–20; S2'nin ayrı olayı yok, #7 ve #13 yeter", kalanlar Faz 3; tokens `audio.sfx` + `sfx_streak_pip`, `sfx_trowel`, `sfx_clamp` ve `audio.seq` + `sfx_gap_rail` eklendi (JUICE sözlü tariflerinden; artık P0 olaylarının bütün sesleri tokens'ta dolu, betikle doğrulandı). Bağımlılık: code-lead TECH §14.1 kapsam satırı ve #11/#13'teki P0 listesini aynı kümeye eşitler)
- #1 UX §13.2 bağlamsal tetikler ↔ GDD §14.1 (`tut.ctx.*` / `seenContextTips`) → KAPANDI (bağlamsal tablodan moloz satırı (`tut.l17.debris`) çıkarıldı: S4 ilk kez Bölüm 17'de gelir, oranın Z adımı aynı satırı gösterir; Bölüm 13 adım 2'nin tamam koşulu "— (ilk hatalı yerleşimde de tetiklenir)" yerine LEVELS'la aynı `timeoutMs` 3000; tablonun altına "bağlamsal satır anahtarı yalnız `tut.ctx.*` (meta `tut.meta.*`), `tut.l*` bağlamsal tetik olamaz; moloz ve Geri Al için bağlamsal satır yok" notu; STORY §6 `tut.l17.debris` notu "yalnız Bölüm 17 adımı". `tut.ctx.undo` eklenmedi: Bölüm 13 adım 2 zaten öğretiyor, hata anında güçlendirici kullandırmaya yönelten yeni tetik gerekmiyor. Bağımlılık: product-lead LEVELS §3 13·2 satırındaki "'ilk hatalı yerleşimde de' bağlamsal tetiktir" notunu siler)
- #2 Lig çizgi kuralı metni Bronz/Elmas'ta yanlış → KAPANDI (STORY §7.2: `league.rule_card.lines` → `.both` "Hafta bitince ilk {up} yükselir, son {down} iner.", yeni `.bronze` "Hafta bitince ilk {up} yükselir. Bu ligde düşme yok.", `.diamond` "Hafta bitince son {down} bir alt lige iner." (EN karşılıklarıyla); başlık için yeni `league.header_lines.both/.bronze/.diamond` "İlk {up} terfi, son {down} düşer" / "İlk {up} terfi eder" / "Son {down} düşer"; seçim kuralı STORY config notunda ve UX §10 çizgi kuralında (Bronz `.bronze`, Elmas `.diamond`, Gümüş/Altın `.both`), UX §10 tel çerçevesindeki başlık satırı `league.header_lines.*`'e bağlandı. Aynı denetimde bulunan iç içe anahtar çakışması da giderildi: `lose.offer` (yaprak) ↔ `lose.offer.count/.gift/.last` → `lose.offer` `lose.offer.moves` oldu (TECH §11.5 iç içe JSON; başka belgede başvuru yoktu))
- #3 Çıkış onayında "Kal" rengi ART ↔ UX → KAPANDI (ART §2.3 `ui.neutral` satırı: "Kal" yerine çıkış onayında "Çık"; "Kal" yeşil, eşit çift düğme, UX §0.3 ve §5.1)
- #4 Kasabanın EN adı ("Colorful Hill" ↔ "Hue Hill") → KAPANDI (STORY §0-10: kasaba adı oyuncuya görünen her metinde TR ve EN `{town}` yer tutucusu, değeri tek kaynak `town.name` (TR "Renkli Tepe", EN "Hue Hill" çalışma çevirisi; NAMING kararıyla yalnız bu anahtar değişir), ek yer tutucudan sonraki kelimeye bağlanır; §4.5 `story.ch5.start` Panel 1 "{town} Festivali'ne bir şato lazım!" / "The {town} Festival needs a castle!"; `bridge.bots_label`, `bridge.bots_info`, `league.bots_label` `{town}`'a geçti; §7.5'e `town.name` satırı; §7.2 notu güncellendi. Bağımlılık: code-lead `t()` `{town}` (ve `{company}`) küresel yer tutucularını kendiliğinden doldurur)
- #5 `shop.covers` sayıya sabit "'yi" eki → KAPANDI (STORY `shop.covers` TR "Eksik {coin}{n} için yeterli"; aynı sınıftan `piggy.threshold` "{coin}{n}'de kırılabilir" → "Kırma eşiği: {coin}{n}" (eşik config'ten, ör. 1040'ta); UX §11 örnekleri "Eksik ● 350 için yeterli" (`shop.covers`) ve "Kırma eşiği: ● 1.000"; STORY §0-9'a kural: TR'de sayı yer tutucusuna ek bağlanmaz, cümle eksiz kurulur. STORY'de sayıya ek bağlayan başka satır kalmadı (tarandı))

Bu turdan doğan bağımlılıklar:
- code-lead: TECH §14.1 kapsam satırı ve #11 `EventPlayer` / #13 ses kalemlerindeki "JUICE Faz 2 P0" listesi → #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88 (JUICE §0 kural 12; süre gerekirse yeniden tahmin); yeni ses dizileri `sfx_streak_pip`, `sfx_trowel`, `sfx_clamp` (`audio.sfx`) ve `sfx_gap_rail` (`audio.seq`); yeni i18n anahtarları `league.rule_card.lines.both/.bronze/.diamond`, `league.header_lines.*`, `town.name`; `league.rule_card.lines` ve `lose.offer` anahtarları kaldırıldı (`lose.offer.moves`); `{town}` küresel yer tutucusu (`town.name`); `shop.covers`, `piggy.threshold` metinleri değişti.
- product-lead: LEVELS §3 13·2 `done` satırındaki "'ilk hatalı yerleşimde de' bağlamsal tetiktir, `tutorial[]` değil" notu silinir (UX'te bu tetik artık yok).
- entrepreneur: JUICE kural 12 kapsam etiketinde Faz 2 P0 genişledi (TECH §14.1'in zaten Faz 2'ye koyduğu K-33, K-43, K-26, W1'in sunum olayları); bilgi için.

## Son tutarlılık turu 3

Tarih: 2026-10-05. Yalnız design-lead dosyaları düzenlendi (UX_FLOWS, JUICE, STORY, ASSET_LIST, ART_DIRECTION; tokens.json değişmedi).

- #0 Güncellemeyle geçersiz kalan denemenin sunumu (K-43/4, E-45, D-022) → KAPANDI (UX §1 "Üç istisna": (c) `levelHash`/`rulesVersion` uyuşmazlığında oyun ekranı açılmaz; splash → Ana ekran + tek düğmeli güncelleme penceresi (tel çerçeve): `resume.void.title` "Oyun güncellendi", `resume.void.body` "Bölüm {n} baştan başlayacak. Harcadıkların geri verildi.", iade satırı yalnız > 0 kalemler ikon + adet (can, güçlendiriciler, `{coin}{n}`), Köprü denemesinde `resume.void.bridge` "Köprüdeki yerin korundu.", `common.ok` "Tamam" (920×152, y 1408–1560); pencere ana ekran açılışında ara sahne ve sandıktan önce, bir kez (bekleyen bildirim, "Tamam"la silinir); elenme/kayıp/suçlama dili ve kırmızı yok, `tut.ctx.resume` gösterilmez; §3 yeni durum, §5.1 istisna cümlesi, §12 `A → RV → H` dalı, §13.2 `tut.ctx.resume` satırı; JUICE #87 (c): #70 → "Tamam"da #74 iade uçuşu (Faz 2'de #74 yoksa anında) → #71, #52/#57/#77 oynamaz; STORY §7.5 dört yeni anahtar TR/EN + kullanım notu)
- #1 UX §5.2 madde 4 Geri Al'ı yok sayıyor → KAPANDI (Çekiç, Vinç, Boya Fırçası ve Altın Mala hamle sayacını ve boncuk sayacını değiştirmez, Altın Mala'da yalnız mala adedi 1 azalır; istisna Geri Al: hamle sayacı +1/+2/+3 ve Usta Serisi (o hamlede kazanılan mala dahil) hamle öncesine döner; GDD K-39, K-33, JUICE #64)
- #2 JUICE cam kırılma dönüşü ve maliyeti (yapışmış harçlı cam) → KAPANDI (#42: K-17 hedef sırası başlangıç hücreleri (yapışmış harçlı camda atlanır, yapışma kalkar) → sahanın üstünden düşürme → kamyon kuyruğu (#88); +1 ceza, toplam −2, yapışmış harçlı camda −3; §0 kural 10 "sayaç (#50; maliyet 1 / 2 / 3, GDD K-07)")
- #3 Yapı kartı yalnız ch1 bitişinde → KAPANDI (UX §8 ve ASSET §9: yapı kartı yalnız `story.ch1.end` Panel 4'te (`cut_ch1_end_p4`) ve yalnız gösterilir; diğer bitiş sahneleri STORY'deki son panelleriyle kapanır (ch5 "Devamı yolda…"); "Albüme eklendi" yok; panel sayısı 47 değişmedi. Bağımlılık: code-lead TECH §10.3 Albüm satırındaki "bölüm sonu sahnesinin son paneli yapı kartını gösterip kapanır" cümlesini eşitler)
- #4 `bridge.rule_card.continue` sabit +5 → KAPANDI (STORY §7.2 TR "Kaybedince +{n} hamleyle devam edebilirsin." / EN "You can continue with +{n} moves after a loss."; config notuna `{n}` = `economy.json → outOfMoves.extraMoves`; UX §9 kural kartı özeti de "+{n}")
- #5 Köprü ekranında anahtarsız ve ekli sayı metinleri → KAPANDI (STORY §7.2 yeni `bridge.play` TR "Oyna · Bölüm {n}" / EN "Play · Level {n}" + config notu; UX §9 tel çerçeve "KATIL / OYNA · BÖLÜM 18" (`bridge.rule_card.join` / `bridge.play`), aktif durum `bridge.play`, kilitli durum `common.unlockAt` "15. bölümde açılır")
- #6 Sınırsız can ikonu yok, ∞ karakteri alt küme dışı → KAPANDI (ASSET §10 yeni `icon_life_unlimited` P0: kalp + çizilmiş sonsuzluk işareti, font karakteri değil; ASSET §14 ikon satırı ~46 / 11,5 g, toplam ≈ 126 değişmedi; ART §9 ikon tablosuna "Sınırsız can" satırı, ART §8 yasak glif listesine ∞ (U+221E); UX §3 üst çubukta "kalp yerine `icon_life_unlimited` + geri sayım"; UX §3.1 ödülde ikon + `common.minutes` "{n} dk"; STORY §7.5 `common.minutes` TR "{n} dk" / EN "{n} min", `{n}` = `unlimitedLivesMinutes`)
- #7 UX §2.1 son adım ilk yükleme düşüşünü saymıyor → KAPANDI (5. satır "geçiş 0,4 s + ilk yükleme düşüşü 0,4 s" = 0,8 s, kümülatif 8,2 s; "dokunmadan 8,2 s"; 10 s kapısı korunsun diye yükleme aşım payı 2 s → 1,8 s (8,2 + 1,8 = 10,0) ve Phaser ayrıştırma notu "1,8 s'lik pay")
- #10 ART §6 kasa kuşak sayısı çelişkisi → KAPANDI (hp2 satırı "Ayırt eden": "Nokta sayısı = kat; kuşak sayısı = kat − 1.")

Bu turdan doğan bağımlılıklar:
- code-lead: TECH §11.1 `voidAttempt` aynı atomik yazımda bekleyen bildirim (`{ level, refunds: { life, boosters{}, coins }, bridge }`) yazar, ana ekran açılışında ilk gösterilir ve "Tamam"la silinir (UX §1 (c)); yeni i18n anahtarları `resume.void.title/.body/.bridge`, `common.ok`, `common.minutes`, `bridge.play`; `bridge.rule_card.continue` artık `{n}` alır; yeni varlık `icon_life_unlimited` (üst çubuk ve ödül satırları); TECH §10.3 Albüm satırındaki yapı kartı cümlesi (#3) "yalnız `story.ch1.end` Panel 4" olarak eşitlenir; `npm run perf` iddiası 8,2 s / 1,8 s payla okunur (kapı yine ≤ 10 s).

## Senkron geçişi (2026-10-06)

- design-lead-K1 UX §11 mağaza tel çerçevesi Kova "+%10" (entrepreneur son tur 3 #0) → KAPANDI (hücre "+%9" (USD örneği, BUSINESS §5.2 tablosu); yan not `shop.value` "+%{n}", BUSINESS §5.2 kuralı; tel çerçeve altına değer etiketi paragrafı: taban `priceDisplay.referenceSku`, oyuncuya gösterilen para biriminin fiyatlarıyla, aşağı yuvarlanır, taban paket ve `n < 1` "—", config'e / i18n'e sabit yazılmaz, tel çerçevedeki "+%" değerleri USD örneği; STORY §7.5 config notuna `shop.value` `{n}` = aynı kural, "—" pakette anahtar kullanılmaz. STORY metni `+%{n}` / `+{n}%` değişmedi)
- design-lead-K2 UX §9 Sallanan Köprü havuz sayısı (product-lead son tur 1 #7) → ZATEN YAPILMIŞ (UX §9 tel çerçevesi "Ödül havuzu: ● 6.500" = `config/events.json → wobblyBridge.prizePoolCoins` 6500; design dosyalarında "10.000" ya da 10.000'e göre türetilmiş pay örneği kalmadı (tarandı); değişiklik yok)
- design-lead-K3 UX §13.1 `startOn` ve §13.2 Bölüm 35 satırı (product-lead son tur 1 #8) → KAPANDI (§13.1 adım alanlarında "isteğe bağlı `startOn` (GDD §14.1 madde 5)" ve "Adım, önceki adım bitince (varsa `startOn` olayıyla) başlar" zaten vardı, "ek başlama alanı yok" cümlesi kalmamıştı; §13.2 Bölüm 35 vurgusu "harçlı blok" → `piece:k<p>_<i>` (ilk teslim edilen harçlı blok; bölüm başında sahada yok, 2. ve 3. partide), adım bu blok teslim edilince başlar (`startOn: { event: deliveryDone, flag: mortar }`); tamam koşulu "— (2,5 s)" LEVELS §3 35·1 ile aynı)
- design-lead-R: REVIEW_LOG "Son tutarlılık turları" / "Açık kalanlar" ve kapanış dosyalarının "Son tutarlılık turu 1/2/3", "Açık maddeler (F)", "Senkron geçişi" bölümleri tarandı; design-lead'e yazılmış başka açık madde yok (tur 1 "UX Köprü havuzu 6.500" = K2, "Açık kalanlar" design-lead satırı = K1, product-lead son tur 1 #7/#8 = K2/K3)

## Faz 2

Faz 2A boşlukları 1–3 (2026-10-06). Yalnız design-lead dosyaları düzenlendi: `docs/STORY.md`, `docs/UX_FLOWS.md`,
`docs/JUICE.md`, `docs/ART_DIRECTION.md`, `docs/ASSET_LIST.md`, `src/theme/tokens.json` (yalnız `touch._doc`; geçerli
JSON, Prettier'dan geçti, değer değişmedi). Boşluk 4 (TECH) code-lead'in, 5 (GDD K-08/K-26) product-lead'indir.

- DL-F2-1 Faz 2 pencerelerinin STORY anahtar satırları → KAPANDI (TR + EN, §0 ton kuralları: renk adı yok, yer
  tutucuya ek yok, alt küme dışı glif yok, EN'de he/she yok). §7.3 `lose.adToday` "bugün {n}/{max}" / "today
  {n}/{max}" (`{max}` = `outOfMoves.rewardedAdOffer.perDay`, `{n}` = bugünkü sıra = izlenen + 1; `lives.ad` aynı anlam).
  §7.5 `exit.streak` "Galibiyet serin sıfırlanır." / "Your win streak resets." (yalnız `m ≥ 1` ve `s > 0`),
  `exit.refund` (yalnız `m = 0` ve oyun öncesi güçlendirici varken; K-43 madde 2), `resume.strip` "Bölüm {n} ·
  hamlelerin kayıtlı" (JUICE #87 şeridi artık pencere başlığı `resume.title`'ı tekrarlamaz) + görünme koşulları ve
  satır sırası notu. Yeni §7.6 (32 satır): `app.title` "Lift & Land" (iki dilde; D-068 aday sırası 1 + "tek global EN
  marka", NAMING §5; marka araması bitene kadar yer tutucu, büyük harfe çevrilmez — TR yerelinde "LİFT" olurdu; ART §8
  istisnası, UX §1, ASSET `logo_wordmark`), `app.version`, `common.continue` "Devam", `common.home` "Ana sayfa",
  `common.retry`, `common.skip` "Geç", `common.cancel` "Vazgeç", `common.on` / `.off`, sayı biçimleri `common.count`
  "{n}/{max}", `common.plus` "+{n}", `common.times` "×{n}", `common.coins` "{coin}{n}", `hud.moves`, `hud.streak`
  "Usta Serisi" / "Builder Streak", `truck.queue` "Kamyonda: {n}" / "On the truck: {n}" (product-lead PL-F2-5 ile aynı;
  N = kuyruktaki blok, 0'da gizli), `booster.hint.trowel` (+ `.hammer` / `.crane` / `.brush` mekanikleriyle), `pause.title`
  "Mola", `pause.exit`, `settings.sound` / `.music` / `.haptics`, `win.title` "Kazandın!" / "You won!", `win.bonus`,
  `win.trowel`, `error.boot` / `.level` / `.restart`, `home.play` "Bölüm {n}", `story.sign` "{company}" (giriş Panel 3
  tabelası). Win "Tekrar" düğmesi için anahtar açılmadı: kazanma ekranının tek birincil eylemi "Devam" (UX §6 kuralı
  yazıldı); kayıpta tekrar `lose.retry`. UX §1, §2, §5.1 (Duraklat, hedefler, hamle etiketi, Usta Serisi, kamyon çipi,
  çıkış onayı tel çerçevesi, hata), §5.2 (açıklama şeridi), §6, §7 ve JUICE #20, #55, #87 anahtarlara bağlandı. UX §6'ya
  "Faz 2 dikey dilimi" paragrafı: "Devam" / "Ana sayfa" asgari ana ekrana (arka plan + `app.title` + `home.play`; Bölüm 5
  sonrası 1–5 döngüsü, `home.moreSoon`). Kontrol: STORY tablo ayrıştırıcısı (tests/services/i18n.test.ts kopyası) 37
  yeni anahtarı okuyor; yaprak/düğüm çakışması yok; TR/EN yer tutucuları eşit; glifler ART §8 alt kümesinde; atlanmış
  DOC-AMBIGUITY testlerinin koşulları (kazanma metinleri, `app.title`, tek "Kamyonda: 3", tek "seri… sıfırlanır", tek
  "bugün 1/3") yeni satırlarla sağlanıyor.
- DL-F2-2 ART §4 / ASSET §3 `plan_front` ifadesi ve `board_blueprint_deep` satırı → KAPANDI. ART §4 inşa cephesi iki
  katman: (1) `plan_<c>_front` = plan hücresi tarifi, yalnız **dolgu** +%15 beyaza karışır (dolgu × 0,85 + beyaz ×
  0,15; renk körü modunda %90 bileşikten), kesik kontur açılmış dolgudan × 0,65, **sembol ve mürekkep değişmez**
  (ölçülen cephe kontrastları bu modelin; perde sembole de çekilseydi B 5,8 → 3,7); (2) `plan_front` = yalnız düz 6 px
  kontur + dış parlama, dolgu / açıklık / sembol yok; cephedeki `?` hücresi açıklık almaz, yalnız kontur. "Plan dışı"
  satırı `board_blueprint_deep` dokusuna ve `y ≥ h + e` tanımına (GDD K-03) bağlandı. ASSET §3: `plan_cell` →
  `plan_<W..P>` (8; 120×120 çerçeve, 104×104 kutu), yeni `plan_<W..P>_front` (8) satırı, `plan_front` "yalnız katman"
  olarak yeniden yazıldı, yeni `board_blueprint_deep` satırı (120×120, düz #173D70, ızgara/benek/köşebent yok). UX §5.5
  ve JUICE #83 aynı ifadeye eşitlendi. Kod (`drawPlanCell` `front`, `drawBuildFront`, `drawBlueprintDeep`) zaten bu
  modeldedir; değişiklik gerekmez.
- DL-F2-3 UX §0.1 / §14 "44 pt kuralı" 360 px genişlikte → KAPANDI, seçenek **(b)**: `touch.minTargetPx = 128` px **her
  genişlikte** en küçük hedeftir (375 pt'de 44,4 pt, 390'da 46,2 pt, 360 dp'de 42,7 dp — bilerek kabul). Gerekçe UX
  §0.1'de: 44 pt iOS sayısıdır ve iOS profillerinde sağlanır; 360 dp Android/web profilidir ve oradaki öneri 48 dp =
  144 px'tir; 132 px yalnız 1,3 dp kazandırır, 48 dp'ye yine yetmez, Usta Serisi şeridinin payını tahta kenarına
  taşırırdı. Telafi kuralı: **sık dokunulan hedefler ≥ 144 px** (kapalı liste UX §0.1: düğmeler, pencere seçenekleri,
  güçlendirici yuvaları, blok + pay, Bölüm düğmesi, alt nav, sayısal tuşlar); mevcut ölçülerin hepsi zaten ≥ 144, tek
  değişiklik UX §2.3 sayısal tuş 160×128 → 160×144 [Mağaza]. §0.2 birincil eylem yüksekliği 128 → 144 (mevcut birincil
  düğmeler 152–176, değişiklik yok). §0.3 pay örnekleri (112 → 8, 96 → 16, 88 → 20) değişmedi. `tokens.json` değer
  değişmedi; `touch._doc` kararı yazıyor.

Bu turdan doğan bağımlılıklar:
- code-lead: (1) §7.3 / §7.5 / §7.6'daki 37 yeni anahtarı `tr.json` / `en.json`'a harfi harfine kopyalasın (D-017);
  atlanmış dört DOC-AMBIGUITY testi (kazanma metinleri, `app.title`, `truck.queue`, `exit.streak` + `lose.adToday`)
  açılsın. (2) "UX 0.1 44 pt kuralı" atlanmış testi karar (b)'ye göre yeniden yazılsın: `touch.minTargetPx` 128'de kalır
  ve her profilde aynı px; 360×800'de 42,7 dp beklenen değer; yeni değişmez: UX §0.1 kapalı listedeki hedeflerin kısa
  kenarı ≥ 144 px. `tests/theme/layout.test.ts` adındaki "DOC-AMBIGUITY" notu kaldırılabilir. (3) `src/theme/textures.ts`
  yorumu "`board_blueprint_deep` has no ASSET row yet" artık geçersiz (ASSET §3 satırı var). (4) BootScene / logo
  `app.title`'ı `upper()` ile çizmesin (ART §8 istisnası). (5) TECH §14.1 #12 "UI asgari" kalemine UX §6 "Faz 2 dikey
  dilimi" asgari ana ekranı (`home.play`, Bölüm 5 sonrası 1–5 döngüsü) eklensin; süre tahmini code-lead'in.
- entrepreneur: `app.title` çalışma değeri "Lift & Land" (bilgi; NAMING §6 marka araması sonucu farklı aday çıkarsa
  yalnız `app.title` ve `logo_wordmark` değişir).

## Faz 2 tur 2

- #0 [Önemli] 17-resume-strip, STORY §6 `tut.ctx.resume` başlığı tekrarlıyor → KAPANDI (design-lead tarafı). Bulgu
  doğrulandı: iki profilin 17 numaralı görüntüsünde başlık `resume.title` "KALDIĞIN YERDEN DEVAM", hemen altındaki
  `tut.ctx.resume` "Kaldığın yerden devam, evlat." aynı sözcükler. Şerit `resume.strip` "Bölüm 2 · hamlelerin kayıtlı"
  ise başlığı tekrarlamıyor (STORY §7.5 kuralı zaten var); yani tekrar üç değil iki yerde. STORY §6 satırı TR
  "Tahta bıraktığın gibi duruyor, evlat." / EN "The board is just as you left it, kiddo." oldu ("tahta" GDD K-01
  terimi; 5 sözcük; `evlat`/`kiddo` öteki Usta Dede satırlarıyla aynı). §7.5 notuna "`tut.ctx.resume` da başlığı
  tekrarlamaz, tahtanın aynı kaldığını söyler" cümlesi eklendi. Bağımlılık → code-lead: `src/i18n/tr.json` ve
  `en.json` içindeki `tut.ctx.resume` bu metne harfi harfine eşitlensin (D-017); eşitlenene dek
  `tests/services/i18n.test.ts` "D-017 every text is verbatim" testi kırmızıdır. Kod (`LevelWindows.openPause`)
  değişmez; 17 numaralı görüntüler yeniden alınsın.

## Faz 2 tur 2b

Tarih: 2026-10-07. Tur 2 kod düzeltmelerinin dayandığı sunum tarifleri ve token'lar denetlendi; yalnız eksikler yazıldı.
Düzenlenen: `src/theme/tokens.json`, `docs/ART_DIRECTION.md`, `docs/UX_FLOWS.md`, `docs/JUICE.md`, `docs/ASSET_LIST.md`.
Kontrol: `npx vitest run` 75 dosya / 1425 test yeşil (2 beklenen hata = FINDING testleri), `prettier --check
src/theme/tokens.json` temiz; UX §13.1 "Vurgu kimlikleri" şema testi (yeni metin o maddenin önünde) ve ART §2.4 tablo
testi geçiyor.

- #2 W1 rayları → KAPANDI (design-lead tarafı). `tokens.json` `color.board.rail` #8A96A3 → **#3F454D** (tur 2'de
  ertelenmişti; test sabiti artık `TOKENS.color.board.rail`'i okuyor, `services-theme.review.test.ts` "ART 5 W1 rails" ve
  `tests/theme/draw.test.ts` yeşil). ART §5 W1 tarifi (8 px, 2 px `wallLight` ışık, 40 px'te 4×12 travers, plan
  hücreleri + ızgaranın üstü / cephe konturu ve blokların altı) zaten vardı. Eklenenler: ART §2.4 tablosuna
  `board.rail` satırı (tablo testi token'la karşılaştırıyor); ART §4 "Katman sırası"na "W1 rayı ve #22 ışığı";
  ASSET `gap_static_edge` satırındaki eski "`gap_rail` 240×6" → 240×12 çerçeve tarifi; JUICE #22 ışığın katmanı.
- #4 K-34 eksik destek taraması → ZATEN YAPILMIŞ (ART §4: her 6 px sarı çizginin altında 10 px `ui.ink` %80, ölçümler
  yazılı). Eksik eşitlemeler yazıldı: ASSET §3 `plan_support_hatch` satırı ve JUICE #84 aynı çerçeveyi anıyor.
- #0 birleşen delik ve #1 sürüklenen blok karartmanın üstünde → ZATEN YAPILMIŞ (UX §13.1 "Spot ışığı", tur 2). Eklenen:
  derinlik sırası tek cümle — karartma → el → balon → sürüklenen blok ve gölgesi → pencereler (kod `overTutorial`
  zaten böyle).
- #9 zorunlu adım Duraklat'ı yutuyor → KAPANDI (UX §13.1): zorunlu adımda tek istisna Duraklat (128 px dokunma alanı);
  Mola, ses/müzik/titreşim ve "Bölümden çık" öğretici boyunca erişilir; düğme karartmanın altında kalır, ek delik yok.
- #7 panorama ve Bölüm 5 oku → ZATEN YAPILMIŞ (UX §5.1 hücre = `min(24, ⌊(110 − 2·pay)/satır⌋)` ≥ 12, en yüksek dilim,
  dikeyde ortalı; UX §13.2 Bölüm 5 satırı 64×40 beyaz ok, 4 px `ui.ink`, `panorama` vurgulu ve ≥ 2 dilim). Değişiklik yok.
- #5 Altın Mala seçiminde soluklaşma → KESİNLEŞTİRİLDİ (UX §5.2 tablo): "diğer hücreler %50" yerine aktif dilimin cephe
  dışındaki plan hücreleri ve `.` hücreleri seçim açıkken %50 opak; yerleşmiş bloklar, saha, HUD değişmez; azaltılmış
  harekette de; kullanım / Vazgeç / × ile %100'e döner.
- #15 kısa ekranda balon yerleşimi → KARAR YAZILDI (UX §13.1 "Usta Dede balonu → Yerleşim"). Yasak alanlar: delikler,
  **el yolu**, **şantiye sütunu** (x ≥ `grid.wallX`, vinç üstünden satır 0'a), Duraklat, **alt yarı**, yumuşak adımda
  sahadaki bloklar/engeller. Ceza: hedefler, hamle, panorama. Kutu: geniş ≤ 760 ya da dar (sağ kenar ≤ 734 = duvar − 16;
  ölçüm Baloo 2 600 44 px: L1–5 TR/EN satırları geniş kutuda ≤ 2, dar kutuda ≤ 3 satır, yükseklik ≤ 229). Aday sırası:
  (1) HUD altı bandı, geniş, sığıyorsa; (2) saha bandı, dar, satır 7'den yasakların altına iner, alt kenar ≤ H/2;
  (3) vinç bandı, dar; (4) HUD'a taşan bant, geniş, alt kenar vinç üstü − 16, Duraklat'a değerse x = 168;
  (5) durum şeridi üstü, son çare. Seçim sözlük sıralı: önce yasak kesişimi, sonra ceza (ağırlıklı toplam değil).
  Karalama benzetimi (kodun `highlightAll` / `spotlightHoles` / el çözümü adımlarıyla) 390×844, 360×800, 390×763,
  360×740, 412×846, 375×667'de Bölüm 1–5'in bütün adımlarında: delik, el yolu, şantiye sütunu, Duraklat ve alt yarı
  ihlali **sıfır**; uzun ekranlarda hep aday 1, kısa ekranlarda zorunlu adım aday 2, eli vinçten geçmeyen yumuşak adım
  aday 3, geçen aday 4 (hedefler/hamle panelinin alt kısmı örtülür — kabul). B2·3 benzetimde açılmadı (tutma sinyali
  yok); el yolu B1·3 ile aynı olduğu için aynı sonuç beklenir.

Bu turdan doğan bağımlılıklar:
- code-lead: (1) `bubbleCandidates` / `bubbleSpot` / `bubbleAvoid` UX §13.1 yeni yerleşime göre güncellensin: dar kutu
  (`SpeechBubble` `maxW` ile, kutu ≤ 494), şantiye sütunu + el yolu + Duraklat dokunma alanı + yumuşak adımda saha
  blokları yasak; mevcut "deliklerin altı" adayı geniş kutuyla şantiye sütununun satır 6–5'ini, son aday `y = margin`
  Duraklat'ı örtüyor; `HOLE_WEIGHT` ağırlıklı toplamı yerine sözlük sıralı seçim. `presentation.review.test.ts`
  `bubbleProblems` denetimine "şantiye sütunu", "el yolu", "Duraklat" eklensin; UX §13.1 "Beklenen sonuç" satırı test
  beklentisi olarak kullanılabilir; 390×763 ve 360×740 testlere ve `tools/screens.ts` profillerine. (2) UX §5.2 Altın
  Mala soluklaşması kapsamı (`.` hücreleri dahil, bloklar hariç, azaltılmış harekette de). (3) `color.board.rail` artık
  #3F454D; 04 / 05 / 10 / 24 ekranları yeniden çekilsin.

## Faz 2 tur 4

- #0 [Önemli] (product) UX §13.2 Bölüm 2 adım 2–3 ↔ `level_002.json` / LEVELS §2 Bölüm 2 → KAPANDI. Doğrulama:
  bulgunun ana kısmı (vurgu, el, tamam koşulu) tur 4 ekran incelememde zaten eşitlenmişti
  (`design-lead-phase2.md` "Tur 4 · design-lead kendi işleri"); satırlar §13.1'e eklenen iki satır yüzünden artık
  1109–1110'da, `holdOverBuild` UX'te hiç geçmiyor. Kalan iki eksik düzeltildi: (1) başlıklar "yanlış yön" / "doğru yön"
  aynı `c`'nin (C3_180, yönü hiç değişmiyor) önce "!", sonra ✓ göstermesini anlatıyor: "Düşüş gölgesi — `c` sırası
  gelmeden: "!"" / "Düşüş gölgesi — aynı `c` sırası gelince: ✓"; (2) tamam koşulları `placementCorrect` ×1 (`b` (6,2)'ye
  yerleşince) ve `placementCorrect` ×1 (`c` (6,3)'e yerleşince; kazanış). Adım 2 el sütununa LEVELS'taki "metin `b`'nin
  hamlesi boyunca ekranda, vurgulu `b`'nin gölgesi ✓" ve "(4,7) = `c`'nin sol üst hücresi" eklendi. Kısmen farklı
  yazıldı: adım 3 el yolu için önerilen "duvar üstü" tek başına yazılmadı; "Vinç Alanı (4,8) → duvar üstünden x=6
  (6,8)" oldu, çünkü JSON yolu `[[4,7],[4,8],[6,8]]` y=8'den (GDD sözlüğü: Vinç Alanı y=8–9) geçiyor ve §13.1 balon
  yerleşimi B2·2 / B2·3'ü bu yüzden "el yolu vinçten geçen → aday 4" sınıfında sayıyor. Kod ve veri değişmez (zaten
  böyle). `tokens.json` değişmedi; `vitest tests/core/level/schema.test.ts` (UX §13.1 okuyan) 16/16 yeşil.
