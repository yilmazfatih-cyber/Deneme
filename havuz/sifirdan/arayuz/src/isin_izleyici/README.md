# isin_izleyici — ışın izleyici

## Ne yapar

Fotoğraf gerçekçiliğine yaklaşan görüntüleri "ışığı geriye doğru izleyerek" üretir: kameradan her piksele bir
ışın atılır, ışının çarptığı yüzeyde ışıklar, gölgeler, yansımalar ve cam içinden kırılma hesaplanır.
Küre/düzlem/üçgen, Lambert + Phong aydınlatma, sert gölge (saydam cisim kısmen geçirir), ayna yansıması,
Fresnel'li kırılma, tabakalı kenar yumuşatma, BVH hızlandırması, gama düzeltme; çıktı PPM ve **sıfırdan
yazılmış** PNG. Tarayıcıda Web Worker ile aşamalı çizilir.

```ts
import { exampleScene, render, encodePng } from './index.ts'

const resim = render(exampleScene(), { width: 320, height: 200, samples: 2, seed: 1 })
const png = await encodePng(resim) // Uint8Array — diske yazılabilir ya da Blob yapılabilir
```

## Nasıl çalışır

```
piksel (x,y) ─► n×n alt örnek (tabakalı titreşim, tohumlu)
                 └► kameradan ışın ─► scene.closest(ışın)  ── BVH (küre, üçgen) + düzlemler
                                        └► shade.trace:
                                           ortam + Σ ışık [gölge ışını? → Lambert(N·L) + Phong(R·V)^p]
                                           + yansıma (ayna)           ─► özyineleme (derinlik ≤ 5)
                                           + kırılma (cam, Fresnel)   ─►
                 ortalama (doğrusal uzayda) ─► sRGB gama ─► 0..255
```

**Kesişimler (`geometry.ts`).** Küre: ikinci derece denklem (ışın yönü birim olduğundan sadeleşmiş).
Düzlem: tek bölme. Üçgen: Möller–Trumbore (ağırlık merkezi koordinatları). Tüm işlevler en yakın pozitif
uzaklığı verir; `EPS`, yüzeyden çıkan ışının kendi yüzeyine çarpmasını önler.

**Aydınlatma (`shade.ts`).** Lambert dağınık ışığı (N·L), Phong parlak noktayı ((R·V)^parlaklık) verir.
Gölge için noktadan ışığa ikinci bir ışın atılır. Camda yansıma/kırılma oranı **Schlick** yaklaşımıdır: dik
bakışta ~%4 yansıma, yalayarak bakışta neredeyse tam ayna. Işın camın içinden çıkarken normal ters çevrilir,
indisler yer değiştirir; **tam iç yansımada** (`refract` → `undefined`) yalnız yansıma kalır.

**BVH (`bvh.ts`).** Şekiller medyan bölmeyle iç içe kutulara yerleşir (yaprakta ≤ 4). Işın bir kutuyu
ıskalarsa içindekilere bakılmaz. Test: 300 şekil, 200 rastgele ışın — sonuç kaba kuvvetle **aynı**, sınanan
şekil sayısı en az 5 kat az. Düzlemler sonsuz olduğundan ayrı listede.

**Kenar yumuşatma ve gama (`render.ts`, `image.ts`).** Piksel n×n hücreye bölünür, her hücrede tohumlu
rastgele bir nokta seçilir (belirlenimci). Örnekler doğrusal uzayda ortalanır, sonra sRGB eğrisi uygulanır.
Gama uygulanmazsa görüntü karanlık ve sert görünür.

**PNG kodlayıcı (`png.ts`).** İmza + `IHDR` + `IDAT` + `IEND`; her parça CRC-32 taşır. Satırlar beş
süzgeçten (Yok, Sol, Üst, Ortalama, Paeth) "en küçük mutlak toplam" sezgisiyle seçilenle kodlanır.
Sıkıştırma: `CompressionStream('deflate')` (zlib biçimi; tarayıcı ve Node 18+) ya da tamamen elle yazılmış
sıkıştırmasız "stored" bloklar + Adler-32. Testte **bağımsız bir çözücü** (Node `zlib` + elle süzgeç geri
alma) her iki çıktıyı açıp özgün piksellerle karşılaştırır.

**Aşamalı çizim (`worker.ts`).** İşçi önce her 8×8 bloğa tek ışın atar (görüntü hemen belirir), sonra
ortadan dışa 32×32 karoları tam örnekle çizer; her parça bayt dizisi aktarılarak (kopyasız) gönderilir.

**Ölçüm (bilgi için, kesin değil).** Bu geliştirme makinesinde (paylaşımlı, Node 22) örnek sahne
320×200, piksel başına 4 örnekle ~1,5 s sürdü (`render` çağrısının süresi, `performance.now()` ile).

## Dosya haritası

| Dosya              | Sorumluluk                                               |
| ------------------ | -------------------------------------------------------- |
| `vec.ts`           | Vektör işlemleri, yansıma, kırılma, Schlick              |
| `geometry.ts`      | Işın, şekiller, kesişimler, normaller                    |
| `material.ts`      | Malzeme özellikleri, dama deseni                         |
| `bvh.ts`           | Sınırlayıcı hacim hiyerarşisi, kutu sınaması             |
| `scene.ts`         | Sahne, kamera (look-at), en yakın kesişim                |
| `shade.ts`         | Whitted ışın izleme: aydınlatma, gölge, yansıma, kırılma |
| `render.ts`        | Piksel/karo çizimi, tabakalı kenar yumuşatma             |
| `image.ts`         | sRGB gama, PPM, piksel özeti                             |
| `png.ts`           | CRC-32, Adler-32, zlib "stored", süzgeçler, PNG          |
| `example_scene.ts` | Gösterim ve test sahnesi                                 |
| `worker.ts`        | Web Worker: kaba + ince geçişli aşamalı çizim            |

## Sınırlar

- Whitted modelidir: dolaylı aydınlatma (renk taşması), yumuşak gölge, alan ışığı, alan derinliği yoktur.
- Doku (resim) eşleme, ton eşleme (HDR) ve hareket bulanıklığı yoktur.
- Piksel özeti testi aynı JS motoruna dayanır; `Math.pow` farklı motorlarda son basamakta farklı sonuç
  verirse özet değişebilir (bu makinede ve bu Node sürümünde sabit).
- Tek işçi kullanılır; çok çekirdeğe dağıtılmaz.

## Buradan nereye

- Yol izleme (path tracing): yansıma yönünü yarım küreden rastgele örnekleyip çok sayıda geçişi ortalamak.
- Birden çok işçi: karo listesini `navigator.hardwareConcurrency` kadar işçiye bölmek.
- OBJ dosyası okuyucu (üçgen ağları) + BVH için SAH bölme.
- Ton eşleme (ACES) ve pozlama ayarı.
