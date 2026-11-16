# islem — işlemler (transactions): MVCC ve iki aşamalı kilitleme

"İki kişi aynı anda aynı veriyi değiştirince ne olur?" sorusunun iki klasik yanıtı, yan yana:

- **MVCC** (`MVCCStore`): her yazma yeni bir *sürüm* ekler; okuyucu kimseyi beklemez, işlemin
  başladığı andaki anlık görüntüyü görür. Çakışma onayda (commit) yakalanır. (PostgreSQL, Oracle.)
- **Katı iki aşamalı kilitleme** (`LockingStore`): okumak için paylaşılan (S), yazmak için özel (X)
  kilit; kilitler işlem bitene dek bırakılmaz. Çakışan işlem bekler; döngü oluşursa **kilitlenme
  algılanır** ve bir işlem kurban edilir. (SQL Server'ın klasik kipi, InnoDB'nin kilitleri.)

Yalnız standart kitaplık, bellek içi. İş parçacığı ve `sleep` kullanmadan iç içe geçmeleri (schedule)
tam olarak yöneten bir **belirlenimci zamanlayıcı** (`Scheduler`) vardır; anomaliler onunla kanıtlanır.

```python
from islem import MVCCStore, SNAPSHOT, ConflictError

store = MVCCStore()
while True:  # çakışmada yeniden dene: doğru kullanım kalıbı budur
    tx = store.begin(SNAPSHOT)
    bakiye = tx.get("hesap") or 0
    tx.put("hesap", bakiye + 10)
    try:
        tx.commit()
        break
    except ConflictError:
        continue  # işlem zaten geri alındı; baştan
```

## Nasıl çalışır

### MVCC: sürüm zinciri ve anlık görüntü

```
"x" anahtarı:  (onay=3, 10) ─ (onay=7, 25) ─ (onay=9, SİLİNDİ)
                   ▲                ▲
   start_ts=5 olan işlem bunu görür │
                 start_ts=8 olan işlem bunu görür  (9 henüz yoktu)
```

- `begin()` o anki onay sayacını `start_ts` olarak alır. `get` → onay zamanı ≤ `start_ts` olan en
  yeni sürüm. Yazmalar onaya dek işlemin **özel yazma kümesinde** durur (kendi yazdığını görür,
  başkası göremez → kirli okuma olanaksız).
- **Onay (commit):** depo kilidi altında doğrulama yapılır, sonra yeni onay zamanıyla bütün yazmalar
  birlikte (atomik) eklenir. Doğrulama yalıtım düzeyine göre:

| Düzey            | Okuma görüntüsü               | Onayda denetim                                                   |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- |
| `READ_COMMITTED` | her okumada en yeni onaylı    | yok                                                              |
| `SNAPSHOT`       | işlemin başındaki görüntü     | yazdığım anahtarı start_ts'den sonra başkası onayladıysa iptal   |
| `SERIALIZABLE`   | işlemin başındaki görüntü     | + okuduğum anahtar ya da taradığım aralık değiştiyse iptal       |

- `vacuum()`: hiçbir etkin işlemin göremeyeceği eski sürümleri siler.

### Katı 2PL: kilitler ve kilitlenme

```
okuma:  ROOT'ta IS  + anahtarda S        uyum tablosu:  IS  IX  S  SIX  X
yazma:  ROOT'ta IX  + anahtarda X                   IS   ✓   ✓   ✓   ✓   ✗
tarama: ROOT'ta S   (yazıcılar bekler)              IX   ✓   ✓   ✗   ✗   ✗
                                                    S    ✓   ✗   ✓   ✗   ✗
T1 ──bekliyor──► T2                                 SIX  ✓   ✗   ✗   ✗   ✗
 ▲                │       döngü = kilitlenme →      X    ✗   ✗   ✗   ✗   ✗
 └───bekliyor─────┘       isteyen kurban (DeadlockError, geri alınır)
```

Yazma yerinde yapılır, eski değer **geri alma günlüğüne** (undo log) yazılır; iptalde geri yüklenir.
`acquire` beklemez: kilit yoksa bekleme çizgesine kenar ekler, döngü varsa `DeadlockError`, yoksa
`WouldBlock` fırlatır; zamanlayıcı o işlemi sonra yeniden dener.

## Hangi düzeyde hangi anomali olur? (testle kanıtlı)

`tests/islem/test_anomalies.py` her hücreyi belirli bir iç içe geçmeyle kurar ve ölçer:

| Anomali                                   | READ_COMMITTED | SNAPSHOT | SERIALIZABLE | 2PL |
| ----------------------------------------- | :------------: | :------: | :----------: | :-: |
| Kirli okuma (onaylanmamışı görmek)         | yok            | yok      | yok          | yok |
| Yinelenemeyen okuma (aynı satır değişir)   | **var**        | yok      | yok          | yok |
| Kayıp güncelleme (iki artıştan biri kaybolur) | **var**     | yok      | yok          | yok |
| Hayalet satır (aynı aralık sorgusu büyür)  | **var**        | yok      | yok          | yok |
| Yazma çarpıklığı (write skew)              | **var**        | **var**  | yok          | yok |

### Yazma çarpıklığı neden anlık görüntü yalıtımında olur?

Kural: "en az bir doktor nöbette olmalı". Alice ve Bob nöbette. İkisi aynı anda nöbetten çıkmak ister:

```
T1: alice=1, bob=1 okur → "Bob nöbette, ben çıkabilirim" → alice := 0
T2: alice=1, bob=1 okur → "Alice nöbette, ben çıkabilirim" → bob := 0
```

İkisi de **aynı anlık görüntüyü** okur ve **farklı** anahtarlara yazar. SNAPSHOT'ın "ilk onaylayan
kazanır" kuralı yalnız *aynı anahtara* iki yazmayı yakalar; yazma kümeleri kesişmediği için ikisi de
onaylanır → kimse nöbette değil. Hiçbir seri sıra (önce T1 sonra T2 ya da tersi) bu sonucu veremez:
T1'den sonra koşan T2 alice=0 görür ve çıkmaz. SERIALIZABLE'da T2 onaylanırken "okuduğum alice değişti"
denetimi onu iptal eder; 2PL'de ikisi de S kilidi tutarken X ister → kilitlenme → biri kurban.

### Hangisini ne zaman seçmeli?

- **SNAPSHOT:** okuma ağırlıklı işler, uzun raporlar (okuyucu yazıcıyı durdurmaz). Kuralınız birden çok
  satıra yayılıyorsa (toplam, "en az bir") yazma çarpıklığına karşı ya SERIALIZABLE kullanın ya da
  kuralı tek bir satıra bağlayın (ör. sayaç satırını da güncelleyin → yazma kümeleri kesişir).
- **SERIALIZABLE (iyimser):** doğruluk her şeyden önemliyse ve çekişme azsa. Çekişme yükselince iptal
  oranı artar (ölçüm: 6 anahtarlı yoğun testte onay oranı ~%46); istemci yeniden denemelidir.
- **2PL:** çekişme yüksek ve işlemler kısaysa; beklemek iptal edip baştan koşmaktan ucuzdur (aynı
  testte ~%67 onay). Uzun okuyucular yazıcıları durdurur; kilitlenmeye hazırlıklı olun.
- **READ_COMMITTED:** yalnız tek satırlık, kendi içinde tutarlı işler (sayaç değil!).

## Dosya haritası

| Dosya          | Sorumluluk                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| `mvcc.py`      | `MVCCStore`, `MVCCTransaction`: sürümler, yalıtım düzeyleri, onay doğrulaması, `vacuum` |
| `locks.py`     | `LockManager`: IS/IX/S/SIX/X kipleri, uyum ve üst sınır, bekleme çizgesi   |
| `two_phase.py` | `LockingStore`, `LockingTransaction`: katı 2PL, geri alma günlüğü          |
| `scheduler.py` | `Scheduler`: üreteç programlarını belirlenimci sırayla iç içe yürütür       |
| `errors.py`    | `ConflictError`, `DeadlockError`, `WouldBlock` ...                          |

## Güvenceler (testle kanıtlanan)

- **Anomali tablosu** (yukarıdaki) 20 hücrenin hepsi testle ölçülür.
- **Serileştirilebilirlik:** rastgele programlar (1–3 okuma, aralık taraması, 1–2 yazma/silme) rastgele
  iç içe geçmeyle koşulur; SERIALIZABLE ve 2PL'de onaylananlar **onay sırasıyla tek tek** yeniden
  oynatıldığında her işlem aynı değerleri okur ve son durum aynıdır (hızlı: 150 tohum/kip, `--uzun`:
  3000 tohum/kip). SNAPSHOT'ta bu, tohumların çoğunda tutmaz.
- **Gerçek iş parçacıkları:** 4 iş parçacığı × 200 artış, çakışmada yeniden deneme → sayaç tam 800.
- **Testin dişleri:** 6 bilerek bozulmuş sürüm (SI'de yazma denetimi yok, SER'de okuma doğrulaması yok,
  2PL'de S kilidini erken bırakma, kilitlenme algılama yok, sürüm görünürlüğünde bir kayma, taramada
  IS kilidi) testlerce yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Kalıcılık yok:** her şey bellekte; çökmede kaybolur (kalıcılık için `anahtar_deger`'in WAL'ı).
- **2PL gerçek iş parçacığıyla beklemez:** `WouldBlock` çağırana döner; bekleme/yeniden deneme
  zamanlayıcının işidir. Adil sıra (FIFO) yok: sürekli okuyucular yazıcıyı aç bırakabilir.
- **SERIALIZABLE kötümserdir:** gerçek bir çatışma olmasa da (ör. salt okunur işlem) iptal edebilir;
  Cahill'in SSI'si daha az iptal eder. Yanlış onay vermez (testli).
- **Hayalet koruması kaba:** 2PL'de aralık taraması bütün depoyu S kilitler (aralık/anahtar-boşluk
  kilidi yok); MVCC SERIALIZABLE'da taranan aralıklar doğrulanır.
- Kurban seçimi basittir (döngüyü kapatan istek); kilitlenme algılama her beklemede DFS yapar.

## Buradan nereye

1. **SSI (Serializable Snapshot Isolation):** okuma-yazma bağımlılıklarını (rw-antidependency) izle,
   yalnız iki ardışık kenarlı "tehlikeli yapı"da iptal et.
2. **Gerçek bekleme:** `two_phase.LockingTransaction._lock`'u `threading.Condition` ile sar (WouldBlock
   → `wait`, her `release_all` → `notify_all`); zaman aşımı ekle.
3. **Kalıcı MVCC:** onaylanan yazma kümesini `anahtar_deger`'e tek toplu yazma (write_batch) olarak yaz;
   onay zamanını anahtara son ek yap (`anahtar@zaman`).
4. **Aralık kilitleri:** ROOT S yerine `[başlangıç, bitiş)` aralık kaynakları; yazıcı yalnız kendi
   anahtarını kapsayan aralıklarla çatışsın.
5. **Kurban politikası:** en genç işlemi ya da en az iş yapmış olanı seç; açlığı önlemek için yaş sakla.
6. **Kayıt noktaları (savepoint):** geri alma günlüğüne işaret koyup kısmi geri alma.
