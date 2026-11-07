# Roller: ilan şartlarından türetilen görevliler

Her rol `.claude/agents/pk-<rol>.md` dosyasında bir ajan olarak tanımlıdır ve `model: opus` ile çalışır.
Şartların kaynağı `00-arastirma.md` §1-2'dir. Talp'ın kendi ilan metinleri bulunamadığı için (sitede kariyer sayfası yok),
şartlar Talp ürün sayfaları + Aaru'nun 2026 ilanlarından alındı.

| Ajan | İlan karşılığı | İlan şartı (özet) | Mimaride yazdığı bölüm |
| --- | --- | --- | --- |
| `pk-simulasyon-mimari` | Head of / Manager, Simulation Engineering | Simülasyon, sentetik veri, dağıtık hesaplama sistemlerini ölçekte kurmuş; LLM uygulamaları, çoklu ajan, model orkestrasyonu, çıkarım zamanı hesaplama; kurucuya rapor veren, elleri kodda lider | `mimari/01-sistem.md`: katmanlar, bileşenler, veri modeli, çalışma zamanı, ölçek ve maliyet |
| `pk-insan-sim-arastirmacisi` | Research Scientist, Human Simulation (Listen Labs / Aaru) | Hesaplamalı sosyal bilim veya eşdeğer araştırma derinliği; persona sadakati, nüfus hizalama, kalibrasyon; yayın tercih | `mimari/02-persona-uretimi.md`: nüfustan personaya üretim, temellendirme, sadakat metrikleri, kalıp yargı çöküşü teşhisi |
| `pk-degerlendirme-muhendisi` | Software Engineer, Applied AI + Researcher, Evaluation | Değerlendirme koşum takımları; boru hattı verimi; test edilebilir, tekrarlanabilir, iyileştirilebilir ajan altyapısı; gerçek sonuçla karşılaştırma | `mimari/03-degerlendirme.md`: eval harness, geriye dönük test, kalibrasyon döngüsü, gözlemlenebilirlik, maliyet/verim |
| `pk-ortam-muhendisi` | Software Engineer, Simulation (ürün yüzü: Product/Ad Intelligence) | Tarayıcı/uygulama içinde gezinen ajanlar; çok kipli reklam algısı (görsel, video, oynanabilir); Figma entegrasyonu; olay yakalama | `mimari/04-ortamlar.md`: web/uygulama/Figma/reklam sandbox'ları, eylem alanı, araçlar, olay şeması |
| `pk-icgoru-mimari` | Simulation Architect (müşteri yüzü) | 7+ yıl araştırma / tüketici içgörüsü; CS şart değil; araştırma sorusunu simülasyon tasarımına çevirir | `mimari/05-icgoru-ve-urun.md`: kullanım senaryoları, sektör şablonları, soru → simülasyon tasarımı, rapor biçimi, kullanım sınırları |
| `pk-guven-gizlilik` | (ilanlarda yok; Talp'ın "SOC 2 & GDPR in progress" beyanından) | Veri yönetişimi, GDPR/KVKK, SOC 2, kötüye kullanım, açıklama yükümlülükleri | `mimari/06-guven-gizlilik.md`: veri sınıfları, saklama, sentetik/gerçek ayrımı, kötüye kullanım önlemleri, açıklama ilkeleri |

Lider ve bütünleştirici: oturumu yürüten ana ajan. Felsefi kararlar proje sahibine bırakılır (`FELSEFI-KARARLAR.md`).
