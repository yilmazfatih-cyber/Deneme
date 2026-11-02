# Block Out — Unity sürümü

Telefondaki "Block Out!" tarzı renkli kapı bulmacasının Unity (C#) ile yazılmış, sanat dosyası gerektirmeyen
sürümü. Tahtadaki her blok, kendi rengindeki kapıya sürüklenerek çıkarılır; tüm bloklar süre dolmadan
çıkınca bölüm biter.

## Oyun kuralları

- Blok parmağı izler; başka bloğa veya duvara çarpınca durur.
- Blok kenara dayalıyken aynı renkteki kapıya doğru itilirse ve kapı bloğun tüm genişliğini kaplıyorsa çıkar.
- **Buzlu blok** (sayaçlı, açık mavi): sayaç kadar başka blok çıkmadan hareket eder ama çıkamaz.
- **Geri al**: son hamleyi geri alır (50 hamleye kadar).
- **Çekiç**: seçilen bloğu kırar; her 3 bölümde bir çekiç kazanılır.
- **Süre doldu**: tekrar dene veya +30 saniye.
- 12 elle tasarlanmış bölüm (`Assets/Resources/levels.txt`); sonrası tohuma bağlı üretilir ve çözülebilirliği
  `Solver` ile denetlenir. İlerleme `PlayerPrefs` ile telefonda saklanır.

## Açma (Unity Hub)

1. Unity Hub'a **minik-usta-unity** hesabıyla giriş yapın.
2. Unity **2022.3 LTS veya 6000 (Unity 6)** kurulu olsun; kurulumda **Android Build Support**
   (OpenJDK + SDK/NDK dahil) modülünü işaretleyin.
3. Hub > Projects > **Add** ile bu klasörü (`unity/BlockOut`) seçin ve açın. Sürüm farklıysa Hub'ın önerdiği
   sürümle açmayı kabul edin.
4. İlk açılışta `Assets/Editor/ProjectSetup.cs` kendiliğinden `Assets/Scenes/Main.unity` sahnesini oluşturur,
   Build Settings'e ekler ve oyuncu ayarlarını (dikey ekran, `com.minikusta.blockout`) yapar.
   Olmadıysa menüden **Block Out > Projeyi hazırla** seçin.
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
| `Assets/Scripts/Game/GameBootstrap.cs` | Kamera, ışık ve tüm bileşenleri kodla kurar |
| `Assets/Scripts/Game/BoardView.cs` | Zemin, kapılar, bloklar; kamerayı dikey ekrana sığdırır |
| `Assets/Scripts/Game/BlockView.cs` | Blok küpleri, buz katmanı, kayma ve çıkış animasyonu |
| `Assets/Scripts/Game/InputController.cs` | Dokunma/fare ile sürükleme |
| `Assets/Scripts/Game/GameManager.cs` | Bölüm akışı, süre, geri al, çekiç, kayıt |
| `Assets/Scripts/Game/UIController.cs` | Kodla kurulan arayüz (üst/alt çubuk, sonuç panelleri) |
| `Assets/Editor/ProjectSetup.cs` | Sahne/ayar kurulumu ve APK derleme menüsü |

## Yeni bölüm ekleme

`Assets/Resources/levels.txt` dosyasına aynı biçimde bir `level:` bloğu ekleyin. Haritada satır 0 üsttür;
harfler blokları, `#` duvarı gösterir. `gates:` satırında kenar (U/D/L/R), başlangıç, uzunluk ve renk verilir.
Bölümün çözülebilir olduğundan emin olmak için `Solver.Solve(level)` çağrısı -1 dönmemelidir.
