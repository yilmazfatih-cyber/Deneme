# Bilgi hazinesi

Yazılım, veri, makine öğrenmesi, dil modelleri, ürün ve Türkçe'ye özgü konularda **288 çalışma kâğıdı** (13 küme).
Her not bir konuyu tek sayfada toplar: karar tablosu, tuzaklar (belirti → neden → çözüm), denetim listesi ve
"küçük modele yaptırırken" bölümü. Kod örneklerinin çoğu (948 blok) çalıştırılarak doğrulanır.

Dizin: [`INDEX.md`](INDEX.md) · Not biçimi: [`BICIM.md`](BICIM.md) · Model talimatları: [`AGENTS.md`](AGENTS.md)

## Nasıl kullanılır

**Aramak** (depo kökünden):

```bash
python havuz/bilgi/araclar/ara.py "servis çalışanı eski sürümü gösteriyor"
```

Sonuç, okunacak bölümü ve satırını verir. `--tam` bölümün tamamını yazar; `--json` bir araca bağlamak içindir.

**Bir modele okutmak:** iş vermeden önce ilgili notu bağlam olarak verin ("önce şu notun Tuzaklar ve Denetim
listesi bölümlerini oku"). Notların "Küçük modele yaptırırken" bölümü, o konuda isteme ne yazılacağını söyler.

**Doğrulamak:** bütün notların biçimini, bağlantılarını ve kod örneklerini denetler:

```bash
python havuz/bilgi/araclar/dogrula.py
```

## Kümeler

| Küme | Konu |
| --- | --- |
| [`00-yontem`](00-yontem/) | problem çözme, işi parçalama, hata ayıklama ve hata sınıfları, yabancı kod okuma, tasarım kararı, tahmin, kod inceleme, yeniden düzenleme, test stratejisi, teknik yazı, performans, güvenilirlik, öğrenme, terim sözlüğü |
| [`10-diller`](10-diller/) | TypeScript, JavaScript, Python, SQL, HTML, CSS, kabuk, düzenli ifade, git, veri biçimleri, Unicode, hata yönetimi, modüller |
| [`20-web-onyuz`](20-web-onyuz/) | React, durum, veri getirme, formlar, erişilebilirlik, mobil, performans, PWA, tarayıcı API'leri, tasarım sistemi, güvenlik, test, yönlendirme, animasyon, Vite |
| [`30-arkauc`](30-arkauc/) | HTTP, API tasarımı, kimlik ve yetki, veritabanı, migrasyon, işlem ve eşzamanlılık, önbellek, arka plan işleri, dosya, e-posta, ödeme, webhook, gerçek zamanlı, arama, saat dilimi |
| [`40-sistem-tasarimi`](40-sistem-tasarimi/) | ölçekleme, kapasite, önbellek katmanları, tutarlılık, kuyruk, dayanıklılık, gözlemlenebilirlik, çevrimdışı-önce, çok kiracılık, yedi örnek tasarım |
| [`50-guvenlik`](50-guvenlik/) | tehdit modeli, enjeksiyon, XSS/CSP, CSRF/CORS, SSRF, erişim denetimi, parola ve oturum, kriptografi kullanımı, sırlar, tedarik zinciri, olay müdahalesi, KVKK pratiği |
| [`60-devops`](60-devops/) | yayın yolu seçimi, Linux, Docker, CI/CD, DNS, HTTPS, ters vekil, yedekleme, izleme, dağıtım stratejileri, durağan site, mobil paketleme, ilk yayın listesi |
| [`70-veri`](70-veri/) | analitik veri modeli, olay izleme, ürün ölçütleri, analitik SQL, istatistik, görselleştirme, A/B testi, nedensellik, veri kalitesi, gizlilik, pano, tahmin, rapor |
| [`80-ml`](80-ml/) | çerçeveleme, veri sızıntısı, ayrım ve çapraz doğrulama, ölçütler, kalibrasyon, ağaç toplulukları, derin öğrenme, eğitim hata ayıklama, transformer, öneri, zaman serisi, MLOps |
| [`85-llm`](85-llm/) | dil modeli nasıl çalışır, istem, küçük modeller, yapılı çıktı, RAG, ajan, değerlendirme, model seçimi, yerel çalıştırma, maliyet, güvenlik, kodlama için LLM |
| [`92-matematik`](92-matematik/) | kayan nokta, olasılık, dağılımlar, lineer cebir, kalkülüs, geri yayılım, optimizasyon, bilgi kuramı, kestirim, sayısal yöntemler, finans hesabı |
| [`95-urun`](95-urun/) | fikir doğrulama, görüşme, MVP, gereksinim, önceliklendirme, UX, tanıtım sayfası, SEO, ölçüm, fiyatlandırma, yasal belgeler, lansman, yapay zekâ özelliği |
| [`97-turkce`](97-turkce/) | büyük/küçük harf, yerelleştirme, ekler ve ünlü uyumu, arayüz dili, Türkçe metin işleme, TCKN/VKN/IBAN, sayı ve para |

## Sınırlar

- Notlar Kasım 2026'da yazıldı. Sürüme bağlı ayrıntılar notun içinde tarihlidir; çabuk eskiyen bilgi (fiyat,
  sürüm, sınır) bilerek yazılmadı ya da "doğrulanmadı" diye işaretlendi.
- Kod örnekleri bu ortamda (Python 3.13, Node 22, SQLite 3.53) çalıştırıldı. Saat dilimi, ICU ve SQLite derlemesine
  bağlı birkaç çıktı başka sürümde farklı olabilir; notlar bunu belirtir.
- Hukuk, vergi, sağlık ve finansla ilgili bölümler genel ilkedir; **danışmanlık değildir**.
- Arama aracı sözcük temellidir (BM25 + kaba Türkçe kök); anlamca yakın ama farklı sözcüklerle sorulan soruyu
  kaçırabilir. Bulamazsanız daha genel sözcük deneyin ya da [`INDEX.md`](INDEX.md)'ye bakın.
