# S01 — MVP: iletişim panosu ve öğrenme yolculuğu

## Amaç

Planın Faz 0 iskeletini kurmak, Modül A'yı (pano) uçtan uca bitirmek ve Modül B'nin (yolculuk) çekirdeğini çalışır
hâle getirmek; böylece ilk kullanıcı testine ve DKT incelemesine götürülebilecek bir sürüm elde etmek.

## Kapsam

**İçinde:** proje iskeleti ve kalite komutları; ana ekran; hızlı ihtiyaçlar; kategori panosu (3 seviye); cümle şeridi;
kalıp kartları; harfle bulma; sık kullanılanlar; vücut haritası; partner ekranı; Ben kartı; kişisel kart ekleme;
görünüm/ses ayarları; kurulum sihirbazı; yedek; yolculuk (8 durak, 4 aşama, 6 ipucu, aralıklı tekrar, 7 aktivite);
terapist ayarları ve rapor; içerik (≈150 kelime); ajan kiti.

**Dışında:** konuşma tanıma, bulut, hazır ses dosyaları (seslendirme gerekiyor), Faz 3 aktiviteleri, karanlık mod.

## Kabul kriterleri

| #   | Kriter                                                         | Doğrulama                                              |
| --- | -------------------------------------------------------------- | ------------------------------------------------------ |
| K1  | Temel bir ihtiyaç ana ekrandan ≤ 3 dokunuşta söylenir          | e2e: Konuş → Hızlı ihtiyaçlar → Su                     |
| K2  | Kategori ağacı en fazla 3 seviye                               | e2e: Yiyecek → Kahvaltı → Peynir; şema kuralı          |
| K3  | Kalıp + kelime doğru Türkçe biçimi verir                       | e2e: "___ ağrıyor" + Baş → "Başım ağrıyor"; birim test |
| K4  | Kart yerleri değişmez; sık kullanılanlar ayrı satırda          | e2e                                                    |
| K5  | Tüm dokunma alanları ≥ 72 px, 360 px'te yatay kaydırma yok     | e2e (8 ekran, 2 boyut)                                 |
| K6  | axe taramasında kritik bulgu yok                               | e2e                                                    |
| K7  | Sol el modu Geri/Evet/Hayır'ı aynalar                          | e2e                                                    |
| K8  | Uçak modunda çalışır                                           | e2e (service worker + çevrimdışı yeniden yükleme)      |
| K9  | Oturumda en az 3 aktivite türü; nötr özet; kırmızı çarpı yok   | birim + e2e                                            |
| K10 | Aralıklı tekrar: 1-2-4-7-14 gün, ilerlet/tut/geri al           | birim test                                             |
| K11 | Yedek fotoğraf ve sesle birlikte gidip gelir                   | birim test                                             |
| K12 | Her kelimede 3 anlam ipucu, 2 cümle tamamlama, ≥ 2 hazır biçim | `validate:content` + birim test                        |
| K13 | Ekran görüntüleri 390×844 ve 360×800 sprint klasöründe         | `shots/`                                               |

## İlgili ilkeler

Tümü; özellikle 3 (büyük, tek elle), 4 (yerler değişmez), 5 (hata affeder), 8 (başarısızlık hissettirmez), 9 (çevrimdışı).

## Riskler

Klinik içerik DKT'ce incelenmedi; Türkçe cihaz sesi telefona göre değişir; iOS Safari'de henüz denenmedi.
