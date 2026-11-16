# API kararları

Kısa kayıtlar: ne seçildi, neden, ne elendi. (Temelin genel kararları `../docs/KARARLAR.md`'dedir; bu dosya
yalnız API'ye özgüdür.)

## Sunucu ve depolama

- **Hono 4 + @hono/node-server** (şartname). `app.request()` ile ağsız test; ara katman ve SSE yardımcıları hazır.
- **`node:sqlite` (DatabaseSync)**, ince sarmalayıcının arkasında (`src/db/database.ts`). Yerel bağımlılık
  derlemesi yok (better-sqlite3 elendi: yerel derleme, Docker'da ek adım). Eşzamanlıdır: işlem içinde `await`
  olamaz → sarmalayıcı yakalar. `node:sqlite` Node 22'de hâlâ "deneysel" uyarısı verir; betiklerde
  `--disable-warning=ExperimentalWarning`.
- **Zamanlar ISO metin** (`toISOString()`): okunur, sıralanır, metin karşılaştırması zaman sırasıdır.
- **STRICT tablolar**, yabancı anahtarlar her bağlantıda açık; WAL + `synchronous=NORMAL` + `busy_timeout=5000`.
- **Eşitleme tek `BEGIN IMMEDIATE` işlemi**: yazma kilidi baştan alınır, eşzamanlı istekler (başka bağlantılardan
  da) sıraya girer; `rev` çakışması `UNIQUE (workspace_id, rev)` ile ayrıca imkânsız.
- **Doğrulama sırası `MemoryServer` ile aynı**, tek bilinçli fark: bellek içi sunucu, sırasız `mid` hatası
  vermeden önce cihaz kaydını oluşturur; gerçek API hatalı istekte hiçbir şey yazmaz (işlem geri alınır).
  Gözlenebilir tek etkisi: reddedilen bir istekteki cihaz kimliği sahiplenilmez. Uygunluk testleri bu uç
  durumu sınamaz (iki sunucu da bütün senaryolardan geçer).

## Kimlik

- **scrypt N=2^14, r=8, p=5** (docs/GUVENLIK.md): OWASP eşdeğer seçeneklerinden az bellekli olanı; dar bellekli
  ücretsiz sunucuda da çalışsın. Aynı anda en çok 2 özet. Argon2id elendi: Node'da yerleşik değil.
- **Oturum veritabanında**, belirteç değil özeti saklanır; JWT elendi (iptal edilemez, şifre değişiminde
  düşürülemez).
- **`SameSite=Lax`** (Strict değil): e-postadaki bağlantıdan gelen kullanıcı oturumlu açılsın. CSRF'e karşı köken
  denetimi + zorunlu JSON ayrıca var.
- **Belirteç kipinde çerez yazılmaz**: tek kimlik kanalı, karışıklık yok.
- **Kayıt `email_taken` döner** (bilinçli ödün; docs/GUVENLIK.md). Şifremi unuttum her zaman aynı yanıt.
- **Şifre değiştir / hesap sil yanlış şifrede `invalid_credentials` (401)**: sözleşmedeki anlamlı kod; web "401 =
  oturum düştü" ayrımını `code === 'unauthorized'` ile yapmalı (HAZIR.md'de yazılı).
- **Yalnız rakamlı şifre reddedilir** (NIST "karakter türü zorunluluğu yok" der; bu bir tür zorunluluk değil,
  telefon/doğum tarihi gibi tahmin edilir şifrelere karşı kural).
- **Ortak parola listesi**: SecLists'in NCSC listesinden (MIT) 10+ karakterli ilk 400 + elle yazılmış Türkçe ek;
  "sözcük + rakam" kalıbı kuralla yakalanır (liste şişmesin).

## Alanlar ve davetler

- **Yeniden adlandırma, davet, rol, üye çıkarma yalnız sahip.** Düzenleyenin davet etmesi elendi: erişim
  vermek sahibin kararı olsun.
- **Kişisel alan paylaşılamaz** (davet yok): kişisel veri yanlışlıkla paylaşılmasın; paylaşım için ortak alan.
- **Üye olmayana 404** (403 değil): alanın varlığı sızmasın.
- **Davet önizleme oturumsuz**: alıcı giriş yapmadan "kim, hangi alan" görsün. Belirteç 256 bit, tahmin edilemez.
- **Zaten üye olan kabul ederse davet harcanmaz**: sahip kendi bağlantısını yanlışlıkla açarsa asıl alıcı
  yine kullanabilsin.
- **Hesap silmede sahiplik en eski üyeye** (rolü ne olursa olsun) geçer: şartname.

## Anlık bildirim

- **SSE, WebSocket değil**: tek yönlü dürtme yeter; vekillerden kolay geçer, tarayıcı kendiliğinden yeniden
  bağlanır. Olay yalnız "eşitle" der, veri taşımaz (yetki ve sıra eşitlemede).
- **Kullanıcı başına en çok 10 akış**, aşılınca en eskisi kapanır (unutulmuş sekmeler kaynak tüketmesin).

## Hız sınırı

- **Bellek içi jeton kovası**, saat dışarıdan. Kalıcı/paylaşılan depo (Redis) elendi: tek süreç zaten şart.
- **E-postaya göre kilit yok**, yalnız IP ve IP+e-posta (başkası sizi kilitleyemesin).

## Yayın

- **Tek servis** (API web'i sunar): CORS ve çerez karmaşası yok. Web ayrı bir yerde (ör. GitHub Pages) yayınlanırsa
  `ALLOWED_ORIGINS` + belirteç kipi kullanılır.
- **`/assets/*` dışındaki her şey `no-cache`**: özetli ad kuralı yalnız Vite'ın `assets/` klasörü için güvenilir;
  öteki dosyalar (sw.js, manifest, simgeler) her açılışta tazelik sorar (ETag ile ucuz).
- **`.env` hem çalışma klasöründe hem `havuz/uygulama/`'da aranır**: `npm run … -w` api/'den çalışır, kullanıcı
  ise dosyayı köke koyar.

## Şartnameden sapmalar

- `.env.example` dosyası yazılamadı (bu oturumda `.env*` dosyalarına yazma izin kuralıyla kapalı); içeriği
  `docs/YAYINLAMA.md → Ortam değişkenleri`'nde kopyalanabilir blok olarak duruyor.
- "İYİ OLUR" maddelerinden dosya yükleme ve e-posta doğrulama yapılmadı (bkz. README → Sınırlar); mezar taşı
  temizliği yalnız tasarım notu (`../docs/MEZAR_TASI.md`).
