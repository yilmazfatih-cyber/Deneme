---
baslik: "Örnek tasarım: sohbet uygulaması"
ozet: Birebir ve küçük grup sohbetinin gereksinimleri, kaba hesabı, sunucu sıralı mesaj modeli, idempotent gönderim, boşluk algılama, okundu bilgisi, çevrimdışı teslim ve büyüyünce değişenler; çalışan örnekle.
etiketler: [ornek-tasarim, sohbet, gercek-zamanli, siralama, idempotentlik]
duzey: ileri
guncellik: 2026-11
---

# Örnek tasarım: sohbet uygulaması

> Bu notu ne zaman okumalı: uygulamaya mesajlaşma, yorum dizisi, destek sohbeti ya da "canlı" bir akış
> eklenirken; mesajların sırası karıştığında, iki kez göründüğünde ya da okunmamış sayısı tutmadığında.

## Temel fikir

- Sohbetin özü **sıradır**: bir konuşmadaki herkes mesajları aynı sırada görmelidir. Sırayı **sunucu** verir,
  konuşma başına artan bir numarayla; cihaz saati sıra değildir.
- Gönderim idempotenttir: istemci her mesaja kendi kimliğini verir; zaman aşımından sonra yeniden gönderim ikinci
  bir mesaj yaratmaz.
- Anlık kanal (WebSocket/SSE) **hızlandırıcıdır, doğruluk kaynağı değildir**: kopabilir, mesaj kaçırabilir. İstemci
  sıra numarasındaki boşluğu fark eder ve imleçten sonrasını çeker.
- Okundu bilgisi mesaj başına değil, kişi başına "son okunan sıra numarası"dır.

## Gereksinimler

| Tür              | Gereksinim                                                                            |
| ---------------- | ------------------------------------------------------------------------------------- |
| İşlevsel         | Birebir ve en çok 50 kişilik grup; metin mesajı; okundu bilgisi; okunmamış sayısı      |
| İşlevsel         | Çevrimdışı alıcıya anlık bildirim (push); yeni cihazda geçmiş                         |
| İşlevsel olmayan | Çevrimiçi alıcıya p95 < 1 sn; mesaj kaybolmaz, iki kez görünmez, sırası karışmaz       |
| Hedef dışı       | Uçtan uca şifreleme, büyük kanallar (binlerce üye), dosya (ilk sürümde), çevrimiçi göstergesi |

Uçtan uca şifrelemeyi "hedef dışı" yazmak bilinçli bir karardır: sonradan eklemek veri modelini, aramayı, yedeği ve
çok cihazlı kullanımı baştan değiştirir. İsteniyorsa ilk günden tasarlanır.

## Kaba hesap

```python calistir
gunluk_mesaj = 10_000 * 40  # 10 bin günlük etkin kullanıcı × 40 mesaj (tahmin)
tepe = 6  # dakikalık tepe / gün ortalaması
yazma_tepe = gunluk_mesaj / 86_400 * tepe
teslim_tepe = yazma_tepe * (4 - 1)  # ortalama sohbet 4 kişi: her mesaj 3 alıcıya gider
depolama_gb = gunluk_mesaj * 300 * 365 / 1e9  # mesaj başına ~300 bayt (dizin dahil)
baglanti = 10_000 * 8 / 86_400 * 3 * 360  # Little: günde 8 oturum, tepe ×3, oturum 6 dk açık
print(f"yazma tepe {yazma_tepe:.0f}/sn | teslim tepe {teslim_tepe:.0f}/sn | depolama {depolama_gb:.0f} GB/yıl | açık bağlantı ~{baglanti:.0f}")
assert baglanti < 5_000 and yazma_tepe < 100  # tek sunucunun rahat taşıyacağı büyüklük
```

```cikti
yazma tepe 28/sn | teslim tepe 83/sn | depolama 44 GB/yıl | açık bağlantı ~1000
```

Tek sunucu yeter. Asıl kısıt açık bağlantı sayısı ve sürecin dosya tanıtıcısı sınırıdır; Little yasasıyla
hesaplanır ([Kapasite tahmini](kapasite-tahmini.md)).

## İlk tasarım: tek sunucu

```text
gönder: POST /sohbetler/{id}/mesajlar {istemci_kimligi, metin}
          └► tek işlem: sohbet.son_sira + 1 → mesaj satırı → (aynı işlemde) giden kutusu: "s1'de 7 numara"
dağıt:  giden kutusu ──► açık bağlantısı olan üyelere dürtme (SSE/WebSocket) ──► istemci imleçten sonrasını çeker
        bağlantısı olmayan üyelere ──► bildirim kuyruğu ──► push
eşitle: GET /sohbetler/{id}/mesajlar?sonra=<son sıra>   (yeni cihaz, kopma sonrası, boşluk)
```

Mesaj modeli, idempotent gönderim, boşluk algılama ve okundu bilgisi, çalışır hâlde:

```python calistir
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE sohbet (id TEXT PRIMARY KEY, son_sira INTEGER NOT NULL DEFAULT 0);
CREATE TABLE mesaj (
  sohbet_id TEXT NOT NULL, sira INTEGER NOT NULL, gonderen TEXT NOT NULL,
  istemci_kimligi TEXT NOT NULL, metin TEXT NOT NULL,
  PRIMARY KEY (sohbet_id, sira),
  UNIQUE (gonderen, istemci_kimligi)  -- aynı mesajın yeniden gönderimi ikinci satır açamaz
);
CREATE TABLE okuma (sohbet_id TEXT, kullanici TEXT, son_okunan INTEGER, PRIMARY KEY (sohbet_id, kullanici));
INSERT INTO sohbet (id) VALUES ('s1');
""")


def gonder(sohbet: str, gonderen: str, istemci_kimligi: str, metin: str) -> int:
    """Sıra numarasını SUNUCU verir, sohbet başına artan; yeniden gönderim aynı numarayı döndürür."""
    db.execute("BEGIN IMMEDIATE")
    eski = db.execute(
        "SELECT sira FROM mesaj WHERE gonderen = ? AND istemci_kimligi = ?", (gonderen, istemci_kimligi)
    ).fetchone()
    if eski is None:
        sira = db.execute("UPDATE sohbet SET son_sira = son_sira + 1 WHERE id = ? RETURNING son_sira", (sohbet,)).fetchall()[0][0]
        db.execute("INSERT INTO mesaj VALUES (?, ?, ?, ?, ?)", (sohbet, sira, gonderen, istemci_kimligi, metin))
    db.execute("COMMIT")
    return eski[0] if eski else sira


class Istemci:
    def __init__(self) -> None:
        self.son, self.mesajlar = 0, {}  # son: kesintisiz alınan en büyük sıra (imleç)

    def al(self, sira: int, metin: str) -> list[int]:
        """Anlık kanaldan gelen mesaj; eksik sıra numaralarını döndürür (istemci bunları imleçle çeker)."""
        if sira > self.son:
            self.mesajlar[sira] = metin  # yinelenen sıra üzerine yazılır, çoğalmaz
        while self.son + 1 in self.mesajlar:
            self.son += 1
        return [s for s in range(self.son + 1, max(self.mesajlar, default=0)) if s not in self.mesajlar]


assert gonder("s1", "ayse", "k-1", "Merhaba") == 1
assert gonder("s1", "ayse", "k-2", "Akşam çıkalım mı?") == 2
assert gonder("s1", "ayse", "k-2", "Akşam çıkalım mı?") == 2  # yanıt kayboldu, yeniden gönderildi: çift yok
assert gonder("s1", "mehmet", "k-1", "Olur") == 3  # istemci kimliği gönderen başına benzersiz
assert db.execute("SELECT count(*) FROM mesaj").fetchone()[0] == 3

telefon = Istemci()
assert telefon.al(1, "Merhaba") == []
assert telefon.al(3, "Olur") == [2]  # 2 numara anlık kanalda kayboldu: boşluk fark edildi
for sira, metin in db.execute("SELECT sira, metin FROM mesaj WHERE sohbet_id = 's1' AND sira > ?", (telefon.son,)):
    telefon.al(sira, metin)  # imleçten sonrasını çek
assert telefon.son == 3 and [telefon.mesajlar[s] for s in (1, 2, 3)] == ["Merhaba", "Akşam çıkalım mı?", "Olur"]

# Okundu bilgisi mesaj başına değil, kişi başına "son okunan sıra": okunmamış = son_sira - son_okunan
db.execute("INSERT INTO okuma VALUES ('s1', 'mehmet', 1)")
okunmamis = db.execute(
    "SELECT s.son_sira - o.son_okunan FROM sohbet s JOIN okuma o ON o.sohbet_id = s.id WHERE o.kullanici = 'mehmet'"
).fetchone()[0]
assert okunmamis == 2
print("sunucu sırası + istemci kimliği: çift yok, boşluk algılandı, okunmamış 2")
```

```cikti
sunucu sırası + istemci kimliği: çift yok, boşluk algılandı, okunmamış 2
```

Ayrıntılar:

- Sıra numarası sohbet satırında artırılır: aynı sohbete eşzamanlı iki gönderim yazma kilidinde sıraya girer.
  Farklı sohbetler birbirini beklemez (çok sunucuda da sohbete göre bölünür).
- Gönderen kendi mesajını hemen "gönderiliyor" olarak görür (iyimser), sunucunun numarası gelince yerine oturur
  ([Tutarlılık modelleri](tutarlilik-modelleri.md) → kendi yazdığını oku).
- Anlık kanal yalnız "şu sohbette yeni mesaj var" diye dürter; veri imleçli uçtan çekilir. Yeniden bağlanma, kalp
  atışı ve vekil sorunları: [Gerçek zamanlı](../30-arkauc/gercek-zamanli.md). Havuzdaki uygulama aynı "dürt, sonra
  çek" kalıbını kullanır ([`hub.ts`](../../uygulama/api/src/modules/events/hub.ts)).
- Çevrimdışı alıcıya push, bildirim sisteminden geçer; sessiz saat ve özet kuralları orada
  ([Bildirim sistemi örneği](ornek-bildirim-sistemi.md)). Push içeriğinde mesaj metni göstermek kullanıcı
  tercihi olmalı (kilit ekranında görünür).
- "Çevrimiçi / yazıyor…" göstergesi pahalıdır (her kullanıcı için sürekli olay); ilk sürümde yoktur ya da kaba
  tutulur ("son görülme: bugün").

## Büyüyünce ne değişir

| Eşik                                                | Değişiklik                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| Açık bağlantılar tek sürece sığmıyor                | Birden çok bağlantı sunucusu + aralarında yayın/abone (Postgres NOTIFY, Redis) |
| Yazma veritabanını zorluyor                         | Sohbet kimliğine göre parçalama (sohbet içi sıra parçada kalır)            |
| Büyük gruplar/kanallar (binlerce üye)               | Yazarken dağıtma yerine okurken çekme; dürtmeyi örnekleyerek gönder        |
| Geçmişte arama                                      | Ayrı arama dizini, giden kutusundan beslenir ([Arama ve öneri örneği](ornek-arama-ve-oneri.md)) |
| Dosya ve görsel                                     | Nesne deposu + imzalı adres ([Dosya paylaşımı örneği](ornek-dosya-paylasimi.md)) |

## Tuzaklar

| Belirti                                                       | Neden                                                    | Çözüm                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| Mesajlar farklı cihazlarda farklı sırada                      | Cihaz saatine göre sıralama                              | Sunucunun verdiği sohbet içi sıra numarası                 |
| Zayıf bağlantıda aynı mesaj iki kez göründü                   | Yeniden gönderim yeni satır açtı                         | İstemci kimliği + benzersizlik kısıtı                      |
| Bazı mesajlar bağlantı kopunca hiç gelmedi                    | Anlık kanala güvenildi, boşluk denetlenmedi              | Sıra boşluğu algıla, imleçten çek; yeniden bağlanınca da çek |
| Okunmamış sayısı tutmuyor                                     | Mesaj başına okundu bayrağı, eksik güncelleme            | Kişi başına son okunan sıra                                |
| Vekil arkasında anlık mesajlar topluca ve geç geliyor         | Vekil yanıtı tamponluyor                                 | Tamponlamayı kapat ([Ters vekil](../60-devops/ters-vekil.md)) |
| Yeni cihazda açılış dakikalar sürüyor                         | Bütün geçmiş tek seferde indiriliyor                     | Son N mesaj + yukarı kaydırınca sayfalı geçmiş            |
| İkinci sunucu eklenince bazı mesajlar anlık gelmiyor          | Bağlantılar sunucular arasında paylaşılmıyor             | Yayın/abone katmanı                                         |

## Denetim listesi

- [ ] Sıra numarasını sunucu veriyor; sohbet içinde artan ve benzersiz (`PRIMARY KEY (sohbet_id, sira)`).
- [ ] Gönderim istemci kimliğiyle idempotent; yeniden gönderim testi var.
- [ ] İstemci boşluk algılıyor ve imleçli uçtan çekiyor; yeniden bağlanınca da çekiyor.
- [ ] Okundu bilgisi kişi başına son sıra; okunmamış sayısı ondan hesaplanıyor.
- [ ] Anlık kanal yalnız dürtüyor; veri yetkili uçtan geliyor (üyelik her çekişte denetleniyor).
- [ ] Çevrimdışı alıcıya push bildirim sisteminden; push içeriği tercihe bağlı.
- [ ] Açık bağlantı sayısı, teslim gecikmesi (p95) ve kopma oranı izleniyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Mesaj sırası sunucuda, sohbet satırındaki sayaçla tek işlemde verilsin. İstemci her mesaja
  `istemci_kimligi` koysun; `(gonderen, istemci_kimligi)` benzersiz. Anlık kanal yalnız 'yeni mesaj var' desin;
  istemci `?sonra=<son sıra>` ile çeksin ve sıra boşluğunda yeniden çeksin."
- **Modelin tipik hatası:** mesajları `created_at` (çoğu zaman istemci saati) ile sıralar; mesaj içeriğini doğrudan
  WebSocket'ten basar ve kaçanı hiç fark etmez; her mesaj için okundu satırı yazar; yeniden gönderimde çift kayıt
  açar.
- **Çıktıda arayın:** `ORDER BY created_at`, gönderim ucunda benzersizlik kısıtı, istemcide boşluk/imleç mantığı,
  anlık kanaldan gelen veride yetki denetimi.

## İlgili

- [Tutarlılık modelleri](tutarlilik-modelleri.md) · [Kuyruk ve olaylar](kuyruk-ve-olaylar.md) ·
  [Dağıtık sistem yanılgıları](dagitik-sistem-yanilgilari.md) · [Çevrimdışı-önce ve eşitleme](cevrimdisi-once-ve-esitleme.md)
- [Gerçek zamanlı](../30-arkauc/gercek-zamanli.md) (SSE/WebSocket, yeniden bağlanma)
- Havuzdaki imleçli eşitleme ve dürtme: [`uygulama/docs/ESITLEME.md`](../../uygulama/docs/ESITLEME.md)
