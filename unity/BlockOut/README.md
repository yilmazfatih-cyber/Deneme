# Block Out — Unity sürümü

Telefondaki "Block Out!" tarzı renkli kapı bulmacasının Unity (C#) ile **tamamen kodla** yazılmış sürümü.
Sanat dosyası, prefab, elle kurulmuş sahne veya editörde tıklama gerektirmez: kamera, ışık, tahta, bloklar,
sesler, menüler ve arayüz çalışma anında kod tarafından üretilir. Tahtadaki her blok kendi rengindeki kapıya
sürüklenerek çıkarılır; tüm bloklar süre dolmadan çıkınca bölüm biter.

## Ekranlar ve kurallar

- **Ana menü:** Oyna / Devam et, Bölümler, Ses ve Titreşim ayarı (telefonda saklanır).
- **Bölüm seçme:** 24 bölüm kutusu; açılmış olanlar renkli, sıradaki turuncu, kilitli olanlar gri.
- **Oyun:** blok parmağı izler; başka bloğa veya duvara çarpınca durur. Blok kenara dayalıyken aynı renkteki
  kapıya doğru itilirse ve kapı bloğun tüm genişliğini kaplıyorsa çıkar.
- **Buzlu blok** (sayaçlı, açık mavi): sayaç kadar başka blok çıkmadan hareket eder ama çıkamaz.
- **Geri al** (50 hamleye kadar), **Çekiç** (bloğu kırar; her 3 bölümde bir kazanılır), **Yenile**, **Menü**.
- **Süre doldu:** Tekrar dene, +30 saniye veya Menü. Kırmızı çarpı veya suçlayıcı metin yok.
- **Sesler:** dosya yok; tık, kayma, çıkış, buz çözülme, kazanma ve süre dolma sesleri sinüs dalgasından üretilir.
- 12 elle tasarlanmış bölüm (`Assets/Resources/levels.txt`), hepsi `Tools/validate_levels.py` ile çözülebilirliği
  doğrulanmış; sonrası tohuma bağlı üretilir ve `Solver` ile denetlenir. İlerleme `PlayerPrefs` ile saklanır.
- Android geri tuşu: oyundayken menüye döner, menüdeyken çıkar.

## Açma (Unity Hub)

1. Unity Hub'a **minik-usta-unity** hesabıyla giriş yapın.
2. Unity **2022.3 LTS veya Unity 6 (6000.x)** kurulu olsun; kurulumda **Android Build Support**
   (OpenJDK + SDK/NDK dahil) modülünü işaretleyin.
3. Hub > Projects > **Add** ile bu klasörü (`unity/BlockOut`) seçip açın. Sürüm farklıysa Hub'ın önerdiği
   sürümle açmayı kabul edin.
4. Sahne (`Assets/Scenes/Main.unity`) ve Build Settings depoda hazırdır. İlk açılışta `Assets/Editor/ProjectSetup.cs`
   oyuncu ayarlarını (dikey ekran, `com.minikusta.blockout`) bir kez uygular; gerekirse menüden
   **Block Out > Projeyi hazırla** ile tekrarlanır.
5. **Play** ile editörde oynayın (Game penceresini 1080×1920 dikey yapın).

## Telefona kurma (Redmi)

1. Telefonda Geliştirici seçenekleri > **USB hata ayıklama** açın, kabloyla bağlayın.
2. Unity'de **Block Out > Android APK derle**: `Builds/BlockOut.apk` üretilir.
3. APK'yı telefona kopyalayıp kurun (bilinmeyen kaynaklara izin verin) ya da
   File > Build Settings > Android > **Build And Run** ile doğrudan yükleyin.

## Kod haritası

| Dosya | Görev |
| --- | --- |
| `Assets/Scripts/Core/Board.cs` | Kurallar: kaydırma, kapıdan çıkma, buz sayacı, klonlama (geri al) |
| `Assets/Scripts/Core/LevelParser.cs` | `levels.txt` biçimini okur |
| `Assets/Scripts/Core/Solver.cs` | En iyi-önce arama ile çözülebilirlik denetimi |
| `Assets/Scripts/Core/LevelGenerator.cs` | 12. bölümden sonra sonsuz bölüm üretimi |
| `Assets/Scripts/Game/GameBootstrap.cs` | Kamera, ışık ve tüm bileşenleri kodla kurar (sahnedeki tek nesne) |
| `Assets/Scripts/Game/BoardView.cs` | Zemin, kapılar, bloklar; kamerayı dikey ekrana sığdırır |
| `Assets/Scripts/Game/BlockView.cs` | Blok küpleri, buz katmanı, kayma ve çıkış animasyonu |
| `Assets/Scripts/Game/InputController.cs` | Dokunma/fare ile sürükleme, çekiç dokunuşu |
| `Assets/Scripts/Game/GameManager.cs` | Menü/oyun akışı, süre, geri al, çekiç, kayıt |
| `Assets/Scripts/Game/UIController.cs` | Oyun içi arayüz (üst/alt çubuk, sonuç panelleri) |
| `Assets/Scripts/Game/MenuController.cs` | Ana menü ve bölüm seçme ekranı |
| `Assets/Scripts/Game/Sfx.cs` | Kodla üretilen ses efektleri ve titreşim |
| `Assets/Editor/ProjectSetup.cs` | Oyuncu ayarları ve APK derleme menüsü |
| `Tools/validate_levels.py` | Bölüm dosyasını çözerek doğrular (Unity gerekmez) |

## Yeni bölüm ekleme

`Assets/Resources/levels.txt` dosyasına aynı biçimde bir `level:` bloğu ekleyin. Haritada satır 0 üsttür;
harfler blokları, `#` duvarı gösterir. `gates:` satırında kenar (U/D/L/R), başlangıç, uzunluk ve renk verilir.
Sonra çalıştırın:

```bash
python3 Tools/validate_levels.py Assets/Resources/levels.txt
```

Her bölüm için adım sayısı yazılmalı; `UNSOLVABLE` çıkan bölüm düzeltilmeden oyuna girmemelidir.

## Doğrulama notu

Kod, UnityEngine taslak sınıflarına karşı Mono C# derleyicisiyle derlenmiş, sahne ve ayar dosyaları YAML olarak
doğrulanmıştır. Gerçek Unity derlemesi ve telefon testi ilk açılışta sizin tarafınızda yapılır.
