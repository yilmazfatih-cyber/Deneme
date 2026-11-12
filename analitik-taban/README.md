# Analitik Taban

Mixpanel ve Hotjar analizlerini şirketteki Claude Code'da **az tokenla** yapmak için hazır çalışma alanı.
Taban kişisel Claude hesabında, hiçbir şirket verisi kullanılmadan geliştirildi; şirkette yalnız bağlam ve kimlik
bilgisi eklenir.

## İki katman

| Katman    | Nerede                        | İçerik                                                         | Git'e girer mi |
| --------- | ----------------------------- | -------------------------------------------------------------- | -------------- |
| **Taban** | bu klasör                     | komutlar, betikler, istatistik, testler, belgeler, demo verisi | evet           |
| **Yerel** | `yerel/` ve `CLAUDE.local.md` | anahtarlar, proje ayarları, olay sözlüğü, notlar, raporlar     | hayır          |

Taban burada (kişisel hesapta) büyür; şirkette `git pull` ile güncellenir. Şirket verisi yalnız şirket
bilgisayarındaki `yerel/` klasöründe yaşar.

## Token nereden kazanılıyor

1. **Veriyi betik çeker.** Ham yanıt diske yazılır, modele 10–40 satırlık tablo gider. Demo ölçümü: `/neden`
   çıktısı 1,2 KB, aynı analizin ham verisi 10,8 KB; 137 KB'lık anket CSV'sinin özeti 1,6 KB.
2. **Keşif turu yok.** Olay ve özellik adları bir kez kurulan yerel sözlükten aranır (`mp.py ara`).
3. **Hesap kodda.** Katkı ve sapma analizi, huni, tutunma, oran testi, SRM, deney kararı betikte; model yalnız yorumlar.
4. **Talimatlar kısa.** Her oturumda yalnız ~3 KB bağlam yüklenir; skill gövdeleri çağrılınca gelir. Claude'a giden
   talimatlar İngilizce (Türkçe aynı içerik için daha çok token tutar), size dönen her şey Türkçe.
5. **MCP kullanılırsa** ham yanıt `veri-cekici` alt ajanında (Haiku) kalır, ana sohbete yalnız tablo gelir.
6. **Raporu betik yazar**, model yalnız `## Yorum` bölümünü doldurur. Varsayılan model Sonnet.

## Hızlı başlangıç

1. Bu klasörü şirket bilgisayarına alın ([docs/KURULUM.md](docs/KURULUM.md), bölüm 1).
2. `cd analitik-taban` ve `claude`.
3. `/kurulum` — ya da önce `/kurulum demo` ile sentetik veride deneyin.

Sonra: `/rapor hafta` · `/neden Purchase hafta` · `/huni "Satın alma" $os` · `/hotjar yerel/girdi/anket.csv`.

| Komut      | İş                                                          |
| ---------- | ----------------------------------------------------------- |
| `/rapor`   | KPI raporu: değişim, eğilim, uyarı                          |
| `/neden`   | Değişim hangi platform/sürüm/ülke/kanalda yoğunlaşıyor      |
| `/huni`    | Kayıtlı ya da anlık huni, en zayıf adım, kırılım            |
| `/tutunma` | Kohort tutunması                                            |
| `/deney`   | A/B testi kararı (lift, %95 GA, p, SRM, MDE)                |
| `/sor`     | Tek soruluk hızlı cevap, kayıtlı rapor, CSV özeti           |
| `/hotjar`  | Anket/NPS/geri bildirim: dağılım, temalar, alıntılar        |
| `/capraz`  | Mixpanel bulgusunu Hotjar kayıt/ısı haritası/anketle sınama |
| `/kurulum` | İlk kurulum ya da demo                                      |

Rutin sayılar için Claude'u açmanız bile gerekmez: `python3 kit/mp.py kpi --donem hafta` (sıfır token).

## 2026 itibarıyla bilinmesi gerekenler

- **Mixpanel:** Query API Free planda yok. `/segmentation` ve `/funnels` bakım modunda (kit filtresiz kırılımda
  kullanmaz). Proje API secret'ı 3 Mart 2027'de kalkıyor → service account. Resmi Mixpanel MCP sunucusu da
  destekleniyor.
- **Hotjar:** Hesaplar Contentsquare'e taşınıyor; taşınınca **geçmiş kayıtlar ve ısı haritaları gelmiyor**, Hotjar bir
  süre salt-okunur kalıp siliniyor — saklamak istediğinizi dışa aktarın. API yalnız anket yanıtlarını veriyor ve
  yalnız Ask Scale planında; diğer her şey CSV dışa aktarımıyla. Hotjar yalnız web sitesini görür.

Ayrıntı ve kaynaklar: [docs/API-NOTLARI.md](docs/API-NOTLARI.md).

## Belgeler

- [docs/KURULUM.md](docs/KURULUM.md) — şirket bilgisayarına alma, Mixpanel/Hotjar erişimi, sorun giderme
- [docs/KULLANIM.md](docs/KULLANIM.md) — komutlar, Claude'suz kullanım, token alışkanlıkları
- [docs/GELISTIRME.md](docs/GELISTIRME.md) — tabanı kişisel hesapta geliştirme, mimari, şirket verisi kuralı
- [docs/API-NOTLARI.md](docs/API-NOTLARI.md) — uç noktalar, sınırlar, yanıt biçimleri

## Burada denemek (şirket verisi olmadan)

```bash
ANALITIK_YEREL=/tmp/analitik-demo/yerel python3 kit/kurulum.py baslat --demo
```

```bash
ANALITIK_YEREL=/tmp/analitik-demo/yerel python3 kit/mp.py neden Purchase --donem hafta
```

Demo verisinde iki gömülü olay var: Android 5.2.0'da ödeme dönüşümü düşüşü ve "Yeni Sepet" A/B testi.
Testler: `python3 -m unittest discover -s kit/tests -t kit` (Python 3.9–3.13, ~6 sn).
