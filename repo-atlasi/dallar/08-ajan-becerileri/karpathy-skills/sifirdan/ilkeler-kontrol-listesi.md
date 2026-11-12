# Dört ilke için kontrol listesi

andrej-karpathy-skills deposundaki dört ilkenin (commit `2c60614`) bir ajan oturumunu ya da bir PR'ı incelerken
kullanılacak, gözlenebilir sorulara çevrilmiş hâli. İlkelerin özgün metni için deponun `CLAUDE.md` dosyasına bak;
buradaki ifadeler bu atlasa aittir. Her maddenin yanında, `cerrahi.py`'nin onu diff'ten ölçüp ölçemediği yazar.

## 1. Kodlamadan önce düşün

Belirsizliği gizleme, varsayımı söyle, ödünleşimi göster.

- [ ] Ajan işe başlamadan önce varsayımlarını yazdı mı? (transkriptte görünür, diff'te görünmez)
- [ ] İsteğin birden çok yorumu varsa bunları sıraladı ve birini sessizce seçmedi mi? (diff'te görünmez)
- [ ] Daha basit bir yol varsa bunu söyledi mi, gerekiyorsa itiraz etti mi? (diff'te görünmez)
- [ ] Netleştirme soruları uygulamadan **önce** mi geldi, hatadan **sonra** mı? (transkript sırası)

## 2. Önce sadelik

İsteneni çözen en az kod; tahmine dayalı hiçbir şey.

- [ ] İstenmeyen bir özellik, ayar ya da "esneklik" eklendi mi? → `cerrahi.py` kısmen görür: `yeni-soyutlama`
- [ ] Tek kullanımlık bir iş için sınıf, arayüz ya da strateji deseni kuruldu mu? → `yeni-soyutlama`
- [ ] Olamayacak durumlar için hata yakalama eklendi mi? (diff'te görünür ama otomatik ayırt edilmez)
- [ ] Değişiklik, görevin büyüklüğüyle orantılı mı? → `buyukluk` (`--butce` ile)

## 3. Cerrahi değişiklik

Yalnızca gerekene dokun; yalnızca kendi dağınıklığını topla.

- [ ] Görevin dışındaki dosyalara dokunuldu mu? → `kapsam-disi` (`--izinli` ile)
- [ ] Yalnızca boşluk, tırnak ya da biçim değişikliği var mı? → `bosluk`, `tirnak`
- [ ] Var olan yorumlar silindi ya da yeniden yazıldı mı, istenmeyen docstring eklendi mi? → `yorum`, `yorum-silindi`,
      `yorum-eklendi`
- [ ] İstenmeden yeniden adlandırma yapıldı mı? → `ad-degisimi`
- [ ] Değişiklikle kullanılmaz hâle gelen kendi içe aktarmaları ve değişkenleri temizlendi mi? (linter'ın işi)
- [ ] Görülen ama dokunulmayan ölü kod ya da hata **not edildi** mi? (transkriptte görünür)

## 4. Hedefe dayalı yürütme

"Çalışsın" değil, doğrulanabilir bir başarı ölçütü.

- [ ] Hata düzeltmesi, hatayı yeniden üreten bir testle mi başladı? → `test-yok` yalnızca testin hiç değişmediğini görür
- [ ] Çok adımlı işte her adımın bir doğrulaması var mı ("adım → doğrula: …")? (plan metninde görünür)
- [ ] "Bitti" denmeden önce testler çalıştırıldı ve çıktısı gösterildi mi? (transkriptte; bkz.
      [superpowers minisi](../../superpowers/sifirdan/README.md) `dogrulandi` ölçümü)

## Puanı nasıl okumalı?

`cerrahi.py` 100'den başlar ve işaret başına puan düşer (kozmetik işaretlerin toplam cezası 30 ile sınırlı). 85 ve
üstü "cerrahi", 60–84 "dikkat", 60'ın altı "taşkın" sayılır ve komut 1 ile çıkar. Puan bir hakem değil, bir sohbet
başlatıcıdır: biçimlendirme görevin kendisiyse `bosluk` işaretleri doğrudur. Deponun README'si de aynı uyarıyı yapar:
bu ilkeler hız yerine dikkati seçer; basit işlerde muhakemeni kullan.
