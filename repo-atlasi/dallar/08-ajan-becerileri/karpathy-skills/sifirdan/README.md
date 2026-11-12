# Cerrahi değişiklik puanlayıcı — bir CLAUDE.md işe yarıyor mu?

andrej-karpathy-skills deposunun README'si ilkelerin işe yarayıp yaramadığını anlamak için gözlenebilir ölçütler
verir: diff'lerde daha az gereksiz değişiklik, aşırı karmaşıklık yüzünden daha az yeniden yazım, hatadan sonra değil
uygulamadan önce gelen sorular. Bu mini ilk ölçütü sayıya döker: bir `git diff` çıktısını okur, "gereğinden fazla
dokunma" işaretlerini bulur ve 0–100 arası bir puan verir. Yanında dört ilkeyi gözlenebilir sorulara çeviren bir
[kontrol listesi](ilkeler-kontrol-listesi.md) var.

## Gereksinimler

Python 3.10+; yalnızca standart kütüphane (`difflib`, `fnmatch`, `re`, `json`, `argparse`).

## Çalıştırma

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/karpathy-skills/sifirdan
python3 cerrahi.py ornekler/cerrahi.diff --izinli 'fatura/kdv.py' --izinli 'tests/*' --butce 20
python3 cerrahi.py ornekler/tasan.diff   --izinli 'fatura/kdv.py' --izinli 'tests/*' --butce 20
git diff | python3 cerrahi.py --json      # kendi deponda
```

Aynı görev ("boş tutarda çökmeyi düzelt") için iki diff:

```text
Puan: 100/100 (cerrahi) — 2 dosya, +5 -1

Puan: 49/100 (taşkın) — 2 dosya, +17 -7
  [Cerrahi değişiklik] bosluk         fatura/kdv.py:3   'ORAN = 0.20' → 'ORAN = 0.20  '
  [Cerrahi değişiklik] ad-degisimi    fatura/kdv.py:16  'def kdv_hesapla(tutar):' → 'def kdv_hesapla(miktar):'
  [Cerrahi değişiklik] yorum-silindi  fatura/kdv.py:6   # Tutar metin olarak gelebilir
  [Cerrahi değişiklik] yorum-eklendi  fatura/kdv.py:7   """KDV hesaplarını tek yerde toplar."""
  [Önce sadelik] yeni-soyutlama fatura/kdv.py  class KdvHesaplayici:
  [Cerrahi değişiklik] kapsam-disi    fatura/ayarlar.py  görevin dosya listesinde yok
  [Cerrahi değişiklik] tirnak         fatura/ayarlar.py:1  "PARA_BIRIMI = 'TRY'" → 'PARA_BIRIMI = "TRY"'
  [Önce sadelik] buyukluk       -  24 satır değişti, bütçe 20
  [Hedefe dayalı yürütme] test-yok       -  kod değişti ama hiçbir test dosyası değişmedi
  … (kısaltıldı)
```

Örnek diff'ler bu atlas için yazıldı (deponun `EXAMPLES.md` dosyasındaki örnekler kopyalanmadı). Komut "taşkın"
kararında 1 ile çıkar; bir PR kontrolünde kapı olarak kullanılabilir.

## Test

```bash
cd repo-atlasi/dallar/08-ajan-becerileri/karpathy-skills/sifirdan
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s . -t .
```

13 test: diff ayrıştırma (git ve düz `diff -u`, yeni/silinen/yeniden adlandırılan/ikili dosya, `---` ile başlayan
içerik, bozuk başlık), kozmetik çift türleri, benzerlik eşlemesi, örnek puanları, soyutlama izni, belge
değişikliğinde test beklenmemesi, kozmetik ceza tavanı ve komut satırı.

## Nasıl çalışır?

1. **Ayrıştırma.** `diff_ayristir()` her `@@ -a,b +c,d @@` başlığındaki satır sayısı kadar satır tüketir; böylece
   içeriği `---` ile başlayan bir satır (ör. SQL yorumu) yeni bir dosya başlığı sanılmaz.
2. **Bloklar ve eşleme.** Bir parçadaki ardışık silinen/eklenen satırlar bir blok oluşturur. `eslestir()` her silinen
   satırı en benzer eklenen satırla eşler (`difflib.SequenceMatcher`, oran ≥ 0.5). Konuma göre eşlemek yanlış
   sonuç verir: bir yorum silinip başka yere docstring eklendiğinde ikisi "yorum değişti" sanılır.
3. **Çift türleri.** `cift_turu()`: yalnızca boşluk, yalnızca tırnak, yalnızca yorum (satır sonu yorumu dahil) ya da
   yalnızca ad değişimi (anahtar sözcükler hariç belirteç dizisi aynı). `if` → `while` gibi bir değişiklik kozmetik
   sayılmaz.
4. **Yeni soyutlama.** Eklenen `def/class/function/interface/struct/trait` tanımlarının adları silinenlerle
   karşılaştırılır; yeniden adlandırılan tanım yeni sayılmaz, test dosyalarındaki yeni test fonksiyonları da sayılmaz.
   İlk soyutlama serbesttir (`soyutlama_izni=1`), sonrakiler puan düşürür.
5. **Kapsam, büyüklük, test.** `--izinli` desenleri dışındaki dosyalar, `--butce` üstündeki satır sayısı ve kod
   değiştiği hâlde hiçbir test dosyasının değişmemesi işaretlenir.

## Eşleme tablosu

| Mini'deki parça                                            | Gerçek depodaki karşılığı (multica-ai/andrej-karpathy-skills, `2c60614`) | Fark                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `kapsam-disi`, `bosluk`, `tirnak`, `yorum*`, `ad-degisimi` | `CLAUDE.md` "3. Surgical Changes"                                        | Depo ilkeyi metin olarak verir; ölçmez               |
| `yeni-soyutlama`, `buyukluk`                               | `CLAUDE.md` "2. Simplicity First"                                        | Satır sayısı ve tanım sayısıyla kaba ölçüm           |
| `test-yok`                                                 | `CLAUDE.md` "4. Goal-Driven Execution"                                   | Yalnızca test dosyasının değişip değişmediğine bakar |
| `ilkeler-kontrol-listesi.md`                               | `CLAUDE.md` + `README.md` "How to Know It's Working"                     | Gözlenebilir sorulara çevrildi                       |
| `ornekler/*.diff`                                          | `EXAMPLES.md` (iki yönlü örnekler)                                       | Özgün örnekler, Türkçe senaryo                       |

## Sınırlar

- "Düşünce" ve "netleştirme sorusu" gibi davranışlar diff'te görünmez; onlar için transkripte bakmak gerekir.
- Dil bilgisi yok: yalnızca birkaç dilin yorum ve tanım sözdizimini tanır.
- Ad değişimi sezgisi, aynı satırda hem ad hem yapı değişince devreye girmez.
