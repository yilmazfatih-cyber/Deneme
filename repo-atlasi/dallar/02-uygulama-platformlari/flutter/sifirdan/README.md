# Mini Flutter — sıfırdan (JavaScript ile, ASCII ekrana)

Bu ortamda Dart/Flutter SDK yok; bu yüzden Flutter **çerçevesinin** (framework) çekirdek fikirlerini saf
JavaScript ile, karakter hücrelerinden oluşan bir ASCII "ekrana" çizerek kuruyoruz. Amaç piksel değil, mekanizma:

1. **Kutu kısıtları:** "kısıtlar aşağı iner, boyutlar yukarı çıkar, konumu ebeveyn belirler".
2. **Render ağacı:** yerleşim, boyama, isabet testi; yalnızca kirli düğümlerin yeniden yerleşmesi.
3. **Üç ağaç:** Widget (tarif) → Element (kalıcı örnek, State'in evi) → RenderObject (ağır iş).
4. **Kare döngüsü:** `setState` → `markNeedsBuild` → `BuildOwner` → `buildScope` → `flushLayout` → `flushPaint`.

Kod özgündür; Flutter'dan kopyalanmamıştır. Sınıf adları kasıtlı olarak Flutter'dakiyle aynıdır, böylece aşağıdaki
"Dart'ta yeniden yaz" bölümüyle gerçek API'ye geçiş kolaylaşır.

## Gereksinimler

- Node.js 22 veya üstü, yalnızca yerleşik modüller. Paket kurulumu ve internet gerekmez.

## Çalıştırma

```bash
cd repo-atlasi/dallar/02-uygulama-platformlari/flutter/sifirdan
node ornek_sayac.js   # sayaç uygulaması: ilk kare, +1 düğmesine dokunma, ikinci kare
node --test           # 15 test (altın görüntü testi dahil)
```

Çıktı:

```text
+----------------------+
|     Mini Flutter     |
|      Basılma: 0      |
|                      |
|                +----+|
|                | +1 ||
|                +----+|
+----------------------+
```

## Aşamalar

| Aşama | Dosya                      | İçerik                                                                                                                                                                                                                |
| ----- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_kisitlar.js`       | `Size`, `Offset`, `EdgeInsets`, `BoxConstraints` (`tight`, `loose`, `constrain`, `deflate`, `loosen`, `enforce`)                                                                                                      |
| 2     | `asama2_render.js`         | `RenderObject`, `RenderBox`, `PipelineOwner`, `RenderView`, `RenderPadding`, `RenderConstrainedBox`, `RenderColoredBox`, `RenderParagraph`, `RenderFlex`, `RenderPositionedBox`, `RenderPointerListener`, ASCII tuval |
| 3     | `asama3_widget_element.js` | `Widget`, `StatelessWidget`, `StatefulWidget`, `State`, `InheritedWidget`, `ParentDataWidget`, Element sınıfları, `updateChild`, `updateChildren`, somut widget'lar                                                   |
| 4     | `asama4_build_owner.js`    | `BuildOwner` (`scheduleBuildFor`, `buildScope`, `finalizeTree`), `Binding` (`runApp`, `drawFrame`), `pumpWidget` test yardımcısı                                                                                      |
| —     | `ornek_sayac.js`           | Sayaç uygulaması                                                                                                                                                                                                      |
| —     | `test/*.test.js`           | Kısıt, render ve widget testleri                                                                                                                                                                                      |

### Aşama 1 — Kısıtlar

Ebeveyn çocuğa bir aralık verir (`BoxConstraints`); çocuk aralık içinde bir boyut seçer. Sıkı kısıt (`min == max`)
pazarlık bırakmaz: kök ekran boyutunu sıkı verir, bu yüzden en üstteki widget ekranı doldurmak zorundadır.
`SizedBox(width: 50)` ebeveyn 20 diyorsa 20 olur (`enforce`). `Center` kısıtı gevşetir (`loosen`), çocuk küçük kalabilir.

### Aşama 2 — Render ağacı

- `layout(kisit, { parentUsesSize })`: kısıt aynı ve düğüm temizse **erken çıkar**.
- Düğüm "yerleşim sınırı" ise (`!parentUsesSize || kısıt sıkı || kök`) değişikliği ebeveyne yayılmaz;
  `PipelineOwner.flushLayout` yalnızca kirli sınırları derinlik sırasıyla yeniden yerleştirir.
- `RenderFlex` iki geçişlidir: önce esnek olmayan çocuklar sınırsız ana eksenle ölçülür, kalan alan `flex` oranında
  bölünür. Ana eksen sınırsızken `Expanded` kullanmak Flutter'daki ünlü hatayı verir; taşma ASCII'de `!` şeridiyle
  görünür (Flutter'da sarı-siyah şerit).
- İsabet testi aşağıdan yukarı bir yol üretir; en derindeki `onTap` kazanır.

### Aşama 3 — Widget, Element, State

`Element.updateChild` dört durumu ele alır: widget yok → kaldır; çocuk yok → şişir; `canUpdate` (aynı tür + aynı key) →
güncelle; değilse → değiştir. State, Element'in içinde yaşadığı için üst widget her build'de yeni nesne üretse bile
korunur. Çoklu çocukta `updateChildren` baştan ve sondan eşleşenleri günceller, ortadakileri key ile eşler.
Testler hem doğru kullanımı (key ile sıralama) hem klasik tuzağı (key'siz listede State'in konumda kalması) gösterir.

### Aşama 4 — Kare döngüsü

`setState(fn)` durumu değiştirir ve `markNeedsBuild` çağırır; `BuildOwner` Element'i kirli listeye ekleyip kare ister.
`drawFrame` sırası: `buildScope` (kirlileri sığdan derine build et) → `flushLayout` → `flushPaint` → `finalizeTree`
(ağaçtan düşen Element'leri sök, `State.dispose` çağır).

## Eşleme tablosu

| Mini'deki parça                                                            | Gerçek depodaki karşılığı (dosya yolu)                                                                                               | Fark                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `BoxConstraints`, `Size`, `Offset`                                         | `packages/flutter/lib/src/rendering/box.dart`; `engine/src/flutter/lib/ui/geometry.dart` (`dart:ui`)                                 | Gerçekte `double` ve mantıksal piksel; biz tamsayı karakter hücresi                               |
| `RenderObject.layout`, `markNeedsLayout`                                   | `packages/flutter/lib/src/rendering/object.dart`                                                                                     | Gerçekte `sizedByParent`/`performResize`, hata ayıklama denetimleri, semantik ağaç                |
| `PipelineOwner.flushLayout/flushPaint`                                     | Aynı dosyada `PipelineOwner`                                                                                                         | Gerçekte `flushCompositingBits`, `flushSemantics`, boyama sınırları ve katman ağacı               |
| `RenderFlex`                                                               | `packages/flutter/lib/src/rendering/flex.dart`                                                                                       | Gerçekte `Flexible(fit: loose)`, `mainAxisSize.min`, baseline hizalama, metin yönü                |
| Taşma `!` şeridi                                                           | `packages/flutter/lib/src/rendering/debug_overflow_indicator.dart`                                                                   | Gerçekte yalnızca hata ayıklama modunda, sarı-siyah desen + konsol uyarısı                        |
| `RenderPadding`, `RenderPositionedBox`                                     | `packages/flutter/lib/src/rendering/shifted_box.dart`                                                                                | Gerçekte `Alignment`, `widthFactor/heightFactor`                                                  |
| `RenderConstrainedBox`, `RenderPointerListener`                            | `packages/flutter/lib/src/rendering/proxy_box.dart`                                                                                  | Gerçekte işaretçi olayları (down/move/up) ve hit test davranışı seçenekleri                       |
| `RenderParagraph`                                                          | `packages/flutter/lib/src/rendering/paragraph.dart`                                                                                  | Gerçekte metin motoru (`engine/src/flutter/txt`, `lib/ui/text.dart`), seçim, satır içi widget'lar |
| `Widget.canUpdate`, `Element.updateChild`                                  | `packages/flutter/lib/src/widgets/framework.dart`                                                                                    | Gerçekte `GlobalKey` ile ağaçta taşıma, sıcak yeniden yükleme (hot reload) denetimleri            |
| `updateChildren`                                                           | Aynı dosyada `Element.updateChildren` (~4145. satır)                                                                                 | Gerçekte `IndexedSlot` ve adım adım `move/insert/removeRenderObjectChild`                         |
| `State.setState`, `StatefulElement`                                        | Aynı dosya                                                                                                                           | Gerçekte `didChangeDependencies`, `deactivate`/`activate`, `reassemble`                           |
| `InheritedWidget`, `dependOnInheritedWidgetOfExactType`                    | Aynı dosyada `InheritedElement`                                                                                                      | Gerçekte `InheritedModel` (yön bazlı bağımlılık) ve `didChangeDependencies`                       |
| `BuildOwner.buildScope/finalizeTree`                                       | Aynı dosyada `BuildOwner`                                                                                                            | Gerçekte `BuildScope` nesneleri, `GlobalKey` kaydı, hata yakalama                                 |
| `Binding.drawFrame`                                                        | `packages/flutter/lib/src/widgets/binding.dart` (`WidgetsBinding.drawFrame`), `rendering/binding.dart` (`RendererBinding.drawFrame`) | Gerçekte motor `onBeginFrame/onDrawFrame` ile vsync'te çağırır (`scheduler/binding.dart`)         |
| `Text` → `RichText`                                                        | `packages/flutter/lib/src/widgets/text.dart`, `widgets/basic.dart`                                                                   | Gerçek `RichText` bir `MultiChildRenderObjectWidget`'tır (satır içi widget'lar için)              |
| `Row`, `Column`, `Expanded`, `Padding`, `SizedBox`, `Center`, `ColoredBox` | `packages/flutter/lib/src/widgets/basic.dart`                                                                                        | `Center` gerçekte `Align`'ın alt sınıfı; `Expanded` gerçekte `Flexible`'ın                        |
| `GestureDetector`                                                          | `packages/flutter/lib/src/widgets/gesture_detector.dart`                                                                             | Gerçekte jest arenası (`packages/flutter/lib/src/gestures`), çift dokunma, sürükleme              |
| `pumpWidget`, `pump`, `dokun`                                              | `packages/flutter_test/lib/src/widget_tester.dart`                                                                                   | Gerçekte sahte zaman, `find.byType`, `tester.tap(finder)`                                         |
| Altın görüntü testi                                                        | `packages/flutter_test/lib/src/matchers.dart` (`matchesGoldenFile`), `goldens.dart` (`GoldenFileComparator`)                         | Gerçekte PNG karşılaştırması                                                                      |
| `Cerceve`                                                                  | Karşılığı yok: `Container` + `BoxDecoration(border: …)`                                                                              | Mini'ye özel kolaylık                                                                             |

## Dart'ta yeniden yaz

Bu klasörü bitirdikten sonra aynı uygulamayı gerçek Flutter'da yaz (Flutter SDK kurulu bir makinede
`flutter create sayac` ile). Mini'deki her sınıfın Dart karşılığı aynı adı taşır. Sayaç sayfasının Dart hâli:

```dart
import 'package:flutter/material.dart';

void main() => runApp(const MaterialApp(home: SayacSayfasi(baslik: 'Mini Flutter')));

class SayacSayfasi extends StatefulWidget {
  const SayacSayfasi({super.key, required this.baslik});
  final String baslik;

  @override
  State<SayacSayfasi> createState() => _SayacDurumu();
}

class _SayacDurumu extends State<SayacSayfasi> {
  int _deger = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(widget.baslik),
        Expanded(child: Center(child: Text('Basılma: $_deger'))),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            GestureDetector(
              onTap: () => setState(() => _deger++),
              child: const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('+1')),
            ),
          ],
        ),
      ],
    );
  }
}
```

Dart'a geçerken dikkat: (1) Dart'ta `const` widget'lar derleme zamanında tekildir; mini'deki "aynı nesne alt ağacı
build ettirmez" testi tam bunu gösterir. (2) State sınıfı genelde `_` ile başlar (kütüphaneye özel). (3) Testleri
`flutter_test` ile yaz: `testWidgets('...', (tester) async { await tester.pumpWidget(...); await tester.tap(find.text('+1')); await tester.pump(); })`.

## Gerçek ölçeğe giden yol

1. Boyama sınırları ve katman ağacı: yalnızca değişen bölgeyi yeniden boya (`RepaintBoundary`).
2. Sahte zamanlı zamanlayıcı ve animasyon: `Ticker`, `AnimationController`, örtük animasyonlar.
3. Kaydırma: `Viewport` ve sliver protokolü (`SliverConstraints`); burada yalnızca kutu protokolü var.
4. Jest arenası: birden çok tanıyıcının bir dokunma için yarışması.
5. Erişilebilirlik ağacı (semantics) ve metin girişi.
6. Motor tarafı: katman ağacını GPU'ya çizen Impeller/Skia, platform gömücüleri (Android, iOS, masaüstü, web).
