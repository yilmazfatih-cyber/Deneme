---
baslik: Ön yüz testi
ozet: Neyin hangi düzeyde test edileceği, kullanıcı gibi rol ve etiketle sorgulama, eşzamansız beklemeler, kırılgan seçicilerden kaçınma, uçtan uca testte kararlılık, görsel ve erişilebilirlik testi, sahte arka uç.
etiketler: [test, testing-library, playwright, erisilebilirlik, onyuz, react]
duzey: orta
guncellik: 2026-11
---

# Ön yüz testi

> Bu notu ne zaman okumalı: yeni bir ekran ya da bileşen için test yazarken; test "bazen" kalıyorsa; testler her stil
> değişikliğinde kırılıyorsa; küçük modelin yazdığı testin gerçekten bir şey sınayıp sınamadığını değerlendirirken.

## Temel fikir

Test, kullanıcının **gördüğü ve yaptığı** şeyi sınar: "Sil'e basınca görev listeden kalkar ve 'Geri al' çıkar". İç
ayrıntıyı (bileşenin durumu, çağrılan kanca, sınıf adı) sınayan test her yeniden düzenlemede kırılır ve hatayı
yakalamaz. Ölçüt: kod doğruyken kırılmayan, kod yanlışken kırılan test.

Değerin çoğu ucuz yerden gelir: **saf mantığın birim testleri** (biçimleme, doğrulama, reducer, eşitleme birleştirme)
hızlıdır ve kesindir. Bileşen testleri etkileşimli parçaları, birkaç uçtan uca test de kritik akışları gerçek
tarayıcıda telefon boyutunda sınar. Her test **belirlenimci** olmalı: saat, ağ, rastgelelik, dil ve saat dilimi test
tarafından seçilir.

## Karar tablosu: ne, hangi düzeyde

| Ne sınanıyor                                                     | Düzey               | Araç                                          | Neden                                          |
| ---------------------------------------------------------------- | ------------------- | --------------------------------------------- | ---------------------------------------------- |
| Biçimleme, doğrulama, reducer, sıralama, tarih hesabı            | Birim               | Vitest / `node:test`                          | Milisaniyeler; her kenar durumu denenir        |
| Bileşen davranışı: hata iletisi, pencere açılıp kapanma, klavye  | Bileşen             | Testing Library + jsdom + user-event          | Tarayıcısız, hızlı; kullanıcı gibi etkileşim   |
| Çok ekranlı akış; servis çalışanı, gerçek IndexedDB, düzen, kaydırma, dokunma hedefi | Uçtan uca | Playwright, 390×844 ve 360×800 | jsdom'da düzen ve bu API'ler yok          |
| Görünüm bozulması                                                | Ekran görüntüsü karşılaştırma | Playwright `toHaveScreenshot`        | Az sayıda, kararlı ekranda                     |
| Erişilebilirlik                                                  | Uçtan uca + bileşen | axe + rol sorguları + elle denetim            | Otomatik tarama her şeyi yakalamaz             |
| İstemci ile sunucunun anlaşması (sözleşme)                       | Uygunluk testi      | Aynı senaryolar sahte ve gerçek sunucuya      | Sahte arka uç gerçeğinden sapmasın             |
| Proje kuralları (sözlük anahtarları, renk belirteci, rota kaydı) | Kural testi         | Kaynak dosyaları okuyan birim test            | Küçük modelin unuttuğunu yakalar               |

Havuzdaki uygulama temeli bu dağılımla kuruludur: birim ve bileşen testleri `web/test/`, kural testleri
`web/test/rules/`, uçtan uca testler `e2e/`, eşitleme uygunluk testleri
[`conformance.ts`](../../uygulama/shared/src/testing/conformance.ts).

## Saati, rastgeleliği, dili test seçer

```js calistir
import test from 'node:test'
import assert from 'node:assert/strict'

// "Şimdi" parametreyle gelir; işlev içinde new Date() yok. Test istediği anı verir.
function dueLabel(dueIso, now) {
  const days = Math.round((Date.parse(dueIso) - now.getTime()) / 86_400_000)
  if (days < 0) return 'Gecikti'
  if (days === 0) return 'Bugün'
  if (days === 1) return 'Yarın'
  return `${days} gün sonra`
}

const now = new Date('2026-11-16T09:00:00+03:00')
test('son tarih etiketi', () => {
  assert.equal(dueLabel('2026-11-15T09:00:00+03:00', now), 'Gecikti')
  assert.equal(dueLabel('2026-11-16T09:00:00+03:00', now), 'Bugün')
  assert.equal(dueLabel('2026-11-17T09:00:00+03:00', now), 'Yarın')
  assert.equal(dueLabel('2026-11-20T09:00:00+03:00', now), '4 gün sonra')
})
```

Bileşenlerde saat bir bağlamla verilir (uygulama temelinde [`clock.tsx`](../../uygulama/web/src/lib/clock.tsx));
uçtan uca testte `page.clock.install({ time })` ya da `setFixedTime` (kurulu Playwright 1.65.1'in tiplerinde var).
Dil ve saat dilimi test ayarında sabitlenir: `locale: 'tr-TR'`, `timezoneId: 'Europe/Istanbul'`
([`playwright.config.ts`](../../uygulama/playwright.config.ts)). Rastgele kimlik ve veri tohumlu üretilir.

## Kullanıcı gibi sorgulama

Testing Library'nin öncelik sırası: `getByRole` (adıyla) → `getByLabelText` → `getByPlaceholderText` →
`getByText` → `getByDisplayValue` → `getByAltText` → `getByTitle` → `getByTestId`. Rol + ad sorgusu aynı zamanda
erişilebilirlik denetimidir: adsız simge düğmesi rolle bulunamaz, test kırılır.

| Sorgu türü  | Bulamazsa     | Birden çok bulursa | Ne zaman                                 |
| ----------- | ------------- | ------------------ | ---------------------------------------- |
| `getBy…`    | Hata          | Hata               | Öğe şu an orada olmalı                   |
| `queryBy…`  | `null`        | Hata               | Öğenin **olmadığını** sınamak            |
| `findBy…`   | Bekler, sonra hata | Hata          | Öğe biraz sonra gelecek (eşzamansız)     |
| `getAllBy…` | Hata          | Dizi               | Liste satırları                          |

```js calistir
import assert from 'node:assert/strict'

// Sorgu anlamlarının küçük benzetimi: getBy tam bir tane ister; queryBy yoksa null döner.
const tree = [
  { role: 'heading', name: 'Görevler' },
  { role: 'button', name: 'Sil: Süt al' },
  { role: 'button', name: 'Sil: İlaç saati' },
  { role: 'button', name: '' }, // simgeli, adsız düğme
]
const matches = (role, name) => tree.filter((n) => n.role === role && (name instanceof RegExp ? name.test(n.name) : n.name === name))
function getByRole(role, { name }) {
  const found = matches(role, name)
  if (found.length !== 1) throw new Error(`${role} ${name}: ${found.length} eşleşme`)
  return found[0]
}
const queryByRole = (role, { name }) => matches(role, name)[0] ?? null

assert.equal(getByRole('button', { name: 'Sil: Süt al' }).name, 'Sil: Süt al')
assert.throws(() => getByRole('button', { name: /^Sil/ }), /2 eşleşme/) // belirsiz sorgu: hangisi? test söyler
assert.equal(queryByRole('button', { name: 'Kapat' }), null) // olmaması beklenen öğe
assert.throws(() => getByRole('button', { name: 'Kapat' }), /0 eşleşme/) // adsız simge düğmesi bulunamaz
console.log('tamam')
```

```cikti
tamam
```

## Eşzamansız beklemeler

Sabit süre beklemek (`sleep(500)`) testin en sık kırılganlık nedenidir: hızlı makinede geçer, yük altındaki CI'da
kalır. Koşulu bekleyin:

```js calistir
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'

function startUi(delayMs) { // arayüz delayMs sonra güncelleniyor (ağ, eşitleme, animasyon)
  const ui = { text: 'Yükleniyor' }
  setTimeout(() => { ui.text = 'Kaydedildi' }, delayMs)
  return ui
}
// waitFor / Playwright web-first beklentisi: koşul sağlanana dek kısa aralıklarla yeniden dene.
async function waitFor(check, { timeout = 1000, interval = 20 } = {}) {
  const started = Date.now()
  for (;;) {
    try { return check() } catch (error) {
      if (Date.now() - started > timeout) throw error
      await sleep(interval)
    }
  }
}

const slow = startUi(150)
await sleep(100) // YANLIŞ: sabit bekleme
assert.equal(slow.text, 'Yükleniyor') // 100 ms yetmedi: gerçek test burada KALIRDI

const ui = startUi(150)
await waitFor(() => assert.equal(ui.text, 'Kaydedildi')) // DOĞRU: koşulu bekle
console.log('tamam')
```

Kurallar:

- Testing Library'de `await screen.findByRole(...)` ya da `await waitFor(() => expect(...))`. `waitFor` içine yan etki
  (tıklama, yazma) koymayın; yalnız beklenti olsun.
- user-event 14'te her etkileşim `await` ister: `const user = userEvent.setup(); await user.click(button)`.
- Sahte zamanlayıcı kullanıyorsanız user-event'e bildirin: `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`;
  yoksa test sonsuza dek bekler.
- "not wrapped in act(...)" uyarısı, test bittikten sonra hâlâ durum güncelleyen bir iş (zamanlayıcı, söz) olduğunu
  söyler; o işi bekleyin ya da bileşen kalkınca temizlensin.
- Playwright'ta `await expect(locator).toBeVisible()` kendiliğinden bekler; `page.waitForTimeout` yalnız canlandırma
  bitişi gibi gerçekten süreye bağlı durumda ve gerekçesi yorumda yazılıysa.

## Kırılgan seçicilerden kaçınma

| Kırılgan                                       | Neden kırılır                              | Sağlam                                                  |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------- |
| `.bg-accent.px-4`, `div > div:nth-child(3)`    | Stil/düzen değişince                       | `getByRole('button', { name: 'Kaydet' })`               |
| Metnin tamamı noktalamasıyla (`'Kaydedildi!'`) | Metin yazarı ünlemi kaldırınca             | Sözlükten anahtarla (`t('tasks.saved')`) ya da düzenli ifade |
| Bütün DOM'un anlık görüntüsü (snapshot)        | Her değişiklikte "güncelle" denip geçilir  | Belirli davranış beklentileri                           |
| Bileşenin iç durumu, kanca çağrı sayısı        | Yeniden düzenlemede                        | Ekrandaki sonuç                                         |
| `data-testid` her yerde                        | Erişilebilirliği sınamaz                   | Yalnız rolü/adı olmayan öğede (grafik tuvali gibi)      |
| Sıraya bağlı ilk eşleşme (`.first()`)          | Liste sırası değişince                     | Satırı adıyla bulup içinde arama (`within(row)`)        |

## Uçtan uca testte kararlılık

| Kaynak       | Kararlı yapmak için                                                                         |
| ------------ | ------------------------------------------------------------------------------------------- |
| Bekleme      | Kendiliğinden bekleyen konum belirleyiciler ve beklentiler; sabit süre yok                  |
| Ağ           | Her koşuda geçici veritabanıyla gerçek API (uygulama temeli böyle) ya da uç durumlar için `page.route` ile sahte yanıt (500, gecikme, çevrimdışı) |
| Saat         | `page.clock`; dil/saat dilimi proje ayarında                                                |
| Veri         | Her test kendi kullanıcısını açar (`uniqueEmail`); testler birbirinin verisine dokunmaz      |
| Canlandırma  | `reducedMotion: 'reduce'`; tarama öncesi canlandırma bitişini bekleyin                      |
| Kapılar      | Boş kapı (`0`) ya da `freePort()`; paylaşımlı makinede çakışmasın                           |
| Paralellik   | Paylaşımlı makinede en çok 2 işçi; zaman aşımları cömert                                    |
| Yeniden deneme | Yerelde `retries: 0` (kırılganlık gizlenmesin); başarısızlıkta iz (trace) kaydı           |
| Çevrimdışı   | `context.setOffline(true)`; servis çalışanı için `serviceWorkers: 'allow'`                   |

## Görsel ve erişilebilirlik testi

- Ekran görüntüsü karşılaştırması yazı tipi işlemesine duyarlıdır: aynı makine/kapta koşun, değişen bölgeleri
  (saat, avatar) maskeleyin, yalnız kararlı birkaç ekranı karşılaştırın. İnsanların bakacağı ekran görüntülerini
  (sprint klasörü) ayrı tutun ve `deviceScaleFactor: 2` ile alın.
- axe taramasını yalnız sayfa açılışında değil, **her durumda** yapın: pencere açıkken, hata gösterilirken, koyu
  temada. Ciddi ve kritik bulgu sıfır olmalı. Çalışan yardımcılar: [`helpers.ts`](../../uygulama/e2e/support/helpers.ts)
  (`expectAccessible`, `expectNoHorizontalScroll`); açık ve koyu temada tarayan senaryo:
  [`erisilebilirlik.spec.ts`](../../uygulama/e2e/erisilebilirlik.spec.ts).
- Otomatik taramanın kaçırdıkları ve elle denetim listesi: [erişilebilirlik uygulaması](erisilebilirlik-uygulama.md).

## Sahte arka uç

| Yol                                                   | Ne zaman                                         | Risk                                               |
| ----------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Aynı arayüzü uygulayan bellek içi sahte sunucu        | Bileşen ve akış testleri                         | Gerçeğinden sapar → uygunluk testiyle bağlayın     |
| `page.route` / `fetch` taklidi                        | Tek uç durum (500, gecikme, boş yanıt)           | Her testte elle yazılan yanıt eskir                |
| Servis çalışanıyla istek yakalayan kütüphane (MSW gibi) | Tarayıcıda ve testte aynı taklit                | Bir bağımlılık daha; sözleşmeyi yine sınamaz       |
| Geçici veritabanlı gerçek API                         | Uçtan uca testler                                | Daha yavaş; ama gerçek                             |

Kural: sahte sunucu ile gerçek sunucu **aynı uygunluk testlerinden** geçmelidir; yoksa testler yeşilken uygulama
bozuk olabilir. Uygulama temelinde: [`fakeApi.ts`](../../uygulama/web/test/helpers/fakeApi.ts) eşitleme mantığını
uygunluk testinden geçen başvuru sunucusundan alır.

## Tuzaklar

| Belirti                                                     | Neden                                                       | Çözüm                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Test yerelde geçiyor, CI'da bazen kalıyor                   | Sabit bekleme, saat, paylaşılan veri, kapı çakışması        | Koşulu bekleyin; saati/kapıyı/veriyi test seçsin          |
| Stil değişince onlarca test kırıldı                         | Sınıf adı ve DOM yapısıyla sorgu                            | Rol + ad                                                  |
| Test hep geçiyor, hata yakalamıyor                          | Beklenti yok ya da `waitFor` içinde hiçbir şey sınanmıyor   | Testi bilerek bozup kırıldığını görün                     |
| `findBy` ile bile "bulunamadı"                              | Öğe başka bir adla (ör. ünlemli) ya da gizli                | `screen.debug()` / `logRoles` ile erişilebilirlik ağacına bakın |
| Sahte zamanlayıcıyla test asılı kaldı                       | user-event zamanı ilerletemiyor                             | `advanceTimers` seçeneği                                  |
| "not wrapped in act" uyarıları                              | Test bitince süren güncelleme                               | Sonucu bekleyin; bileşen temizliği                        |
| Tarihli test her gece yarısı kalıyor                        | Test gerçek saati kullanıyor                                | Saati enjekte edin                                        |
| Sahte API testleri yeşil, uygulama bozuk                    | Sahte sunucu gerçeğinden sapmış                             | Uygunluk testi her iki sunucuya                           |
| Ekran görüntüsü testleri makineden makineye farklı          | Yazı tipi işleme, ölçek                                     | Aynı ortam, maske, eşik; az ekran                         |

## Denetim listesi

- [ ] Yeni saf mantığın birim testi var; kenar durumları (boş, uç değer, Türkçe karakter) dahil.
- [ ] Bileşen testleri rol + adla sorguluyor; `data-testid` yalnız zorunlu yerde.
- [ ] Sabit süreli bekleme yok (varsa gerekçesi yorumda).
- [ ] Saat, dil, saat dilimi, rastgelelik testte sabit.
- [ ] Yeni ekran uçtan uca testte 390 ve 360 genişlikte açılıyor; yatay kaydırma ve axe denetimi var.
- [ ] Hata, boş ve çevrimdışı durumları için en az birer test var.
- [ ] Testi bilerek bozup kırıldığı görüldü (test gerçekten sınıyor).
- [ ] `npm run check` yeşil; testler paylaşımlı makinede ≤ 2 işçiyle koşuyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Testi kullanıcı gözünden yaz: `getByRole`/`getByLabelText` ile sorgula, `userEvent` ile etkileş,
  ekrandaki sonucu bekle. Sınıf adı, iç durum ya da anlık görüntü (snapshot) testi yazma. Sabit süre bekleme. Saat
  ve rastgeleliği enjekte et. Mutlu yolun yanında hata, boş ve çevrimdışı durumlarını da sına."
- **Modelin tipik hatası:** Uygulamayı sınayan değil, sahteyi sınayan test yazar (taklit edilen işlevin çağrıldığını
  doğrular); `waitFor(() => {})` boş bırakır; `setTimeout`/`waitForTimeout` ile bekler; başarısız testi geçirmek için
  beklentiyi gevşetir ya da testi atlar (`.skip`).
- **Çıktıda arayın:** `.skip`, `.only`, `waitForTimeout`, `sleep(`, `toMatchSnapshot`, `container.querySelector`,
  `data-testid`, beklentisiz testler, `expect(mock).toHaveBeenCalled` dışında hiçbir şey sınamayan testler.
- **Doğrulama isteyin:** "Kodu bilerek boz, testin kırıldığını göster, sonra geri al" — modelin testinin gerçekten
  sınadığının en ucuz kanıtı.

## İlgili

- [Erişilebilirlik uygulaması](erisilebilirlik-uygulama.md) — rol, ad, elle denetim listesi
- [Veri getirme](veri-getirme.md) — hata/boş/çevrimdışı senaryoları
- [Duyarlı tasarım ve mobil](duyarli-tasarim-ve-mobil.md) — taşma ve dokunma hedefi ölçümü
- Çalışan örnekler: [`render.tsx`](../../uygulama/web/test/helpers/render.tsx) (sağlayıcılarla render),
  [`cevrimdisi-acilis.spec.ts`](../../uygulama/e2e/cevrimdisi-acilis.spec.ts) (çevrimdışı açılış)
- Başka kümelerde: [Test stratejisi](../00-yontem/test-stratejisi.md) (düzey seçimi, sahte ve taklit, kırılgan test belirtileri)
