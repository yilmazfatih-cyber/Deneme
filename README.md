# Köprü

Kelime bulmakta zorlanan afazili yetişkinler için Türkçe bir web uygulaması (PWA):

- **Konuş (Modül A):** Resimli iletişim panosu. Kişi aklındakini resim seçerek bulur, cihaz sesli söyler.
  Temel bir ihtiyaç ana ekrandan 3 dokunuşta ifade edilir (Konuş → Hızlı ihtiyaçlar → Su).
- **Öğren (Modül B):** Kişinin kendi hayatından kelimelerle, ipuçlu, 10–15 dakikalık günlük pratik yolculuğu.
- Telefonda bir bağlantıyla açılır, "Ana ekrana ekle" ile kendi simgesiyle başlar; ilk açılıştan sonra **internetsiz** çalışır.
  Sunucu, hesap, reklam ve analitik yoktur; **veri telefonda kalır**.

> Köprü bir iletişim ve pratik desteğidir; tedavinin yerini almaz. Dil ve konuşma terapistiyle birlikte kullanılmalıdır.

Ürün planı: [`docs/PLAN.md`](docs/PLAN.md) · Yol haritası: [`docs/ROADMAP.md`](docs/ROADMAP.md) ·
Ekip anayasası: [`CLAUDE.md`](CLAUDE.md) · Son demo: [`docs/sprints/S01/demo.md`](docs/sprints/S01/demo.md)

## Neler var

| Bölüm             | Özellikler                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ana ekran         | Konuş, Öğren, Ben kartı; altta her ekranda aynı yerde Geri / Evet / Hayır                                                                                                                                                                                                       |
| Pano              | Cümle şeridi (Söyle, Geri al, Temizle — geri getirilebilir, Göster), hazır cümleler, sık kullanılanlar satırı, 3 seviyeli kategori ağacı, ilk harf/hece ile bulma, sayfalı ızgara (2×3 … 3×5), kalıp kartları ("___ istiyorum")                                                 |
| Hızlı ihtiyaçlar  | Evet, Hayır, Ağrım var, Su, Tuvalet, Yardım, Bekle, Tekrar et, Bilmiyorum — tek dokunuşta                                                                                                                                                                                       |
| Vücut haritası    | Ön/arka çizim, 0–10 yüz ifadeli ağrı ölçeği → "Karnım ağrıyor. Ağrım 8 üzerinden 10."                                                                                                                                                                                           |
| Partner ekranı    | Büyük yazı, ekranı çevir, "Lütfen yavaş konuşun" ipuçları                                                                                                                                                                                                                       |
| Ben kartı         | "Afazim var. Anlıyorum ama konuşmakta zorlanıyorum." + acil durum kişisini arama                                                                                                                                                                                                |
| Öğrenme yolculuğu | 8 durak, kelime başına 4 aşama (Tanı → Hatırla → Kullan → Sürdür), 6 basamaklı ipucu, 3 düğmeli öz değerlendirme, 5 kutulu aralıklı tekrar, ısınma, eşleştirme, dinle-seç, adlandırma, cümle tamamlama, gündelik senaryo, dinle-tekrar et-kaydet, mola önerisi, otomatik zorluk |
| Bakım veren       | Fotoğraf + kelime + ses kaydıyla kişisel kart (hazır kartın yerine aynı konumda geçebilir), Ben kartı, görünüm (sol el, büyük yazı, yüksek kontrast, tek sütun, sol yarı, tutma süresi), ses hızı ve Türkçe ses testi                                                           |
| Terapist          | Durak sırası, azalan/artan ipucu, oturum uzunluğu, hedef kelime ekleme, ilerleme raporu (CSV, yazdır/PDF)                                                                                                                                                                       |
| Veri              | IndexedDB; tek dokunuşla `.zip` yedek ve geri yükleme (fotoğraf ve sesler dahil), kalıcı depolama isteği, aylık yedek hatırlatması                                                                                                                                              |

İçerik: 152 kelime kartı (her biri 3 anlam ipucu, 2 cümle tamamlama, ilk ses, anlam özellikleri, en az 2 hazır cümle),
19 kategori, 5 kalıp, 8 durak, 3 ısınma dizisi, 5 gündelik senaryo. Semboller: [Mulberry Symbols](https://mulberrysymbols.org) (CC BY-SA 4.0).

## Çalıştırma

Gereken: Node.js (güncel LTS) ve npm.

```bash
npm install
npm run dev            # http://localhost:5173
npm run dev:https      # telefonda denemek için yerel HTTPS (mikrofon ve service worker HTTPS ister)
```

Telefonda: bilgisayarla aynı ağdayken `npm run dev:https` çıktısındaki `https://<ip>:5173` adresini açın ve sertifika
uyarısını onaylayın. Gerçek kurulum (ana ekrana ekleme, internetsiz çalışma) için derlenmiş sürümü HTTPS üzerinden yayınlayın.

## Kalite

```bash
npm run check          # tip + lint + biçim + birim testler + içerik doğrulama
npm run e2e            # derler; Playwright ile 390×844 ve 360×800 uçtan uca test + axe erişilebilirlik taraması
SHOTS_DIR=docs/sprints/S02/shots npm run shots   # her ekranın görüntüsü
```

İlk kez Playwright çalıştırırken tarayıcıyı indirin: `npx playwright install chromium`
(ya da kurulu bir Chromium için `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/yol/chrome`).

## Yayınlama

`npm run build` → `dist/` klasörü statik bir sitedir (göreli yollar; alt klasörde de çalışır). Ücretsiz katman yeter:

- **Netlify / Cloudflare Pages:** derleme komutu `npm run build`, yayın klasörü `dist`.
- **GitHub Pages:** `dist/` içeriğini Pages'e yükleyin (HashRouter kullanıldığı için yönlendirme ayarı gerekmez).

## Klasör yapısı

```
content/            uygulama içeriği (JSON) — içerikçi
  vocabulary/*.json kelime kartları
  categories.json   kategori ağacı (en fazla 2 kategori seviyesi + kelimeler = 3)
  templates.json    "___ istiyorum" kalıpları
  quick.json        hızlı ihtiyaçlar
  journey.json      duraklar, ısınma dizileri, gündelik senaryolar
public/symbols/     Mulberry SVG'leri (npm run symbols)
public/audio/       hazır ses dosyaları (ileride)
src/
  app/              sayfalar
  features/board/   Modül A: cümle kurma, kart çözümleme, şerit
  features/journey/ Modül B: hedef kelimeler, oturum planı, aktiviteler, ilerleme
  components/       Tile, Pager, Shell (Geri/Evet/Hayır), Icon
  lib/              speech, media (kayıt, fotoğraf), srs, backup, storage, text
  db/               Dexie şeması
  content/          içerik şeması (Zod) ve yükleyici
  theme/tokens.ts   tasarım token'ları — tasarımcı
  i18n/tr.json      arayüz metinleri — içerikçi
scripts/            validate-content, import-symbols, make-icons
tests/unit|e2e|shots
docs/               plan, yol haritası, kararlar, tasarım, içerik, sprintler
.claude/            4 ajan, /sprint komutu, izinler
```

## Ajanlarla geliştirme

```bash
claude --agent urun-sorumlusu   # lider; kodcu, tasarımcı ve içerikçiyi alt ajan olarak çağırır
/sprint S02                     # bir sprinti brief'ten demo notuna kadar yürütür
```

Ayrıntılar: [`CLAUDE.md`](CLAUDE.md), [`.claude/agents/`](.claude/agents), [`.claude/skills/sprint/SKILL.md`](.claude/skills/sprint/SKILL.md).
Deneysel ajan takımı modu (Mod 2) için `.claude/settings.json`'a `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }` ekleyin.

## Lisanslar

- Kod: proje sahibinin belirleyeceği lisans.
- Semboller: Mulberry Symbols © Steve Lee, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) —
  değiştirilmeden kullanıldı; atıf uygulamanın "Hakkında" ekranında. Değiştirilen semboller aynı lisansla paylaşılmalıdır.
- Hazır sesler: [Piper](https://github.com/rhasspy/piper) `tr_TR-dfki-medium` ile üretildi; ses verisi DFKI,
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — **ticari kullanım için başka bir ses gerekir**
  (ör. insan sesiyle kayıt). Ayrıntı: `public/audio/MODEL_CARD.txt`.
- Yazı tipi: Atkinson Hyperlegible Next, Braille Institute, SIL Open Font License 1.1.
