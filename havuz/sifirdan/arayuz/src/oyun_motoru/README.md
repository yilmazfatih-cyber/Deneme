# oyun_motoru — 2B oyun çekirdeği (Canvas)

## Ne yapar

Küçük bir 2B oyun motoru: sabit zaman adımlı döngü (+ ara değerleme), varlık-bileşen-sistem (ECS), eylem
tabanlı girdi (klavye / dokunmatik düğme / oyun kolu), AABB ve daire çarpışması, uzamsal karma ile geniş
evre, basit fizik (hız, sürtünme, sekme), karo haritası, kamera, parçacıklar, programla çizilen hareketli
resimler, sahne yığını, ses sarmalayıcısı ve **belirlenimci tekrar oynatma**. Özgün örnek oyun: **Damla**.

**Damla'nın kuralları.** Bir su damlası mağarada dolaşır. Tüm **tohumları** (yeşil) toplayınca **kaynak**
açılır; damla kaynağa ulaşınca kazanır. Sekerek dolaşan **korlar** (turuncu) damlayı buharlaştırır: can
azalır, kısa bir süre dokunulmazlık gelir. **Yağmur damlaları** (mavi) can verir. Can biterse oyun biter.
Hepsi kodla çizilir; görsel ya da ses dosyası yoktur.

## Nasıl çalışır

```
 requestAnimationFrame ─► FixedLoop.advance(geçen süre)
                             │ birikim ≥ adım oldukça:  InputState.sample() ─► kare (bit maskesi)
                             │                          DropletGame.tick(kare)  ← yalnız bu ikisi oyunu sürer
                             │                             ├ oyuncu: ivme, zıplama (tampon + "coyote" süresi)
                             │                             ├ TileMap.moveBox (eksen eksen çarpışma)
                             │                             ├ korlar: daire-karo sekmesi
                             │                             ├ SpatialHash.pairs → dar evre → kurallar
                             │                             └ world.flush() (ertelenmiş silmeler)
                             └ render(alpha)  ─► DropletRenderer: önceki/şimdiki konum arası ara değerleme
```

**Sabit adım (`loop.ts`).** Fizik hep 1/60 s adımla ilerler; ekranın kare hızından bağımsızdır. Artan süre
`alpha` (0..1) olarak çizime gider. Sekme arka planda kalıp dönünce gelen dev süre `maxFrame` (0,25 s) ile
kırpılır; yoksa yetişmek için binlerce adım atılırdı ("ölüm sarmalı").

**ECS (`ecs.ts`).** Varlık bir numaradır; bileşenler türlü depolarda (`Map`) durur; sistemler düz
işlevlerdir. Silme `flush()`'a ertelenir: dolaşırken silmek güvenlidir. Depolar ekleme sırasını korur;
dolaşma sırası belirlenimcidir.

**Girdi (`input.ts`).** Oyun tuşları değil **eylemleri** okur (`left`, `right`, `jump`). Her kaynak
(klavye, dokunma, kol) eylemi ayrı tutar; biri basılıysa eylem basılıdır. Her fizik adımında bir kare
alınır: basılı eylemlerin bit maskesi + yeni basılan/bırakılanlar. Adım içinde basılıp bırakılan kısa dokunuş
kaybolmaz.

**Çarpışma.** Dar evre (`collision.ts`): kutu-kutu, daire-daire, daire-kutu; sonuç itme normali ve
derinliktir. Geniş evre (`spatial_hash.ts`): dünya hücrelere bölünür, yalnız hücre paylaşan çiftler sınanır
(test: kaba kuvvetle bulunan her çakışma aday listesinde). Karo çarpışması (`tilemap.ts`) eksen eksen yapılır
ve hızlı harekette adımlara bölünür (duvardan geçme yok).

**Fizik (`physics.ts`).** Yarı örtük Euler (önce hız, sonra konum), hıza orantılı sönüm, sekme
(`restitution`). Serbest düşüş testi kapalı formülle karşılaştırılır.

**Belirlenimcilik (`replay.ts`, `rng.ts`).** Oyun mantığı yalnız `(tohum, adım başına girdi maskesi)` ile
ilerler; rastgelelik tohumlu `Rng`'den gelir. Görsel rastgelelik (parçacık, sarsıntı) **ayrı** bir RNG
kullanır: çizim kapatılsa da mantık değişmez. Durum özeti (FNV-1a) sayıların 64 bit ham baytlarından
hesaplanır. Testler: aynı kayıt → aynı özet; tek karelik fark → farklı özet; canlı oyun = kayıttan oynatma.

## Dosya haritası

| Dosya               | Sorumluluk                                                         |
| ------------------- | ------------------------------------------------------------------ |
| `loop.ts`           | Sabit adımlı döngü, ara değerleme, uzun kare kırpma                |
| `ecs.ts`            | Varlık, bileşen deposu, sorgu, ertelenmiş silme                    |
| `input.ts`          | Eylem haritası, girdi karesi, klavye/dokunma/kol bağlayıcıları     |
| `collision.ts`      | AABB ve daire sınamaları (manifold)                                |
| `spatial_hash.ts`   | Uzamsal karma (geniş evre)                                         |
| `physics.ts`        | Tümlev, sönüm, sekme                                               |
| `tilemap.ts`        | Karo haritası, satırlardan kurma, kutu hareketi                    |
| `camera.ts`         | İzleme, sınır, sarsıntı, dünya↔ekran                               |
| `particles.ts`      | Sabit kapasiteli parçacık havuzu                                   |
| `sprite.ts`         | Kare animasyonu, programla kare üretme                             |
| `scene.ts`          | Sahne yığını                                                       |
| `audio.ts`          | Web Audio ile programla ses                                        |
| `replay.ts`         | Kayıt, kayıt doğrulama, durum özeti                                |
| `rng.ts`            | Tohumlu rastgele sayı üreteci                                      |
| `game/level.ts`     | Damla bölümü (karakterlerle harita)                                |
| `game/droplet.ts`   | Damla oyun mantığı (başsız)                                        |
| `game/render.ts`    | Damla çizimi (Canvas)                                              |

## Sınırlar

- Belirlenimcilik **aynı JS motorunda** garanti edilir. Mantık yalnız dört işlem ve karekök kullanır, ama
  korların başlangıç yönü ve parçacıklar `Math.sin/cos` ile hesaplanır: farklı tarayıcı motorları arasında
  bit bit aynılık doğrulanmadı.
- Fizik basittir: dönme, kütle, eklem, sürekli çarpışma algılama yoktur.
- Karo haritası tek katmandır; eğimli karo ve tek yönlü platform yoktur.
- Ses yalnız programla üretilen tonlardır; ses dosyası çalma yoktur.
- Damla tek bölümlüdür; bölümün baştan sona oynanabilirliği elle denendi, testle kanıtlanmadı.

## Buradan nereye

- Yeni bölüm: `game/level.ts`'e aynı biçimde satırlar; kural testi boyutları ve kenarları denetler.
- Yeni varlık (ör. hareketli platform): `Kind`'e üye + `spawn` + `touch` + `render.ts`'te çizim.
- Kayıt paylaşma: `Recorder.toJSON()` çıktısını indirip `parseRecording` ile yükleyen "tekrar izle" düğmesi.
- Oyun kolu titreşimi, dokunmatik joystick, ekran boyuna göre değişen kamera yakınlaştırması.
