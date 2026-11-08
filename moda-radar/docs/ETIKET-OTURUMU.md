# Etiketleme oturumu — Claude Code yönergesi (abonelikle, API anahtarsız)

Bu belge, haftalık zamanlanmış Claude Code oturumunun izlediği yönergedir. Oturum, defile görsellerine kendi
gözüyle bakar (`Read` aracı görseli gösterir), `content/taksonomi.json` sözlüğüyle etiketler ve veritabanına yükler.
Görseller geçici klasöre iner ve oturum sonunda silinir; depoya hiçbir görsel girmez (ADR-002, ADR-006).
Oturumun yapabileceği tek dış eylem, veritabanı dosyasını `moda-verileri` dalına göndermektir.

## Roller

| Rol          | Model                        | İş                                                       |
| ------------ | ---------------------------- | -------------------------------------------------------- |
| Baş (oturum) | Fable 5.1 (yoksa Opus 5.5)   | Veriyi al, işi dağıt, yüklemeyi yap, raporla             |
| Etiketçi     | Sonnet 5.5 (`model: sonnet`) | 20'şer görsellik paketleri gözle etiketler; yorum yapmaz |
| Denetçi      | Opus 5.5 (`model: opus`)     | %5 örneklemi ikinci kez etiketler (`denetim: true`)      |

Bütçe: oturum başına en fazla **120 görsel** (6 paket) + denetim; en fazla **8 alt görev**.

## Akış

1. **Veriyi al.** `moda-verileri` dalını geçici bir worktree'ye çek, `veri/moda.db` dosyasını `moda-radar/veri/`
   altına kopyala, `pip install -e ".[renk]"` kur, `python -m moda_radar db-ozet` ile durumu oku.
   Dal yoksa veya `gorsel` tablosu boşsa dur; raporda "veri yok, Actions toplayıcısı henüz görsel kaydetmedi" yaz.
2. **Bekleyenleri listele.** Sezon: Ağustos–Aralık `SS<yıl+1>`, Şubat–Temmuz `FW<yıl>`, Ocak `SS<yıl>`.
   `python -m moda_radar etiket-bekleyen --sezon SS27 --siniri 120 > /tmp/bekleyen.json`
3. **İndir.** Listedeki her URL'yi geçici klasöre (`/tmp/gorsel/<id>.jpg`) indir; saniyede en fazla bir istek,
   User-Agent `ModaRadar/0.1 (+github.com/yilmazfatih-cyber/Deneme)`. `assets.vogue.com` için ağ izni gerekir;
   indirme reddedilirse dur ve raporda "ağ izni yok: assets.vogue.com" yaz.
4. **Dağıt.** Her etiketçiye 20 görsel yolu + `content/taksonomi.json` + şu kural: her görselde görünen her giysi
   parçası (üst / alt / dış / tam / aksesuar) ayrı nesne; değerler yalnız sözlükten; emin değilse `bilinmiyor`;
   yüz, beden, kişi tanımı yok. Çıktı `/tmp/etiket-<paket>.json`, biçim:

   ```json
   {
     "sezon": "SS27",
     "etiketleyen_model": "claude-code/sonnet-5.5",
     "denetim": false,
     "kayitlar": [
       {
         "gorsel_id": "<id>",
         "parca_id": "<id>-ust",
         "parca_konumu": "ust",
         "kategori": "kadin-ust",
         "siluet": "oversize",
         "boy": "kalca",
         "yaka": "gomlek",
         "kol": "uzun",
         "kumas_gorunumu": "keten",
         "desen": "duz",
         "detay": "yok",
         "doku": "duz",
         "kapanma": "dugme",
         "renk_sayisi": "tek"
       }
     ]
   }
   ```

5. **Yükle.** Her paket için `python -m moda_radar etiket-yukle /tmp/etiket-<paket>.json`. Çıktıdaki `dusen` ve
   `uyari` sayılarını raporla; `uyari` yüksekse o etiketçinin sözlük dışı değer ürettiğini not et.
6. **Denetim.** `python -m moda_radar etiket-bekleyen --sezon SS27 --denetim --siniri 12` → denetçi (Opus) aynı
   biçimde, `denetim: true` ile etiketler → `etiket-yukle`. Sonra `python -m moda_radar etiket-uyum --sezon SS27`;
   κ < 0,80 olan eksenleri raporla.
7. **Temizle ve yayınla.** `/tmp/gorsel` klasörünü sil. Güncel `veri/moda.db` dosyasını worktree'ye kopyala,
   `moda-verileri` dalına commit et ve gönder. Kod dallarına dokunma; Issue, e-posta veya başka dış eylem yok.
8. **Rapor.** Kısa Türkçe özet: kaç görsel etiketlendi, kaç parça, eksen başına κ, kalan bekleyen sayısı, sorunlar.

## Yapma

- Görseli depoya, Issue'ya veya rapora ekleme; yalnız etiket yaz.
- Sözlük dışı değer uydurma; `etiket-yukle` zaten `bilinmiyor`a çevirir ama bu uyum skorunu düşürür.
- Kod dosyası değiştirme; hata görürsen raporda yaz.
- Kullanım sınırına yaklaşırsan paketleri kes, yüklediklerini yayınla, kalanı raporla.
