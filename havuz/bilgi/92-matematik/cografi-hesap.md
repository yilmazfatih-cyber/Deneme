---
baslik: Coğrafi hesap
ozet: Enlem-boylamla mesafe (haversine ve hatası), boylamda cos(enlem) ölçeği, sınır kutusuyla yakın nokta araması, yön ve açı sarması, koordinat sırası ve duyarlık; Türkiye koordinatlarıyla çalışan örnekler.
etiketler: [matematik, cografya, konum, mesafe, trigonometri, sql]
duzey: orta
guncellik: 2026-11
---

# Coğrafi hesap

> Bu notu ne zaman okumalı: iki konum arasındaki mesafe, "bana en yakın şube/eczane", bir yarıçap içindeki
> noktalar, yön (pusula açısı) ya da harita koordinatı saklama işi geldiğinde; mesafeler tuhaf çıktığında
> ("İzmir–Kars 1.800 km") ya da yakındaki nokta listede görünmediğinde.

## Temel fikir

- Enlem (latitude) ve boylam (longitude) **açıdır**, uzunluk değil. Yerküre ~6.371 km yarıçaplı bir küre sayılır.
- **Enlemde** 1 derece her yerde ~111,2 km'dir. **Boylamda** 1 derece `111,2 × cos(enlem)` km'dir: Türkiye'de
  (36–42° K) 1 boylam derecesi ~83–90 km. Dereceleri düzlem gibi kullanmak doğu-batı mesafeleri %30'a kadar şişirir.
- Mesafe için **haversine** (küre üzerinde büyük daire); ülke içinde kısa mesafe için eş-dikdörtgen yaklaşım da
  yeter. Küre modelinin elipsoide göre hatası binde birkaçtır; ölçme (tapu, mühendislik) işi değilse önemsizdir.
- "En yakın N nokta" için önce ucuz bir **sınır kutusu** (bounding box) ile adayları süzün, mesafeyi yalnız onlar
  için hesaplayın. Kutunun boylam genişliği de `cos(enlem)` ister.
- Açılar sarar: 359° ile 1° arası 2°'dir; 350° ile 10°'nin ortalaması 0°'dir, 180° değil.

## Karar tablosu

| İş | Yöntem | Not |
| --- | --- | --- |
| İki nokta arası kuş uçuşu mesafe | Haversine | Türkiye içinde hata ~%0,2–0,3 (aşağıda ölçüldü) |
| Çok sayıda kısa mesafe (şehir içi), hız önemli | Eş-dikdörtgen: `111,2 · hypot(Δenlem, Δboylam · cos(orta enlem))` | Birkaç yüz km'ye kadar haversine kadar iyi |
| Ölçme, harita mühendisliği, santimetre | Elipsoit (WGS84) formülleri ya da hazır coğrafi kütüphane | Küre yetmez |
| Yol mesafesi / süre | Yönlendirme servisi ya da yol ağı | Kuş uçuşu yol değildir; şehirde 1,3–1,5 kat fark sık görülür (doğrulanmadı) |
| Yarıçap içinde arama, veritabanında | Sınır kutusu (dizinli) + haversine ile kesin süzme | Kutu boylamda `cos` ile genişler |
| Çok sayıda noktada en yakın komşu | 3B birim vektörlerle k-d ağacı ya da ızgara hücreleri | Ham enlem/boylamla k-d ağacı yanlış mesafe kullanır |
| Bir nokta bir bölgenin (il sınırı) içinde mi | Çokgende nokta; küçük bölgede düzlem varsayımı yeter | Çok büyük bölgede küresel yöntem gerekir |
| Yön, rüzgâr, pusula açısı ortalaması | Birim vektör ortalaması | Düz ortalama sarmada bozulur |

## Mesafe: dört yöntem, bir başvuru

Başvuru WGS84 elipsoidi üzerinde Vincenty formülü (klasik başvuru örneğiyle 54.972,271 m doğrulandı). Koordinatlar
yaklaşık il merkezleridir; "Ankara" Kızılay:

```python calistir
import math

R = 6371.0088  # yerkürenin ortalama yarıçapı, km
CITY = {  # (enlem, boylam), yaklaşık; SIRA: önce enlem. "Ankara" = Kızılay
    "Ankara": (39.9208, 32.8541), "İstanbul": (41.0082, 28.9784), "İzmir": (38.4192, 27.1287),
    "Edirne": (41.6771, 26.5557), "Kars": (40.6013, 43.0975), "Ulus": (39.9420, 32.8543),
}


def haversine(a, b):
    (la1, lo1), (la2, lo2) = [(math.radians(x), math.radians(y)) for x, y in (a, b)]
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def degrees_flat(a, b):  # YANLIŞ: dereceyi düzlem sanmak (boylam derecesi Türkiye'de ~85 km, 111 değil)
    return math.dist(a, b) * 111.195


def equirectangular(a, b):  # kısa mesafede yeterli: boylam farkı cos(ortalama enlem) ile küçültülür
    mid = math.radians((a[0] + b[0]) / 2)
    return 111.195 * math.hypot(b[0] - a[0], (b[1] - a[1]) * math.cos(mid))


def vincenty(p, q):  # WGS84 elipsoidi (başvuru; klasik örnekle 54972.271 m doğrulandı)
    a, f = 6378137.0, 1 / 298.257223563
    b = (1 - f) * a
    u1, u2 = (math.atan((1 - f) * math.tan(math.radians(x))) for x in (p[0], q[0]))
    big_l = lam = math.radians(q[1] - p[1])
    for _ in range(200):
        sin_s = math.hypot(math.cos(u2) * math.sin(lam), math.cos(u1) * math.sin(u2) - math.sin(u1) * math.cos(u2) * math.cos(lam))
        cos_s = math.sin(u1) * math.sin(u2) + math.cos(u1) * math.cos(u2) * math.cos(lam)
        sigma = math.atan2(sin_s, cos_s)
        sin_a = math.cos(u1) * math.cos(u2) * math.sin(lam) / sin_s
        cos2_a = 1 - sin_a**2
        c2m = cos_s - 2 * math.sin(u1) * math.sin(u2) / cos2_a
        c = f / 16 * cos2_a * (4 + f * (4 - 3 * cos2_a))
        prev, lam = lam, big_l + (1 - c) * f * sin_a * (sigma + c * sin_s * (c2m + c * cos_s * (-1 + 2 * c2m**2)))
        if abs(lam - prev) < 1e-12:
            break
    u_sq = cos2_a * (a * a - b * b) / (b * b)
    big_a = 1 + u_sq / 16384 * (4096 + u_sq * (-768 + u_sq * (320 - 175 * u_sq)))
    big_b = u_sq / 1024 * (256 + u_sq * (-128 + u_sq * (74 - 47 * u_sq)))
    ds = big_b * sin_s * (c2m + big_b / 4 * (cos_s * (-1 + 2 * c2m**2) - big_b / 6 * c2m * (-3 + 4 * sin_s**2) * (-3 + 4 * c2m**2)))
    return b * big_a * (sigma - ds) / 1000


print("güzergâh              elipsoit   haversine   düz-derece   eş-dikdörtgen")
for x, y in (("Ankara", "İstanbul"), ("Edirne", "Kars"), ("İzmir", "Kars"), ("Ankara", "Ulus")):
    ref = vincenty(CITY[x], CITY[y])
    row = [f(CITY[x], CITY[y]) for f in (haversine, degrees_flat, equirectangular)]
    print(f"{x + '–' + y:20s} {ref:8.1f} km " + "  ".join(f"{100 * (v / ref - 1):+7.2f}%" for v in row))
```

```cikti
güzergâh              elipsoit   haversine   düz-derece   eş-dikdörtgen
Ankara–İstanbul         350.1 km   -0.21%   +27.83%    -0.20%
Edirne–Kars            1391.8 km   -0.25%   +32.44%    -0.10%
İzmir–Kars             1392.5 km   -0.24%   +28.70%    -0.09%
Ankara–Ulus               2.4 km   +0.15%    +0.15%    +0.15%
```

Okuma:

- Haversine Türkiye'deki güzergâhlarda elipsoitten binde 2–3 sapıyor; uygulama işlerinde yeterli.
- Düz-derece doğu-batı güzergâhlarında %28–32 fazla; kuzey-güney (Kızılay–Ulus) güzergâhında doğru çıkıyor. Hata
  yöne bağlı olduğu için testte tek bir kuzey-güney örneği hatayı gizler: testlere doğu-batı örneği koyun.
- Eş-dikdörtgen yaklaşım bu ölçekte haversine kadar iyi ve daha ucuz; kutuplara yakın ve kıtalar arası mesafede
  bozulur.

## Yakın nokta araması: sınır kutusu + kesin mesafe

Veritabanında enlem ve boylam dizinli tutulur; önce kutu (dizin kullanır), sonra yalnız kutudakiler için haversine.
Örnekte 2.000 rastgele eczaneye iki işaretli nokta eklendi: 1,11 km kuzeyde "KUZEY", 1,02 km doğuda "DOĞU":

```python calistir
import math
import random
import sqlite3

R, KM_PER_DEG = 6371.0088, 111.195  # ortalama yarıçap; enlemde 1 derece ≈ 111,2 km (her yerde)


def haversine(lat1, lon1, lat2, lon2):
    p1, p2, dp, dl = map(math.radians, (lat1, lat2, lat2 - lat1, lon2 - lon1))
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


me = (39.9208, 32.8541)  # Kızılay
db = sqlite3.connect(":memory:")
db.create_function("mesafe_km", 4, haversine, deterministic=True)  # SQL'de kullanılabilsin
db.execute("CREATE TABLE eczane (ad TEXT, enlem REAL, boylam REAL)")
db.execute("CREATE INDEX eczane_konum ON eczane (enlem, boylam)")
rng = random.Random(3)
rows = [(f"E{i:04d}", me[0] + rng.uniform(-0.05, 0.05), me[1] + rng.uniform(-0.06, 0.06)) for i in range(2000)]
rows += [("KUZEY", me[0] + 0.0100, me[1]), ("DOĞU", me[0], me[1] + 0.0120)]  # 1,11 km kuzey; 1,02 km doğu
db.executemany("INSERT INTO eczane VALUES (?, ?, ?)", rows)


def nearest(radius_km, use_cos=True):  # örnekte yalnız iki işaretli noktaya bakılıyor
    dlat = radius_km / KM_PER_DEG
    dlon = radius_km / (KM_PER_DEG * math.cos(math.radians(me[0]))) if use_cos else dlat  # YANLIŞ: cos unutulursa
    return db.execute(
        "SELECT ad, round(mesafe_km(?, ?, enlem, boylam), 3) AS km FROM eczane "
        "WHERE enlem BETWEEN ? AND ? AND boylam BETWEEN ? AND ? AND ad IN ('KUZEY', 'DOĞU') ORDER BY km",
        (*me, me[0] - dlat, me[0] + dlat, me[1] - dlon, me[1] + dlon)).fetchall()


box = 1.2 / KM_PER_DEG, 1.2 / (KM_PER_DEG * math.cos(math.radians(me[0])))
inside = db.execute("SELECT COUNT(*) FROM eczane WHERE enlem BETWEEN ? AND ? AND boylam BETWEEN ? AND ?",
                    (me[0] - box[0], me[0] + box[0], me[1] - box[1], me[1] + box[1])).fetchone()[0]
print(f"2002 eczaneden sınır kutusuna giren: {inside}; mesafe yalnız onlar için hesaplanır")
print("doğru kutu (boylamda cos):", nearest(1.2))
print("cos unutulmuş kutu:        ", nearest(1.2, use_cos=False))
degree_pick = min((("KUZEY", 0.0100, 0.0), ("DOĞU", 0.0, 0.0120)), key=lambda p: math.hypot(p[1], p[2]))[0]
print("derece farkıyla 'en yakın':", degree_pick)
```

```cikti
2002 eczaneden sınır kutusuna giren: 108; mesafe yalnız onlar için hesaplanır
doğru kutu (boylamda cos): [('DOĞU', 1.023), ('KUZEY', 1.112)]
cos unutulmuş kutu:         [('KUZEY', 1.112)]
derece farkıyla 'en yakın': KUZEY
```

Üç ders: (1) kutu adayları 2.002'den 108'e indiriyor; (2) boylamda `cos` unutulursa kutu doğu-batıda dar kalır ve
gerçek en yakın nokta (DOĞU) **hiç görünmez**; (3) derece farkıyla sıralama yanlış noktayı seçer. Kutu yarıçapı
aranan yarıçapla aynı ya da biraz büyük olur; köşelerdeki adaylar kesin mesafeyle elenir. Yarıçap içinde sonuç
yoksa yarıçapı ikiye katlayıp yeniden sorun. Nokta sayısı milyonlara çıkarsa: ızgara hücresi anahtarı (ör. enlem ve
boylamı 0,01'e yuvarlayıp birleştirme) ya da noktaları 3B birim vektöre çevirip k-d ağacı
([`kd_tree.py`](../../algoritma/algoritma/veri_yapilari/kd_tree.py)); kiriş uzunluğu büyük daire mesafesiyle aynı
sırayı verir.

## Yön ve açı sarması

```python calistir
import math


def bearing(a, b):  # a'dan b'ye ilk yön (kuzeyden saat yönünde derece)
    p1, p2, dl = math.radians(a[0]), math.radians(b[0]), math.radians(b[1] - a[1])
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(x, y)) % 360


def angle_diff(a, b):  # b − a, −180 ile 180 arasına sarılmış
    return (b - a + 180) % 360 - 180


def mean_angle(angles):  # açıların ortalaması: birim vektörlerin ortalaması
    s = sum(math.sin(math.radians(x)) for x in angles)
    c = sum(math.cos(math.radians(x)) for x in angles)
    return round(math.degrees(math.atan2(s, c)), 6) % 360


def wrap_lon(lon):  # boylamı [−180, 180) aralığına getir
    return (lon + 180) % 360 - 180


print(f"Ankara → İstanbul ilk yön: {bearing((39.9208, 32.8541), (41.0082, 28.9784)):.0f}°")
print(f"359° ile 1° arası fark: düz {1 - 359}°, sarılmış {angle_diff(359, 1)}°")
print(f"350° ve 10° ortalaması: düz {(350 + 10) / 2:.0f}°, vektörle {mean_angle([350, 10]):.0f}°")
print(f"boylam 190° → {wrap_lon(190)}°, −181° → {wrap_lon(-181)}°")
assert angle_diff(359, 1) == 2 and round(mean_angle([350, 10])) % 360 == 0
```

```cikti
Ankara → İstanbul ilk yön: 291°
359° ile 1° arası fark: düz -358°, sarılmış 2°
350° ve 10° ortalaması: düz 180°, vektörle 0°
boylam 190° → -170°, −181° → 179°
```

Büyük daire üzerinde yön yol boyunca değişir; "ilk yön" yalnız başlangıçtaki açıdır. Python'un `%` işleci negatif
sayıda da 0–360 verir; JavaScript'inki vermez:

```js calistir
import assert from 'node:assert/strict'

assert.equal(-10 % 360, -10) // YANLIŞ beklenti: JavaScript'te % işareti bölünenden alır
const wrap360 = (x) => ((x % 360) + 360) % 360
const wrapLon = (lon) => wrap360(lon + 180) - 180
assert.equal(wrap360(-10), 350)
assert.equal(wrapLon(190), -170)
console.log('tamam')
```

```cikti
tamam
```

## Saklama, sıra ve duyarlık

| Konu | Kural |
| --- | --- |
| Sıra | Kodda ve tabloda adlı alan kullanın (`enlem`, `boylam`). GeoJSON ve birçok harita kütüphanesi **[boylam, enlem]** sırasını ister; Türkiye'de boylam (26–45) ile enlem (36–42) karışınca nokta Arap Yarımadası'na ya da Karadeniz'e düşer |
| Birim | Hesaptan önce radyana çevirin; derece ile radyan karışınca mesafeler saçmalaşır |
| Duyarlık (enlemde) | 2 ondalık ≈ 1,1 km; 3 ≈ 110 m; 4 ≈ 11 m; 5 ≈ 1,1 m; 6 ≈ 11 cm. Telefon konumunun gerçek doğruluğu çoğu zaman metrelerle onlarca metre arasıdır |
| Gizlilik | Hassas konum kişisel veridir: gerekmiyorsa 2–3 ondalığa indirerek saklayın; amaç ve süre aydınlatmada yazılı ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)) |
| Tür | `REAL` (çift duyarlık) yeterlidir; tamsayı mikro-derece (×10⁶) de olur, ama çevirmeyi tek yerde yapın |
| Doğrulama | Enlem −90…90, boylam −180…180; Türkiye uygulamasında kaba kutu (enlem 35–43, boylam 25–45) ile "yer değiştirmiş" girdiyi yakalayın |

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Doğu-batı mesafeleri %30 fazla | Dereceler düzlem sanılmış | Haversine ya da `cos(enlem)` ölçekli yaklaşım |
| Yakındaki şube aramada çıkmıyor | Sınır kutusunda boylam genişliği `cos` ile büyütülmemiş | Boylam yarı genişliği `r / (111,2 · cos(enlem))` |
| Nokta Karadeniz'in ortasında ya da Arap Yarımadası'nda | Enlem ve boylam yer değiştirmiş (GeoJSON sırası) | Adlı alanlar; Türkiye kutusu denetimi |
| Mesafeler devasa ya da sıfıra yakın | Derece/radyan karışıklığı | Hesap işlevinin girişinde radyana çevirin; birim testi |
| 359° ile 1° "çok farklı" | Açı sarması yok | `(b − a + 180) % 360 − 180` |
| Rüzgâr yönü ortalaması tersine dönük | Düz ortalama | Birim vektör ortalaması |
| JavaScript'te negatif açı | `%` işareti bölünenden alır | `((x % 360) + 360) % 360` |
| "En yakın" yanlış nokta | Derece farkıyla sıralama | Kesin mesafeyle sıralama |
| Ham enlem/boylamla k-d ağacı yanlış komşu veriyor | Eksenler aynı ölçekte değil | 3B birim vektörler ya da ölçekli koordinat |
| Testler geçiyor, kullanıcı şikâyetçi | Testte yalnız kuzey-güney örnek var | Doğu-batı ve uzun mesafe örneği ekleyin |

## Denetim listesi

- [ ] Koordinatlar adlı alanlarla (`enlem`, `boylam`) tutuluyor; dış biçime ([boylam, enlem]) çevirme tek işlevde.
- [ ] Mesafe haversine (ya da kısa mesafede eş-dikdörtgen) ile; derece farkı hiçbir yerde mesafe yerine kullanılmıyor.
- [ ] Yarıçap aramasında sınır kutusu dizinli sütunlarda; boylam genişliği `cos(enlem)` ile; sonuçlar kesin mesafeyle süzülüyor.
- [ ] Açı farkı ve ortalaması sarmayı hesaba katıyor; JavaScript'te `%` düzeltilmiş.
- [ ] Testlerde Türkiye'den doğu-batı ve kuzey-güney örnekleri (ör. Ankara–İstanbul ≈ 350 km) var.
- [ ] Girdi doğrulaması enlem/boylam aralığını ve yer değiştirmeyi yakalıyor.
- [ ] Konum duyarlığı amaca göre seçildi; gizlilik notu yazıldı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Mesafeyi haversine ile hesapla (R = 6371,0088 km). Koordinatlar `enlem`, `boylam` adlı alanlarda;
  GeoJSON'a çevirirken sıra [boylam, enlem]. Yarıçap aramasında önce sınır kutusu: enlemde `r/111,195`, boylamda
  `r/(111,195·cos(enlem))`; sonra kesin mesafeyle süz. Testte Ankara (39,9208; 32,8541) – İstanbul (41,0082; 28,9784)
  ≈ 349–351 km olmalı."
- **Modelin tipik hatası:** Öklid mesafesini derecelere uygular; sınır kutusunda boylamı enlemle aynı genişlikte
  alır; enlem/boylam sırasını karıştırır; `math.sin(derece)` yazar; açı ortalamasını düz ortalamayla alır;
  JavaScript'te `%` sonucunu düzeltmez.
- **Çıktıda denetleyin:** `radians` çağrıları; `cos` ile ölçeklenen boylam; koordinat sırası; Ankara–İstanbul testi.
- **Sorun:** "Bu hesap doğu-batı yönünde de doğru mu? Bir doğu-batı örneğiyle sınadın mı?"

## İlgili

- [Lineer cebir sezgisi](lineer-cebir-sezgisi.md) — vektör ve nokta çarpım (3B birim vektör yaklaşımı)
- [Sayılar ve kayan nokta](sayilar-ve-kayan-nokta.md) — karşılaştırma toleransı · [Sayısal yöntemler](sayisal-yontemler.md)
  — yinelemeli yöntemlerde durma ölçütü
- [Gizlilik ve anonimleştirme](../70-veri/gizlilik-ve-anonimlestirme.md) — konumla yeniden tanımlama riski
- [Tarayıcı API'leri](../20-web-onyuz/tarayici-apileri.md) — konum izni
- Havuz: k-d ağacı [`kd_tree.py`](../../algoritma/algoritma/veri_yapilari/kd_tree.py); çokgende nokta
  [`point_in_polygon.py`](../../algoritma/algoritma/geometri/point_in_polygon.py) (düzlem varsayımı uyarısıyla)
