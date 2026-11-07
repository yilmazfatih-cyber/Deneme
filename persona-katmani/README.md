# Persona Katmanı

Şirketlerin uygulama, web ve pazarlama kararlarını (reklam, akış, mesaj, konsept) gerçek kullanıcıya çıkmadan
LLM personalarıyla simüle etmesini sağlayan yazılım katmanının **mimari tasarımı**. Henüz kod yok; bu klasör
araştırma, rol tanımları, altı bölümlük mimari ve proje sahibine bırakılan felsefi kararlardan oluşur.

> Simülasyon ölçümün yerine geçmez. Katman kendini karar desteği olarak konumlar; sonuçları gerçek A/B ve kampanya
> verisiyle sürekli kalibre eder ve belirsizliğini gösterir.

## Nasıl üretildi

1. Akım araştırıldı: GitHub çerçeveleri (TinyTroupe, Generative Agents, PersonaHub, OASIS/Concordia), ticari oyuncular
   (Talp, Aaru, Synthetic Users, Listen Labs vb.) ve 2025-2026 literatürünün uyarıları → `docs/00-arastirma.md`.
2. Talp'ın (talp.ai) ürün sayfaları ve aynı kategorideki ilanlar (Aaru 2026) tarandı; Talp sitesinde kariyer sayfası
   bulunmadığı için şartlar bu iki kaynaktan türetildi → `docs/01-roller.md`.
3. Her role karşılık `model: opus` ile çalışan bir ajan tanımlandı (`.claude/agents/pk-*.md`) ve her ajan kendi mimari
   bölümünü yazdı → `docs/mimari/0N-*.md`.
4. Bölümler `docs/MIMARI.md`'de bütünleştirildi; teknik olmayan kararlar `docs/FELSEFI-KARARLAR.md`'de proje sahibine soruldu.

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `docs/00-arastirma.md` | Talp, rakipler, GitHub çerçeveleri, literatür uyarıları, mimariye aktarılan gereksinimler |
| `docs/01-roller.md` | İlan şartı → ajan rolü eşlemesi |
| `docs/mimari/01-sistem.md` | Katmanlar, bileşenler, veri modeli, çalışma zamanı, ölçek ve maliyet (Simülasyon Mimarı) |
| `docs/mimari/02-persona-uretimi.md` | Nüfustan personaya üretim, temellendirme, sadakat ve çöküş teşhisi (Araştırmacı) |
| `docs/mimari/03-degerlendirme.md` | Eval harness, geriye dönük test, kalibrasyon döngüsü, gözlemlenebilirlik (Değerlendirme Müh.) |
| `docs/mimari/04-ortamlar.md` | Web/uygulama/Figma/reklam sandbox'ları, eylem alanı, olay şeması (Ortam Müh.) |
| `docs/mimari/05-icgoru-ve-urun.md` | Kullanım senaryoları, sektör şablonları, rapor biçimi, kullanım sınırları (İçgörü Mimarı) |
| `docs/mimari/06-guven-gizlilik.md` | Veri sınıfları, KVKK/GDPR/SOC 2, kötüye kullanım, açıklama (Güven ve Gizlilik) |
| `docs/MIMARI.md` | Bütünleşik mimari: tek diyagram, bileşen sözleşmeleri, yol haritası |
| `docs/FELSEFI-KARARLAR.md` | Proje sahibinin karar vereceği sorular; her biri seçenekler ve öneriyle |

## Ajanları yeniden çalıştırma

Depo kökünde Claude Code açıkken `@pk-simulasyon-mimari`, `@pk-insan-sim-arastirmacisi`, `@pk-degerlendirme-muhendisi`,
`@pk-ortam-muhendisi`, `@pk-icgoru-mimari`, `@pk-guven-gizlilik` ajanları çağrılabilir. Her biri yalnızca kendi bölüm
dosyasına yazar; kesişen noktaları "Arayüz" başlığıyla işaretler; değer sorularını karar vermeden proje sahibine bırakır.
