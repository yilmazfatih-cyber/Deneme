---
name: sor
description: Moda Radar'a renk, desen, kumaş, kalıp ve segment için yatırım kararı sorar ("/sor LCW kadın üst, keten oversize gömlek, lacivert, düz desen, hedef 899 TL"). Soruyu taksonomiye çevirir, `python -m moda_radar sor` çalıştırır, beş boyutlu kartı sunar ve editör notunu ayrı verir.
---

# /sor <serbest metin soru>

1. Soruyu ayrıştır: **segment** (Beymen→luks, Zara/Massimo/Ipekyol→premium, LCW/Koton/DeFacto→orta, Addax→deger, pazar→pazar),
   **kategori** (varsayılan kadin-ust), **renk** (hex, TCX kodu ya da ad; ad verilmişse `python -m moda_radar esle --hex` için
   en yakın hex'i sen seç ve kartta "ad→hex yorumu bana ait" de), **desen / siluet / kumaş / detay** değerleri yalnız
   `content/taksonomi.json` sözlüğünden; kullanıcı sözlük dışı söylediyse en yakın değeri seç ve belirt.
   Eksik alan: segment yoksa sor; diğerleri yoksa "bilinmiyor"/varsayılan ile devam et.
2. Çalıştır (proje kökü `moda-radar/`):
   `python3 -m moda_radar sor --segment <kod> --kategori <kat> --renk "<hex|TCX>" --desen <d> --siluet <s> --kumas <k> [--hedef-fiyat N] [--maliyet N] [--rakip N] [--sezon SSYY]`
   Sezon verilmediyse bugüne göre bir sonraki satın alma sezonu (Kasım→SS, Mayıs→FW).
3. Kartı olduğu gibi sun: beş boyut ayrı satır, eksen başına olasılık, karar, gerekçe, kararı değiştirecek sinyal, kaynak sayısı.
   Tek skor üretme (ilke 6). "Tutacak" deme; olasılık ve ufuk de (ilke 1).
4. Altına **Editör notu** başlığıyla kendi alan yorumunu en fazla 4 cümle ekle: Türkiye takvimi (Ramazan, bayram, okul),
   segment gerçekliği, model verisinde olmayan bir risk. Model çıktısıyla çelişiyorsan çelişkiyi açıkça yaz.
5. Kaynak sayısı 0 ise ilk cümlede söyle: "Bu nitelik için podyum sinyali yok; karar yalnız segment önselleriyle."
6. En altta: "Yatırım tavsiyesi değildir; karar satın almacınındır." (ilke 8)
