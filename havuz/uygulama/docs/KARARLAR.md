# Kararlar (web ve kök araçlar)

Kısa kayıtlar: ne seçildi, neden, neyin neden elendiği. API'nin kararları: `api/KARARLAR.md`.

## Teknoloji

- **React 19 + Vite 8 + TypeScript ~6.0 (strict).** Görevde belirlendi. TypeScript 7 yerine 6.0: typescript-eslint
  henüz 7'yi desteklemiyor.
- **Yönlendirme: react-router 8, `HashRouter`.** Adresler `/#/gorevler` biçimindedir; durağan barındırmada
  (GitHub Pages) yenileyince 404 olmaz, sunucuda yedek sayfa kuralı gerekmez. E-posta/davet bağlantıları
  `shared`daki `WEB_ROUTES` + `webUrl` ile kurulur; iki taraf yolu aynı yerden okur.
- **Yerel depo: Dexie 4 + `dexie-react-hooks`.** IndexedDB'nin işlem (transaction) ve dizin desteği, canlı sorgu
  (`useLiveQuery`) ve sekmeler arası değişiklik yayını hazır gelir. Elenen: elle IndexedDB (çok kod, ince
  hatalar), localStorage (işlem yok, boyut sınırı).
- **Stil: Tailwind CSS 4 + anlamlı renk belirteçleri.** `styles/index.css` içinde `@theme` ile yalnız anlamlı
  renkler (`canvas`, `surface`, `ink`, `accent`, `danger`…) tanımlıdır; Tailwind'in hazır paleti bilerek
  kapatıldı (`--color-*: initial`). Böylece açık/koyu tema ve yüksek karşıtlık her yerde tutarlı kalır ve
  küçük model "bg-red-500" gibi temaya uymayan renk yazamaz. Karşıtlık kural testiyle korunur.
- **Simgeler: lucide-react.** Ağaç silkelemeli (yalnız kullanılan simge pakete girer), tutarlı çizgi dili,
  React bileşeni olarak gelir. Not: 1.x sürümünde bazı adlar değişmiştir (`Trash2` → `Trash`,
  `AlertTriangle` → `TriangleExclamationPoint`); TypeScript yanlış adı derlemede gösterir.
- **PWA: vite-plugin-pwa (`generateSW`, `registerType: 'prompt'`).** Yeni sürüm kendiliğinden yüklenmez;
  kullanıcıya "Yeni sürüm hazır · Yenile" sorulur (form doldururken sayfa yenilenmesin). `/api/*` için çalışma
  zamanı önbelleği bilerek yok: veri IndexedDB'dedir, API yanıtı önbelleğe alınırsa eski veri gösterilir.
- **Testler: vitest + Testing Library + fake-indexeddb + jsdom; uçtan uca Playwright + @axe-core/playwright.**
  jsdom'da olmayan `<dialog>.showModal`, `popover` ve `matchMedia` test kurulumunda taklit edilir
  (`web/test/setup.ts`). Saf mantık testleri `node` ortamında koşar (daha hızlı).
- **Ek bağımlılık eklenmedi**: durum kütüphanesi (zustand/redux), sunucu önbelleği (react-query), tarih
  kütüphanesi (Intl yeterli), i18n kütüphanesi (40 satırlık `t()` yeterli), sürükle-bırak kütüphanesi (yerine
  klavyeyle de çalışan "yukarı/aşağı taşı").

## Veri ve eşitleme

- **Tek doğruluk kaynağı Dexie.** Sunucu verisi için ayrı bir önbellek katmanı yok; ekranlar yerel depodan canlı
  okur. Çevrimdışı-önce davranış bundan kendiliğinden çıkar.
- **Kullanıcı başına ayrı veritabanı** (`…kullanici.<id>`), hesapsız kullanıma ayrı (`…yerel`), oturum
  kaydına ayrı (`…oturum`). Aynı tarayıcıda iki kişi birbirinin verisini görmez; çıkışta "veriyi de sil"
  tek bir veritabanını silmektir.
- **Yazma tek işlemde:** görünen hâl + giden kutusu aynı Dexie işleminde yazılır (yarım yazma olmaz).
  Uzlaştırma da tek işlemdedir; istek yoldayken yapılan yeni yazmalar kaybolmaz (plan, işlem ANINDAKİ giden
  kutusuna göre çıkarılır).
- **Eşdeğerlik testi:** Dexie gerçeklemesinin başvuru gerçeklemesiyle (`MemoryReplica`) birebir aynı sonucu
  verdiği rastgele senaryolarla kanıtlanır (`web/test/sync/equivalence.test.ts`).
- **Çok sekme: her sekmenin motoru var, turlar Web Locks ile sıralanır** (yoksa veritabanında süreli kira).
  Elenen: "lider sekme" seçimi — daha az istek yapar ama sekme dondurulunca/kapanınca devir teslim karmaşıklaşır.
  Bedeli: her açık sekme kendi anlık bildirim bağlantısını tutar (birkaç sekme için önemsiz).
- **Anlık bildirim `fetch` akışıyla** (EventSource değil): belirteç kipinde `Authorization` başlığı gerekir ve
  EventSource başlık gönderemez. Bildirim kopsa da veri güncel kalır (dakikada bir yoklama, sekmeye dönünce
  eşitleme).
- **Reset'te bütün eşitleme durur** (yalnız o alan değil). Bekleyen değişikliklerin geri sarılmış sunucuya
  uygulanıp (ör. olmayan kayda `patch` → red → yerel kaydın silinmesi) karar verilmeden veri kaybettirmesini
  önler. Reset nadirdir (sunucu yedekten dönünce).
- **401'de veri silinmez:** oturum "süresi dolmuş" işaretlenir, ekranda veri kalır ve yazılabilir; yeniden
  giriş yapılınca bekleyen değişiklikler gönderilir. "Oturumu düşür" bu biçimde uygulandı.
- **Hesaba taşımada kimlikler korunur** (görevin `listId` bağı kopmasın). İki veritabanı arasında tek işlem
  olmadığı için sıra "önce hedefe yaz, sonra kaynağı sil"; yeniden çalıştırmak güvenlidir. Silinenler taşınmaz.
- **İyimser oturum durumu:** giriş/çıkıştan hemen sonra yönlendirme yapılırken veritabanından yeni değer
  gelmeden eski oturum bir an görünmesin diye bu sekmede yazılan değer hemen kullanılır
  (`useOptimisticLive`, `SessionProvider.tsx`).

## Kimlik

- **Aynı kökende çerez, başka kökende belirteç.** `VITE_API_URL` boşsa (ya da sayfayla aynı kökense) oturum
  `HttpOnly` çerezdedir; sayfaya sızan bir betik (XSS) onu okuyamaz. API başka bir kökendeyse tarayıcılar
  üçüncü taraf çerezlerini engellediği için belirteç kipi kullanılır: giriş isteği `X-Auth-Mode: token` gönderir,
  belirteç IndexedDB'de (`…oturum`) saklanır ve `Authorization: Bearer` ile gönderilir. **Risk:** XSS olursa
  saldırgan belirteci okuyabilir. Bu yüzden önerilen yayın tek servistir (aynı köken, çerez); belirteç kipi
  yalnız ayrı alan adı şartsa kullanılmalı ve içerik güvenlik politikası (CSP) sıkı tutulmalıdır.
- **Görünüm ayarı için satır içi betik yok.** Koyu tema betik yüklenince uygulanır; "sistem" seçiliyken CSS
  `prefers-color-scheme` ile ilk boyamadan doğru gelir. Satır içi betik, tek servis yayınındaki CSP'yi
  (`script-src 'self'`) bozardı.

## Arayüz

- **Yerel öğeler önce:** pencere `<dialog>` (odak tuzağı, Esc, arka planın etkisizleşmesi tarayıcıdan),
  menü `popover` (üst katman, dışarı tıklayınca kapanma), süzgeç paneli düğme + `hidden`. Odak, sayfa değişince
  başlığa taşınır (`useRouteFocus`).
- **Dokunma hedefi en az 48 px**, görünür odak halkası, `lang="tr"`. Erişilebilirlik uçtan uca testte axe ile
  açık ve koyu temada taranır (ciddi/kritik bulgu yok).
- **Silme anında + "Geri al":** onay penceresi yalnız geri alınamayan ya da başkalarını etkileyen işlemlerde
  (hesap/alan silme, üye çıkarma, çıkış). Görev/liste silme geri alınabildiği için onay sorulmaz; "Son
  silinenler" süresiz geri getirme sunar.
- **Tarih:** son tarih düz `YYYY-AA-GG` (saat dilimi sorunu yok); "bugün" cihazın yerel gününe göre;
  saat `ClockProvider` ile dışarıdan verilir (testte sabit). Tarih kutusu tarayıcının yerel `<input type="date">`
  denetimidir; biçimi tarayıcının diline göredir.

## Kök araçlar

- **Üreteç `node scripts/gen.ts`** (Node'un yerel TypeScript desteği; ek araç yok). Kayıt dosyalarındaki
  `YENİ … BURAYA` işaretlerinin önüne yazar, çıktıyı Prettier'dan geçirir. Kanıt testi geçici bir kopyada
  üretip derler (`npm run test:gen`).
- **Kök `tsconfig.json`** yalnız `scripts/`, `e2e/` ve `playwright.config.ts` içindir (tip-farkında lint bu
  dosyalar için bir tsconfig ister). Paketlerin kendi tsconfig'i vardır.
- **Uçtan uca testler `vite preview` + vekil** ile koşar (API'nin web sunmasına bağımlı değil); kapılar boş
  kapıdan seçilir, veritabanı her koşuda yeni dosyadır ve sonda silinir.
