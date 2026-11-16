---
baslik: Geliştirme döngüsü ve kalite kapıları
ozet: Ürünü kısa döngülerle geliştirmek; iş özeti, plan kapısı, otomatik kapı, uzman incelemesi ve insan kapısı, bulgu biçimi ve düzeltme turu sınırı; yapay zekâ ajanlarıyla çalışan küçük ekip için Köprü örneği.
etiketler: [urun, surec, kalite-kapisi, inceleme, ajan, demo]
duzey: orta
guncellik: 2026-11
---

# Geliştirme döngüsü ve kalite kapıları

> Bu notu ne zaman okumalı: işleri bir ya da birkaç yapay zekâ ajanına yaptırırken "ne zaman bitti sayacağım, ne
> zaman geri çevireceğim?" sorusunda; model aynı işi turlarca düzeltip duruyorsa; her şey "bitti" görünüyor ama
> telefonda bozuksa.

## Temel fikir

Döngü kısadır (bir-iki hafta) ve tek ana iş taşır: **özet → plan kapısı → yapım → otomatik kapı → uzman incelemesi →
insan kapısı (demo) → kayıt → öğrenme.**

**Kapı**, işin bir sonraki adıma geçmesi için gereken **kanıttır**: komut çıktısı, inceleme dosyası, telefonda demo.
Modelin "bitti" demesi kanıt değildir. Her kapının tek sahibi ve açık bir geçti/kaldı ölçütü vardır. Kapılar ucuzdan
pahalıya dizilir: önce makine (saniyeler), sonra uzman bakışı, en son sahibin zamanı.

Bulgu biçimi sabittir: **önem (Engel / Önemli / Öneri) + yer + somut düzeltme.** Engel işi geri çevirir; Önemli aynı
döngüde kapanır; Öneri yol haritasının birikim listesine gider. Düzeltme turları **sınırlıdır**: üç turda geçmeyen
iş için sorun çoğunlukla kodda değil tanımdadır; durulur, seçenekler yazılır, sahibe sorulur. Kayıt (commit) insan
onayından sonra atılır; uzak depoya gönderim (`git push`) her seferinde insan onayı ister.

## Karar tablosu: dört kapı

| Kapı              | Sahibi                                            | Neye bakar                                                      | Kanıt                           | Kalırsa                              |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| Plan kapısı       | Ürün sahibi                                       | Özetin kabul ölçütleri, kapsamı, ilkelerle uyumu                | Onaylı özet (`brief.md`)        | Özet düzeltilir; kod yazılmaz        |
| Otomatik kapı     | Komutlar                                          | Tip, lint, biçim, birim ve uçtan uca test, erişilebilirlik taraması | `check` ve `e2e` çıktısı    | Yapıma geri döner                    |
| Uzman incelemesi  | Tasarım, içerik, güvenlik bakışı (insan ya da ayrı rolde model) | İlkeler, metin, erişilebilirlik, güvenlik           | İnceleme dosyası                | Engel varsa geri; Önemli bu döngüde  |
| İnsan kapısı      | Ürün sahibi (mümkünse bir kullanıcıyla)           | Gerçek telefonda demo adımları                                  | Demo notu, ekran görüntüleri    | Düzeltme listesi; kayıt yok          |

Gerçek örnek: Köprü (depo kökü, `CLAUDE.md` → "Kalite kapıları") bu dört kapıyı kullanır, sprint başına en çok üç
düzeltme turu koyar ve üçüncü turdan sonra Engel kalırsa liderin durup seçenekleri `demo.md`'ye yazmasını ister.
İncelemeler `docs/sprints/SNN/reviews/<ajan>-<tur>.md` dosyalarına yazılır; özet ve demo notunun biçimi
[ürün belgesi şablonları](urun-belgesi-sablonlari.md) notundadır.

## Kapının ağırlığı işe göre

| İş                                                   | Kapılar                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Metin ya da renk düzeltmesi                          | Otomatik kapı + ekran görüntüsüne bir bakış                    |
| Yeni ekran ya da akış                                | Dört kapı                                                      |
| Ödeme, kimlik, yetki, veri silme, eşitleme           | Dört kapı + ayrı güvenlik incelemesi + geri dönüş planı        |
| Yayın                                                | [Lansman](lansman.md) listesi + insan onayı                     |

Kapı her işte aynı ağırlıkta olursa iki şeyden biri olur: ya küçük işler haftalarca bekler ya da kapılar
"formalite" diye atlanmaya başlar.

## Bulgu biçimi ve tur sınırı

```python calistir
MAX_ROUNDS = 3
ACTION = {"Engel": "iş geri döner", "Önemli": "bu döngüde kapanır", "Öneri": "birikim listesine"}


def valid(finding: dict[str, str]) -> bool:
    """Her bulgu: önem + yer + somut düzeltme. Biri eksikse bulgu geri çevrilir."""
    return finding.get("onem") in ACTION and bool(finding.get("yer")) and bool(finding.get("duzeltme"))


def run_gate(rounds: list[list[dict[str, str]]]) -> tuple[str, list[str]]:
    backlog: list[str] = []
    for number, findings in enumerate(rounds, start=1):
        assert all(valid(f) for f in findings), "eksik bulgu: önem, yer ve düzeltme zorunlu"
        backlog += [f["yer"] + ": " + f["duzeltme"] for f in findings if f["onem"] == "Öneri"]
        if not any(f["onem"] in ("Engel", "Önemli") for f in findings):
            return f"{number}. turda geçti → insan kapısı (demo)", backlog
        if number == MAX_ROUNDS:
            return "DUR: 3 tur doldu; seçenekleri yazıp sahibe sorun", backlog
    return "inceleme sürüyor", backlog


tur1 = [
    {"onem": "Engel", "yer": "Boş saatler ekranı", "duzeltme": "Saat düğmeleri 56 px; en az 72 px yapın"},
    {"onem": "Önemli", "yer": "tr.json → iptal", "duzeltme": "'İptal başarılı' yerine 'Randevunuz iptal edildi'"},
    {"onem": "Öneri", "yer": "Onay ekranı", "duzeltme": "Takvime ekle düğmesi daha belirgin olabilir"},
]
tur2 = [{"onem": "Öneri", "yer": "Ayarlar", "duzeltme": "Sürüm numarası Hakkında'da görünsün"}]
verdict, backlog = run_gate([tur1, tur2])
print(verdict)
print("birikim listesi:", "; ".join(backlog))

inatci = [{"onem": "Engel", "yer": "Eşitleme", "duzeltme": "Çevrimdışı iptal sunucuya hiç gitmiyor"}]
print(run_gate([inatci, inatci, inatci])[0])
assert not valid({"onem": "Engel", "yer": "", "duzeltme": "düzeltin"})  # yersiz bulgu kabul edilmez
```

```cikti
2. turda geçti → insan kapısı (demo)
birikim listesi: Onay ekranı: Takvime ekle düğmesi daha belirgin olabilir; Ayarlar: Sürüm numarası Hakkında'da görünsün
DUR: 3 tur doldu; seçenekleri yazıp sahibe sorun
```

Üç turda kapanmayan Engel için seçenekler: kapsamı küçültmek (çevrimdışı iptali bu döngüden çıkarmak), yaklaşımı
değiştirmek (zor parçayı hazır ve testli temelin koduna bırakmak), kararı sahibe sormak. Aynı modelle dördüncü tur
genellikle aynı yerde döner.

## Ajanlarla roller ve klasör sahipliği

- **Roller:** ürün sorumlusu (özet, plan kapısı, demo notu), kodcu (kaynak kod, testler, betikler), tasarımcı
  (tasarım belirteçleri ve belgeleri), içerikçi (içerik dosyaları ve arayüz metinleri).
- **Her klasörün tek yazarı vardır;** roller birbirinin dosyasını değiştirmez, geri bildirim inceleme dosyasına yazılır
  (Köprü `CLAUDE.md` → "Klasör sahipliği"). İki ajan aynı dosyayı yazarsa son yazan kazanır ve kimse fark etmez.
- **İnceleme dosya değiştirmez;** bulgu yazar. Düzeltmeyi dosyanın sahibi yapar.
- Tek modelle çalışıyorsanız rolleri sırayla oynatın: "Şimdi yalnız inceleme yap; hiçbir dosyayı değiştirme."

## Haftalık ritim örneği

| Gün   | İş                                                       | Çıktı                              |
| ----- | -------------------------------------------------------- | ---------------------------------- |
| 1     | Özet yazılır; plan kapısı                                | Onaylı `brief.md`                  |
| 2–3   | Yapım dilim dilim; her dilimden sonra otomatik kapı      | Yeşil denetim çıktıları            |
| 4     | Uzman incelemesi ve düzeltme turları                     | `reviews/*.md`                     |
| 5     | Telefonda demo, öğrenme kaydı, insan onayıyla kayıt      | `demo.md`, ekran görüntüleri, commit |

Dilimleme ve her dilimin bitti tanımı: [işi parçalama](../00-yontem/isi-parcalama.md). Ölçütlerin yazımı:
[gereksinim yazma](gereksinim-yazma.md).

## Tuzaklar

| Belirti                                                        | Neden                                                  | Çözüm                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Model "bitti" dedi; telefonda açınca ekran bozuk               | Otomatik ve insan kapısı atlandı                       | Kanıtsız "bitti" kabul edilmez; demo telefonda yapılır                      |
| Aynı Engel dört turdur düzelmiyor                              | Tur sınırı yok; tanım ya da yaklaşım yanlış            | Üç turda durun; kapsamı küçültün ya da yaklaşımı değiştirin                 |
| İnceleme bulguları sohbette kayboldu                           | Bulgular dosyaya yazılmadı                             | Her tur bir inceleme dosyası; biçim sabit                                  |
| İnceleyen model dosyaları da "düzeltti"                        | İnceleme ile yapım karıştı                             | İnceleme salt okunur; düzeltmeyi sahibi yapar                               |
| Her bulgu "Engel"                                              | Önem ölçeği tanımsız                                   | Engel: ilkeyi ya da kabul ölçütünü çiğniyor; geri kalanı Önemli ya da Öneri |
| Öneriler hiç yapılmıyor ve unutuluyor                          | Birikim listesi yok                                    | Öneriler yol haritasının birikim listesine yazılır                          |
| Küçük düzeltmeler haftalarca bekliyor                          | Her işe dört kapı                                      | Kapının ağırlığını işe göre seçin                                          |
| İki ajan aynı dosyayı değiştirdi, biri ötekini ezdi            | Klasör sahipliği yok                                   | Her klasörün tek yazarı                                                    |
| Kayıt geçmişi "düzeltme", "düzeltme 2" ile dolu                | Kayıt kapı geçilmeden atıldı                           | Kayıt insan onayından sonra; bir iş, bir anlamlı kayıt iletisi              |

## Denetim listesi

- [ ] Döngünün tek ana işi ve onaylı bir özeti var.
- [ ] Her kapının sahibi, kanıtı ve geçti/kaldı ölçütü yazılı.
- [ ] Otomatik kapının çıktısı (komut ve sonucu) kayıtta.
- [ ] İnceleme bulguları dosyada; her biri önem + yer + somut düzeltme taşıyor.
- [ ] Engel kalmadı; Önemli bulgular bu döngüde kapandı; Öneriler birikim listesinde.
- [ ] Düzeltme turu sayısı üçü geçmedi; geçtiyse seçenekler yazılıp sahibe soruldu.
- [ ] Demo gerçek telefonda yapıldı; demo notu yazıldı.
- [ ] Kayıt insan onayından sonra atıldı.

## Küçük modele yaptırırken

- **İnceleme için:** "Yalnız inceleme yap; hiçbir dosyayı değiştirme. Her bulgu için önem (Engel / Önemli / Öneri),
  yer (dosya ya da ekran) ve somut düzeltme yaz. Engel yalnız ilkeyi ya da kabul ölçütünü çiğneyen durum içindir.
  Bulgu yoksa 'bulgu yok' yaz; bulgu uydurma."
- **Düzeltme için:** "Yalnız Engel ve Önemli bulguları düzelt; Öneri'lere dokunma. Bitince denetim komutlarını çalıştır
  ve çıktıyı göster."
- **Modelin tipik hatası:** kendi işini incelerken her şeyi onaylar; ya da her şeyi Engel yapar; inceleme sırasında
  dosya değiştirir; komutu çalıştırmadan "testler geçti" der; aynı düzeltmeyi turlarca dener.
- **Çıktıda denetleyin:** inceleme dosyasının biçimi; inceleme turunda `git diff` boş mu; denetim çıktısı gerçekten var
  mı; tur sayısı.

## İlgili

- [Gereksinim yazma](gereksinim-yazma.md) ve [ürün belgesi şablonları](urun-belgesi-sablonlari.md): özet, ölçüt, demo notu.
- [Kod inceleme](../00-yontem/kod-inceleme.md) ve [test stratejisi](../00-yontem/test-stratejisi.md): otomatik ve uzman kapısının içi.
- [Kod modeliyle çalışmak](../85-llm/kodlama-icin-llm.md): küçük adım, her adımda denetim komutu.
- [Lansman](lansman.md), [kullanılabilirlik testi](kullanilabilirlik-testi.md), [erişilebilirlik kararı](erisilebilirlik-urun-karari.md).
- İnsan için çalışma rehberi: [`rehber/KUCUK_MODELLE_CALISMA.md`](../../rehber/KUCUK_MODELLE_CALISMA.md).
