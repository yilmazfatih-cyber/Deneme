# Havuz — model talimatları

Bu dosya `havuz/` klasöründe çalışan bir dil modeli içindir. İnsan okuru için: [`README.md`](README.md).

## Bu klasör ne

Birbirinden **bağımsız** temeller: her biri tek başına kopyalanıp kullanılabilen, testli ve belgeli bir başlangıç
noktası (uygulama, web sitesi, dil modeli, veri araçları…). Ayrıca konu konu bilgi notları (`bilgi/`) ve ortak
araçlar (`araclar/`). Bütün temeller aynı kurallara uyar: [`STANDARTLAR.md`](STANDARTLAR.md).

## İlk iş

1. Görev hangi temelle ilgili? Aşağıdaki haritadan bul.
2. O temelin `AGENTS.md` dosyasını **baştan sona** oku. Komutlar, dosya haritası, değişmez kurallar ve tarifler
   oradadır. Bu dosyadaki genel kurallarla çelişirse temelin kendi `AGENTS.md`'si geçerlidir.
3. Konuyla ilgili bir bilgi notu var mı bak:
   `python havuz/bilgi/araclar/ara.py "<konu ya da soru>"` — çıkan bölümü oku.

## Harita

| Klasör              | Ne                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------- |
| `uygulama/`         | Tam yığın uygulama: çevrimdışı-önce PWA (React) + API (Hono, SQLite) + eşitleme     |
| `site/`             | Web sitesi: tanıtım + blog + belgeler (Astro, Tailwind), SEO, arama, TR/EN          |
| `yz/`               | Dil modeli uygulamaları: sağlayıcı katmanı, yapılı çıktı, RAG, ajan, değerlendirme   |
| `dil-modeli/`       | Sıfırdan dil modeli: tokenizer, Transformer, eğitim, ince ayar, dışa aktarım, sunum |
| `ince-ayar/`        | Açık modelleri ince ayarlama: sohbet, sınıflandırma, gömme, varlık tanıma           |
| `ml-temel/`         | numpy ile sıfırdan makine öğrenmesi + CSV'den model ve rapor aracı                 |
| `veri/`             | Türkçe başvuru verileri, sentetik veri, veri kalitesi, veri hattı, veri kataloğu    |
| `kutuphane/`        | Tek dosyalık, bağımlılıksız yardımcılar (TypeScript + Python): Türkçe, para, tarih… |
| `algoritma/`        | Algoritmalar ve veri yapıları (Python), kaba kuvvetle doğrulanmış                   |
| `sifirdan/dil/`     | Sıfırdan: yorumlayıcı, sanal makine, regex, JSON, şablon, Markdown, fark…           |
| `sifirdan/veri/`    | Sıfırdan: anahtar-değer deposu, B+ ağacı, mini SQL, MVCC, arama motoru, CRDT, git…  |
| `sifirdan/ag/`      | Sıfırdan: HTTP sunucu/istemci, WebSocket, web çatısı, ORM, kripto eğitimi, DNS…     |
| `sifirdan/arayuz/`  | Sıfırdan: tepkisellik, sanal DOM, yönlendirici, e-tablo, düzenleyici, oyun motoru…  |
| `bilgi/`            | Konu konu çalışma kâğıtları (karar tabloları, tuzaklar, denetim listeleri)          |
| `sinav/`            | Kod ajanı sınavı: küçük modelleri bu temellerde gizli testlerle ölçen 15 görev     |
| `rehber/`           | İnsan için: küçük modelle çalışma rehberi ve hazır istemler                         |
| `araclar/`          | `durum.py` (envanter), `denetle.py` (kur + denetle), `yeni_proje.py` (kopyala)      |

## Komutlar (depo kökünden)

| Komut                                                   | Ne yapar                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `python havuz/araclar/denetle.py --liste`               | Temeller ve denetim komutları                                |
| `python havuz/araclar/denetle.py <temel> --kur`         | Temelin bağımlılıklarını kurar ve denetimini çalıştırır      |
| `python havuz/araclar/denetle.py <temel>`               | Yalnız denetim (kurulu ortamla)                              |
| `python havuz/araclar/durum.py`                         | Envanter + standart denetimi (zorunlu dosyalar var mı)       |
| `python havuz/araclar/yeni_proje.py <temel> <hedef>`    | Temeli yeni bir projeye kopyalar                             |
| `python havuz/bilgi/araclar/ara.py "<soru>"`            | Bilgi notlarında arar                                        |
| `python havuz/bilgi/araclar/dogrula.py`                 | Bilgi notlarını doğrular (kod bloklarını çalıştırır)         |

## Değişmez kurallar

1. **Tek temelde çalış.** Bir görev yalnız bir temelin klasörünü değiştirir. Temeller birbirini içe aktarmaz;
   bir parçaya başka temelde de ihtiyaç varsa kopyalanır ve kaynağı başlık yorumuna yazılır.
2. **Denetim yeşil değilse iş bitmemiştir.** Temelin denetim komutunu çalıştır ve çıktısını göster.
3. **Testi gevşetme.** Test silmek, atlamak, beklentisini değiştirmek çözüm değildir. Test gerçekten yanlışsa
   nedenini yaz ve kullanıcıdan onay al.
4. **Uydurma.** Var olmayan komut, paket, işlev, sürüm, model adı yazma. Emin değilsen dosyada ara ya da kurulu
   paketin kaynağına bak.
5. **Türkçe:** kullanıcıya görünen metin ve belgeler Türkçe; büyük/küçük harf dönüşümü Türkçe kuralla
   (`bilgi/97-turkce/buyuk-kucuk-harf.md`). E-posta, URL, kod adları gibi makine metninde İngilizce kural.
6. **Sır yok.** Parola, anahtar, belirteç depoya yazılmaz; `.env` dosyaları yoksayılır.
7. **Kayıt (commit) küçük olur** ve bir iş anlatır: "Görevlere etiket alanı eklendi". Kullanıcı istemeden `git push`
   yapılmaz.

## Yeni bir temel eklemek

1. `STANDARTLAR.md`'yi oku; §4'teki dosyaları (README, AGENTS, havuz.json, .gitignore, docs/KARARLAR.md) yaz.
2. Denetim komutu tek komut olsun ve 2 dakikanın altında, ağsız çalışsın.
3. `python havuz/araclar/durum.py` çıktısında yeni temel "standart ✓" görünmeli.
4. `README.md`'deki temel tablosunu güncelle (`python havuz/araclar/durum.py --markdown`).

## Bitti tanımı

- [ ] Değişiklik tek temelin içinde
- [ ] Temelin denetim komutu yeşil; çıktısı gösterildi
- [ ] Yeni davranışın testi var
- [ ] Kullanıcıya görünen yeni metin sözlük/ayar dosyasında, Türkçe ve doğru karakterlerle
- [ ] Temelin `AGENTS.md`'si ya da README'si davranış değiştiyse güncellendi
- [ ] Ne değiştiği 3–6 maddede özetlendi
