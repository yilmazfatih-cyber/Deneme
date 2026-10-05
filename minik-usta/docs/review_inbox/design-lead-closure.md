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
- product-lead.md#öğretici sırası ile LEVELS çözümü → KAPANDI (UX §13.2 Bölüm 1–10 satırları LEVELS `tutorial[]` ile birebir: B3 temel → ray Z → ray tutar; B4 pencere → `front` + `tut.ctx.support` → ray Z; B9 temel → dar geçit Z; `piece:<i>` = LEVELS tablo sırası, parantezde LEVELS kimliği)
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
- product-lead: yok (UX §13.2 ve STORY §6 LEVELS'in güncel `tutorial[]` verisiyle birebir).
- entrepreneur: ASSET §14 iş yükü tablosu BUSINESS §10'la karşılaştırılabilir (≈ 126 sanatçı-günü, P0 ≈ 67).

## Proje sahibine açık sorular (yorumlardan değil, karar ve önerilerden)

1. R-01: K-34 "Alttan Üste" kuralı görünürlük katmanlarıyla (UX §5.5) onaylanıyor mu?
2. R-06: Ölçekleme FIT (brif) mi, EXPAND (öneri) mi? Belgeler ikisinde de çalışır.
3. Tuna'nın görsel yaşı: brifteki 8 mi kalsın, 10–12 görünüme mi çekilsin? (Yaş her durumda oyun içi metinde geçmez.)
4. Bilgi: blok paleti (P-1) brifteki hex'lerden renk körlüğü nedeniyle değişti; renk kodları ve B'nin adı "Gök Mavisi".
