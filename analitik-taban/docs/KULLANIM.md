# Günlük kullanım

`analitik-taban` klasöründe `claude` açın ve komutlardan birini yazın. Komutlar kısa; ayrıntıyı betikler taşır.

## Komutlar

| Komut      | Ne yapar                                                          | Örnek                                                         |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `/rapor`   | KPI raporu, önceki döneme göre değişim, eğilim, uyarı             | `/rapor hafta`                                                |
| `/neden`   | Bir metriğin değişimi hangi platform/sürüm/ülke/kanalda yoğun     | `/neden Purchase hafta` · `/neden ödeme dönüşümü neden düştü` |
| `/huni`    | Kayıtlı ya da anlık huni, en zayıf adım, kırılım, dönem kıyası    | `/huni Satın alma $os` · `/huni "Sepet" "Ödeme" "Satın alma"` |
| `/tutunma` | Kohort tutunması (G1/G7/G30, haftalık)                            | `/tutunma Sign Up App Open hafta`                             |
| `/deney`   | A/B testi: lift, %95 GA, p, SRM, saptanabilir en küçük fark       | `/deney "Yeni Sepet" Purchase`                                |
| `/sor`     | Tek sorulu hızlı cevap; kayıtlı rapor ID'si; CSV özeti            | `/sor geçen ay Android'de kaç kişi sepete ekledi`             |
| `/hotjar`  | Anket/NPS/geri bildirim: dağılım, temalar ve payları, alıntılar   | `/hotjar yerel/girdi/nps.csv`                                 |
| `/capraz`  | Mixpanel bulgusunu Hotjar kayıt/ısı haritası/anketle sınama planı | `/capraz ödeme adımında Android kaybı arttı`                  |
| `/kurulum` | İlk kurulum ya da demo                                            | `/kurulum demo`                                               |

Serbest soru da sorabilirsiniz; Claude aynı betikleri kullanır. Sonuçlar Türkçe ve kısa gelir; tablo istemezseniz
"yalnız sonuç" deyin.

## Claude'suz (sıfır token)

Rutin sayılar için Claude'u hiç açmayın; betikler terminalde aynı tabloyu verir:

```bash
python3 kit/mp.py kpi --donem hafta --rapor
```

```bash
python3 kit/mp.py neden "Purchase" --donem gun
```

Tüm seçenekler: `python3 kit/mp.py -h`, `python3 kit/hj.py -h`, `python3 kit/ozet.py -h`.

Tek seferlik iş için Claude'u etkileşimsiz çalıştırın (tek tur, bağlam birikmez):

```bash
claude -p "/rapor hafta"
```

## Token alışkanlıkları

Tabanın kendi tasarrufu (ölçüm demo verisiyle):

- `/neden` çıktısı ~1,2 KB; aynı analizin ham verisi ~10,8 KB. Gerçek projede segment ve gün arttıkça fark büyür.
- 640 yanıtlık anket CSV'si 137 KB; `hj.py ozet` çıktısı 1,6 KB, `hj.py tema` 1,1 KB.
- Her oturumda yüklenen sabit metin: `CLAUDE.md` ~2 KB + `CLAUDE.local.md` ~1 KB. Skill metinleri yalnız çağrılınca gelir.
- Hesaplar (katkı, sapma z, huni, tutunma, oran testi, SRM, deney kararı) betikte; model hesap yapmaz, yorumlar.

Sizin alışkanlıklarınız:

1. **Bir analiz = bir oturum.** Konu değişince `/clear`. Uzun oturum her turda bütün geçmişi yeniden işler.
2. **Model:** çalışma alanı varsayılanı Sonnet (`.claude/settings.json`). Opus'u yalnız gerçekten zor yorum için
   `/model opus` ile açın. Alt ajan Haiku kullanır.
3. **Ölçün:** `/usage` (skill/alt ajan/MCP bazında tüketim), `/context` (bağlamı ne dolduruyor).
4. **Kullanmadığınız MCP sunucularını** bu klasörde `/mcp` ile kapatın.
5. **Ham tablo yapıştırmayın.** Dosyayı `yerel/girdi/` altına koyup `ozet.py`'ye verin.
6. **Raporu betik yazsın:** `--rapor` dosyayı oluşturur; Claude yalnız `## Yorum` bölümünü doldurur.
7. **Günlüğü güncel tutun:** `yerel/notlar.md`'ye sürüm/kampanya tarihlerini yazın; `/neden` bunları kendisi gösterir.
8. **Tema kurallarını saklayın:** `yerel/temalar.json` bir kez yazılır, sonraki anketlerde model örnek okumadan sayar.
9. Kısa cevap isteyin: "3 madde", "yalnız sayı".

## Yerel dosyalar (şirkete özel, git dışı)

| Dosya                            | İçerik                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| `yerel/.env`                     | Gizli anahtarlar (Claude okuyamaz)                             |
| `yerel/ayarlar.json`             | Proje, KPI, huni, boyut ayarları                               |
| `yerel/sozluk.json`              | Olay sözlüğü (`mp.py sozluk`)                                  |
| `yerel/notlar.md`                | Tarihli sürüm/kampanya/kesinti günlüğü                         |
| `yerel/metrikler.md`             | Metrik tanımları                                               |
| `yerel/temalar.json`             | Anket tema kuralları                                           |
| `yerel/girdi/`                   | Elle dışa aktarılan CSV/XLSX                                   |
| `yerel/raporlar/`                | Üretilen raporlar                                              |
| `yerel/veri/`, `yerel/onbellek/` | Ham yanıtlar ve önbellek (Claude okumaz)                       |
| `CLAUDE.local.md`                | Her oturumda yüklenen kısa bağlam (`kurulum.py baglam` üretir) |

## Yorumlarken

- Komut "gürültü sınırında" diyorsa yorum yapılmaz.
- `/neden`'de **sapma z** yerelleştirir (büyük segment her zaman büyük fark üretir); **karma kayması** satırı sürüm
  geçişi ya da kampanya demektir, sayım yerine oranla bakın (`--pay` / `--payda`).
- Huni ve deneylerde son günlerin dönüşüm penceresi kapanmamış olabilir; komut bunu not olarak yazar.
- Hotjar yalnız web'i görür; uygulama içi sorunlar için başka kanıt gerekir (`/capraz` bunu kontrol eder).
