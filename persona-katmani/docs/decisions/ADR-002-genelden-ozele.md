# ADR-002 · İkiz bireysel psikoloji değil, genelden özele sosyolojik davranış modeli (F-11, F-12, F-13, F-14)

Tarih: 2026-11-08 · Durum: Kabul edildi (proje sahibi)

## Karar

1. **Zayıf noktadan hedefleme yok (F-11).** Kişi düzeyi parametreler yalnızca **genel çıkarım** için kullanılır; hiçbir
   parametre kişi kimliğiyle müşterinin pazarlama/CRM sistemine geri yazılmaz, kişiye özel mesaj üretmek için kullanılmaz.
2. **Kişi kendi ikizini görmez (F-12).** Ürün bireye yönelik bir arayüz sunmaz; ikiz, müşteri şirketin analiz nesnesidir.
   (KVKK erişim hakkı standart veri erişimi olarak kalır; hukuki görüş gerekir. Bkz. 06.)
3. **Çerçeve: psikolog değil sosyolog.** Katman tek bir insanın zihnini modellemez; **gelen tüm müşterilerin davranışlarını ve
   o davranışların ölçeğini** analiz eder. Analiz **genelden özele** iner ve her seviyede kendi parametre setini üretir:

   | Seviye | Parametre kaynağı | Örnek |
   | --- | --- | --- |
   | S0 Dünya | Literatür etki kitaplığı (`data/davranis-etkileri.xlsx`), çok ülkeli çalışmalar | λ kayıptan kaçınma ≈ 1.3–2.0 |
   | S1 Türkiye | Türkiye örneklemli çalışmalar, Global Preferences Survey ülke puanı, TÜİK, kiracılar arası toplulaştırılmış kalibrasyon | sabır −0.05 SD, belirsizlikten kaçınma yüksek |
   | S2 Şehir / bölge | Bölgesel istatistik, kiracının o şehirdeki toplu davranış verisi | İç Anadolu kargo eşiği duyarlılığı |
   | S3 Konum / site | Mağazanın bulunduğu yer (AVM, cadde, semt) veya web sitesi/uygulama; kiracının kendi log verisi | Bu sitede yorum ağırlığı, sepet terk eğrisi |
   | S4 Gerçek müşteri | Kiracının gerçek müşterilerinin gözlenen davranışından hesaplanan parametreler | Müşteri kümesi veya tek müşteri posterior'u |

   Her alt seviye üst seviyeyi **öncül** olarak alır ve kendi verisiyle günceller (hiyerarşik model, `07`). Veri yoksa seviye,
   üstünün değerini "miras" etiketiyle taşır.
4. **Kullanım serbestliği.** Simülasyon tasarlanırken hangi seviyenin parametreleri kullanılacağı seçilebilir
   (yalnızca Dünya; Türkiye; şehir; site; gerçek müşteri). Rapor hangi seviyenin kullanıldığını ve her parametrenin hangi seviyeden
   geldiğini gösterir. Gerçek müşteriden gelen parametreler ayrı tutulur ve **özellikle** vurgulanır.
5. **Kültür öncülü (F-14) kabul.** Dünya → Türkiye → şehir zinciri tam da bu öncüldür; kart "bu değer S1'den miras" der.
6. **"İkiz" adı (F-13).** Birim artık "X kişisinin ikizi" değil, seviye bazlı **davranış profili**dir; S4'te "gerçek müşteri profili".
   "İkiz" kelimesi ürün dilinde S4 kümesi için kullanılabilir, tek kişi için kullanılmaz.

## Sonuçları

- `07-dijital-ikiz-istatistik.md` seviye zinciri S0–S4 etrafında yeniden yazılır; kişiye gösterim ve kişi düzeyi dışa aktarma bölümleri çıkar.
- `02` persona sınıfları: `population_sampled` (S0–S2), `site_grounded` (S3), `customer_grounded` (S4, küme veya kişi).
- `05` çalışma tasarımına `parameter_level` seçimi; rapora "parametre kaynağı seviyesi" sütunu.
- `06`: kişi düzeyi verinin yalnızca S4 kestirimi için işlenmesi, dışa aktarım yasağı, standart KVKK silme; bireysel arayüz yok.
- Excel: her bulguya `seviye` etiketi (dünya / türkiye / şehir / konum-site / müşteri); Parametreler sayfasında seviye başına bulgu sayısı.
- F-15 (rıza geri çekme) daraldı: kişi kimliğiyle rapor yok; yalnızca S4 kestiriminden silme. Hukuki görüşle kapanır.
