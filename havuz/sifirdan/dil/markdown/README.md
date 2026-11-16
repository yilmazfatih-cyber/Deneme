# markdown — Markdown → güvenli HTML

CommonMark'a yakın bir Markdown çevirici + GFM eklentileri (tablo, görev listesi, `~~üstü çizili~~`).
**Güvenli çıktı:** ham HTML asla geçmez (kaçışlanır); `javascript:`, `vbscript:`, `data:` …
bağlantıları kurulmaz (gizleme denemeleri dahil); başlıklara Türkçe harfleri ASCII'ye çeviren
kimlikler verilir ve içindekiler tablosu üretilir.

Destek: ATX ve Setext başlıklar, paragraflar, `*eğik*`/`_eğik_`, `**kalın**`, `~~çizik~~`,
`` `kod` ``, `[bağlantı](adres "başlık")`, `![görsel](adres)`, `<https://…>` ve `<e@posta>`
otomatik bağlantılar, sert satır kırma (iki boşluk ya da `\`), ters bölü kaçışları, HTML
varlıkları (`&copy;`), kod çitleri (``` ve ~~~, dil bilgisi), girintili kod, alıntılar (iç içe,
tembel devam), sırasız/sıralı/iç içe listeler (sıkı/gevşek, başlangıç numarası), görev listeleri
(`- [x]`), yatay çizgi, GFM tabloları (hizalama, `\|`).

## Çalıştır (dil/ klasöründen)

```bash
printf '# Başlık\n\n[[içindekiler]]\n\n## Çalışma Ortamı\n\nMerhaba *dünya* ve [bağ](javascript:alert(1)).\n' > /tmp/belge.md
python -m markdown cevir /tmp/belge.md
python -m markdown cevir /tmp/belge.md -o /tmp/belge.html --tam-sayfa
python -m markdown icindekiler /tmp/belge.md
python -m pytest tests/markdown -q
```

Python'dan:

```python
from markdown import to_html, convert
to_html("# Merhaba *dünya*")   # '<h1 id="merhaba-dunya">Merhaba <em>dünya</em></h1>\n'
sonuc = convert(metin)          # sonuc.html, sonuc.toc (düzey, metin, kimlik)
to_html(metin, highlight=lambda dil, kod: ...)   # kod blokları için vurgulayıcı kancası
```

## Nasıl çalışır

```
metin ──► blocks.py ──────────────► blok ağacı ──► render.py ──────────────► HTML
          satır satır: başlık, çit,               her blok için HTML; paragraf/başlık
          alıntı (içerik yeniden                  metni → inline.py; başlık → slug.py
          ayrıştırılır), liste öğesi              (kimlik + içindekiler); tablo → tables.py
          (girintisi soyulup yeniden
          ayrıştırılır), tablo, paragraf
                                   inline.py: soldan sağa tarama → çift bağlı öğe listesi
                                   (düz metin kaçışlı; kod/bağlantı hazır HTML; * _ ~ sınırlayıcı)
                                   delimiters.py: CommonMark vurgu algoritması (doğrusal)
                                   safety.py: kaçış + adres izin listesi
```

## CommonMark'tan bilinçli sapmalar

| Konu | Bu çevirici | CommonMark |
| --- | --- | --- |
| Ham HTML (`<b>`, `<div>`) | metin olarak kaçışlanır | olduğu gibi geçer |
| Tehlikeli şemalı bağlantı | bağlantı kurulmaz, yalnız metin | olduğu gibi `href` |
| Başvuru bağlantıları `[a][ref]` + `[ref]: url` | yok (düz metin kalır) | var |
| Varlıklar (`&copy;`) | olduğu gibi yazılır (tarayıcı çözer) | Unicode karaktere çevrilir |
| Başlık `id` | her zaman eklenir (Türkçe→ASCII) | yok |
| Liste içinde sekme/girinti uç durumları, tembel devam satırlarının bazı biçimleri | sadeleştirilmiş | ayrıntılı kurallar |
| `<li>` görev kutusu | `<input type="checkbox" disabled="" />` | (GFM: aynı anlam) |
| İç içe alıntı/liste derinliği | 40 düzeyle sınırlı, sonrası paragraf | sınırsız |
| Çıplak URL (`https://…`) | bağlantı yapılmaz | (GFM uzantısı yapar) |

Çıktı biçimi (satır sonları, sıkı/gevşek listeler) CommonMark başvuru çıktısına yakın tutuldu;
kesin uyum CommonMark test takımıyla **doğrulanmadı** (çevrimdışı ortamda takım yoktu).

## Dosya haritası

| Dosya           | Görev                                                         |
| --------------- | ------------------------------------------------------------- |
| `blocks.py`     | blok ayrıştırıcı ve blok dataclass'ları                       |
| `tables.py`     | GFM tablo ayrıştırma ve HTML'i                                |
| `inline.py`     | satır içi tarayıcı, bağlantılar, kod, otomatik bağlantılar    |
| `delimiters.py` | vurgu (`* _ ~~`) eşleştirme, çift bağlı listeler              |
| `safety.py`     | HTML kaçışı, adres süzme (`safe_url`)                         |
| `slug.py`       | Türkçe→ASCII kimlik, tekrar numaralama, içindekiler HTML'i    |
| `render.py`     | blok ağacı → HTML; vurgulayıcı kancası                        |
| `__main__.py`   | komut satırı (`cevir`, `icindekiler`)                         |

## Sınırlar

- Yukarıdaki sapmalar. Ayrıca: dipnotlar, tanım listeleri, emoji kısa kodları, matematik yok.
- Satır içi `<` her zaman kaçışlanır; bu yüzden Markdown içinde HTML yorumu `<!-- -->` da görünür.
- Güvenlik özellik testi rastgele girdiyle yapılır (`test_any_input_produces_safe_html`); yine de
  çıktıyı kullanıcıya göstermeden önce bir CSP başlığı kullanmak iyi bir ek önlemdir.

## Buradan nereye (küçük modele alıştırmalar)

1. **Başvuru bağlantıları:** `[ad]: https://…` tanımlarını blocks.py'de toplayın, inline.py'de
   `[metin][ad]` ve `[ad]` biçimlerini çözün.
2. **Çıplak URL bağlantılama:** paragraf metninde `https?://…` dizilerini (sondaki noktalama hariç)
   `safe_url`'dan geçirip bağlantı yapın.
3. **Sözdizimi vurgulama:** `highlight` kancasına belirteç tabanlı bir vurgulayıcı bağlayın
   (ör. Tohum anahtar sözcüklerini `<span class="anahtar">` ile sarmak; kaçışı unutmayın).
4. **Dipnotlar** `[^1]` ve sayfa sonunda dipnot listesi.
5. **İçindekiler derinliği:** `[[içindekiler:2-3]]` gibi düzey süzgeci.
6. **Başlık bağlantı simgesi:** her başlığa `<a href="#kimlik">#</a>` ekleyen seçenek.
