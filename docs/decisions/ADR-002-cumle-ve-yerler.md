# ADR-002 — Cümle kurma, kart yerleri ve kişisel kartlar

Durum: Kabul edildi · 2 Ekim 2026

## Cümle kurma

Türkçe eklemeli olduğu için çekim üretilmez. Kelime kartı `forms` alanında kalıp kimliğine göre hazır biçim taşır
(`"agriyor": "Başım ağrıyor"`). Kalıp seçiliyken kelimeye dokunulursa hazır biçim, yoksa kalıbın `fallback` metni
(`"{w} istiyorum"`) kullanılır. Kalıp yoksa kelimeler yalın sırayla okunur. Kartın hazır cümleleri (`forms` + `phrases`)
şeridin altındaki sabit satırda gösterilir; biri seçilince yalın kelimenin yerine geçer.

## Yerler değişmez

- Kart sırası içerik dosyasındaki sıradır; hiçbir sıralama (sıklık, alfabe) ızgarayı değiştirmez.
- Sık kullanılanlar yalnız "Konuş" ekranında ayrı bir satırda; satırın yüksekliği boşken de ayrılır.
- Hazır cümle satırı ve sayfa düğmeleri her zaman yer kaplar; görünmez olsalar da ızgarayı kaydırmazlar.
- Pano ekranları görüntü alanına sabitlenir; satırlar kalan yüksekliği paylaşır (en az 72 px).

## Kişisel kartlar

- Yeni kişisel kart, bölümün başında, eklenme sırasıyla durur ("önce kişisel"). Yeni kart eklendiğinde yalnız o
  bölümdeki hazır kartlar bir adım kayar; bu bilinçli bir uzlaşmadır.
- "Bu kartın yerine geçsin" seçilirse kişisel kart hazır kartın **konumunu ve kimliğini** alır (ör. "Eşim" sembolü
  yerine eşin fotoğrafı). Yolculuk ilerlemesi ve kullanım sayıları aynı kimlikte kalır. Kelime aynıysa hazır
  biçimler korunur; farklıysa (ör. "Ahmet") yalnız bakım verenin yazdığı cümleler kullanılır.

## Sesli okuma önceliği

Kişisel kayıt → `public/audio/<id>.mp3` → cihazın Türkçe sesi (hız varsayılanı 0,8).
