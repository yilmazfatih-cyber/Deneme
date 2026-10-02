# İçerik rehberi

Şema: `src/content/schema.ts` · Doğrulama: `npm run validate:content` (Zod + dosyalar arası kurallar + sembol dosyaları).

## Dosyalar

| Dosya                       | İçerik                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `content/vocabulary/*.json` | Kelime kartları (152)                                                                       |
| `content/categories.json`   | Kategori ağacı: en fazla 2 kategori seviyesi; kelimeler yalnız yaprak kategorilere bağlanır |
| `content/templates.json`    | Kalıplar: `istiyorum`, `agriyor`, `nerede`, `gitmek`, `var_mi`                              |
| `content/quick.json`        | Hızlı ihtiyaçlar (9)                                                                        |
| `content/journey.json`      | 8 durak (8–12 kelime; bir kelime yalnız bir durakta), ısınma dizileri, gündelik senaryolar  |
| `src/i18n/tr.json`          | Arayüz metinleri                                                                            |

## Kelime kartı

```json
{
  "id": "su",
  "word": "su",
  "category": "icecek",
  "symbol": "symbols/water.svg",
  "phrases": ["Bir bardak su verir misin?"],
  "forms": { "istiyorum": "Su istiyorum", "var_mi": "Su var mı?" },
  "syllables": ["su"],
  "frequency": "high",
  "level": 1,
  "cues": {
    "semantic": ["İçilir.", "Bardağa konur.", "Musluktan akar."],
    "sentence": ["Susadım, bir bardak …", "Çiçekleri … ile sularım."],
    "firstSound": "s…"
  },
  "features": { "group": "içecek", "use": "içmek", "place": "mutfak", "looks": "şeffaf" }
}
```

İsteğe bağlı: `audio` (`audio/<id>.mp3`, hazır seslendirme), `symbolVariants` (`kadin` / `erkek`; duygularda kullanılır).

## Yazım kuralları

- `word` küçük harf; ekranda ilk harf `tr-TR` ile büyütülür (`ilaç` → `İlaç`).
- `syllables` birleşince boşluksuz kelimeyi verir (şema denetler).
- **3 anlam ipucu:** kısa, somut, yetişkin hayatından ("Rize'de yetişir."). Oturum her seferinde farklı birini seçer.
- **2 cümle tamamlama:** "…" boşluğuna hedef kelime (gerekirse ekli hâli) gelir; cümle ezberlenmesin diye iki farklı bağlam.
- **Hazır biçimler:** `forms` + `phrases` toplamı en az 2. Çekimler elle ve doğru yazılır ("Bacağım ağrıyor", "Eve gitmek istiyorum").
- Cümleler en fazla 6 kelime. Ödül dili ("Aferin", "Süper"), "kaybettin", "yanlış" ve tedavi vaadi yok (birim test denetler).
- Ton: saygılı, sakin; seslenme "sen" (pano kişinin kendi sesi), partnere "siz".

## Semboller

`npm run symbols` (MULBERRY_DIR gerekli) içerikteki tüm `symbols/*.svg` başvurularını Mulberry deposundan kopyalar.
Dosya adları sadeleşir: `help_,_to.svg` → `help_to.svg`. Semboller değiştirilmez.

**Yaklaşık semboller** (kişisel fotoğrafla değiştirilmesi önerilir):

| Kelime  | Sembol                                        | Neden                     |
| ------- | --------------------------------------------- | ------------------------- |
| eşim    | `hold_hands_to` (el ele)                      | Cinsiyet varsaymamak için |
| torunum | `grandparents` (büyükanne-büyükbaba ve çocuk) | Torun sembolü yok         |
| eczane  | `medicine_cabinet`                            | Eczane sembolü yok        |
| hastane | `ambulance`                                   | Hastane sembolü yok       |
| el      | `fingers`                                     | Yalın el sembolü yok      |
| simit   | `bagel`                                       | Görünüş olarak yakın      |
| yorgun  | `yawn_to` (esneyen)                           | Yorgun sembolü yok        |

**Eklenmeyen:** cami (Mulberry'de yalnız kilise var; kültürel olarak uygun değil). Bakım veren fotoğrafla ekleyebilir.

## Ses

Hazır ses dosyaları henüz yok: tüm okumalar cihazın Türkçe sesiyle ya da kişisel kayıtla yapılır. Faz 1 açık işi:
hızlı ihtiyaçlar + en sık 300 kelime için bir kez, yavaş ve net seslendirilmiş `audio/<id>.mp3` dosyaları;
dosya adı kelime kimliğiyle aynı olmalı ve karttaki `audio` alanına yazılmalı.

## Klinik not

İpucu basamakları ve aşama geçişleri plandaki tasarıma göre uygulandı (Big CACTUS: kişiye uyarlama ve işlevsel cümle
içinde çalışma). İçerik bir dil ve konuşma terapistince gözden geçirilmeden kullanıcı testine çıkılmamalı.
