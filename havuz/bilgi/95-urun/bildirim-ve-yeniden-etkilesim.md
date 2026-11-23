---
baslik: Bildirim ve yeniden etkileşim
ozet: Bildirimi kimin yararına olduğuna göre ayırmak, izni doğru anda istemek, yorgunluğa karşı bütçe ve sıklık sınırı, sessiz saat, kanal seçimi ve bildirimin gerçek katkısını kontrol grubuyla ölçmek; çalışan örneklerle.
etiketler: [urun, bildirim, yeniden-etkilesim, olcum, izin, tutma]
duzey: orta
guncellik: 2026-11
---

# Bildirim ve yeniden etkileşim

> Bu notu ne zaman okumalı: bir ürüne anlık bildirim, e-posta ya da SMS ile "geri çağırma" eklenecekken; "kullanıcılar
> geri gelmiyor, bildirim atalım" önerisinde; bildirim izni oranı düşük ya da bildirimi kapatanlar çoğaldığında;
> bir bildirimin "işe yaradığı" panodan okunmak istendiğinde.

## Temel fikir

Bildirim kullanıcının **dikkatinden** harcar. Her bildirim için tek soru: **"Kullanıcı bunu kendisi isteseydi,
bu anda, bu kanaldan ister miydi?"** Evetse bildirim hizmettir; hayırsa reklamdır ve bedeli izin kaybı, bildirimi
kapatma ve uygulamayı silmedir. Bu bedel geç görünür ve geri alınamaz: reddedilen sistem izni bir daha kolayca
sorulamaz.

Üç kural:

1. **Türüne göre ayır:** güvenlik ve işlem bildirimleri (şifre değişti, sipariş yola çıktı) işin parçasıdır;
   kullanıcının kendi kurduğu hatırlatma sözdür; sosyal, yeniden etkileşim ve kampanya bildirimleri bütçeye tabidir.
2. **Bütçe koy:** kullanıcı başına günlük/haftalık sınır, sessiz saat, tepki vermeyene daha az; benzerleri tek özette
   birleştir.
3. **Kontrol grubuyla ölç:** "bildirimden açılma oranı" bildirimin değerini ölçmez; zaten açacak olanlar da
   bildirime dokunur. Gerçek katkı, rastgele seçilmiş ve bildirim almayan bir kontrol grubuyla karşılaştırmadır.

Gönderim altyapısı (kuyruk, planlayıcı, sessiz saat, yineleme önleme):
[örnek tasarım: bildirim sistemi](../40-sistem-tasarimi/ornek-bildirim-sistemi.md); teknik izin akışı:
[tarayıcı API'leri](../20-web-onyuz/tarayici-apileri.md), [e-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md).

## Karar tablosu

| Tür | Örnek | Onay | Kanal | Sıklık | Başarı ölçütü |
| --- | --- | --- | --- | --- | --- |
| Güvenlik | Yeni cihazdan giriş, şifre değişti | Gerekmez; kapatılamaz | E-posta + anlık | Olay oldukça | Teslim oranı |
| İşlem | Sipariş yola çıktı, randevu onaylandı | Hizmetin parçası | Anlık / e-posta / uygulama içi | Olay oldukça | Destek talebi azalması |
| Kullanıcının kurduğu hatırlatma | İlaç saati, kelime pratiği | Kullanıcı kendisi kurdu | Anlık (yerel ya da sunucu) | Kullanıcının seçtiği | Hatırlatmadan sonra eylem |
| Sosyal | Yorum yazıldı, mesaj geldi | Kategori tercihi | Anlık + uygulama içi; özetle | Bütçe içinde | Yanıtlama oranı |
| Yeniden etkileşim | "Yarım kalan listeniz var" | Kategori tercihi | E-posta ya da anlık | Haftada en çok 1–2 | Kontrol grubuna göre geri dönüş |
| Kampanya / pazarlama | İndirim, yeni ürün | **Açık onay** (ticari ileti) | E-posta / SMS / anlık | Haftada en çok 1 | Kontrol grubuna göre satış; abonelikten çıkma |

Türkiye'de kampanya, tanıtım ve bülten iletileri ticari elektronik iletidir ve önceden açık onay ister
([içerik ve büyüme](icerik-ve-buyume.md), [yasal temel belgeler](yasal-temel-belgeler.md)). Anlık bildirimle kampanya
göndermenin bu kapsama nasıl girdiğini bir hukukçuya doğrulatın (doğrulanmadı; hukuki danışmanlık değildir).

## İzin isteme anı

| Yanlış | Doğru |
| --- | --- |
| İlk açılışta sistem izin penceresi | Kullanıcı değeri gördüğü anda, o değere bağlı bir kart: "Kargonuz yola çıkınca haber verelim mi?" |
| "Bildirimlere izin verin" genel metni | Ne zaman, ne kadar sık, neyi bildireceği: "Yalnız sipariş durumu. Kampanya yok." |
| Tek seçenek: "İzin ver" | "Evet" ve "Şimdi değil"; "Şimdi değil" sistem penceresini hiç açmaz |
| Reddedilince yeniden yeniden sormak | Reddedilmişse yalnız ayarlardan açma yolunu gösteren yardım |
| Bütün türler için tek izin | Kategori tercihi: sipariş açık, kampanya kapalı |

İzin akışını huni olarak ölçün: kart gösterildi → "Evet" → sistem izni verildi → 30 gün sonra izin hâlâ açık. Son
adım en önemlisidir: kapatılan izin, bildirimlerin yorduğunu gösterir. Sunucusu olmayan bir PWA (Köprü gibi) uzaktan
anlık bildirim gönderemez; "her gün 9'da hatırlat" sözü ürün kararında açıkça değerlendirilir
([PWA'yı telefona kurdurma](../60-devops/mobil-paketleme.md)).

## Bütçe, öncelik ve tepki vermeyen kullanıcı

Sistem tasarımındaki planlayıcı sessiz saati ve özeti uygular; ürün kararı ise **ne kadar** ve **hangisi** sorusudur.
Kural: güvenlik, işlem ve kullanıcının kurduğu hatırlatma her zaman gider; ötekiler önceliğe göre günlük bütçeye
sığdığı kadar; kampanya haftada en çok bir; üst üste beş isteğe bağlı bildirimi açmayan kullanıcının bütçesi düşer:

```python calistir
from datetime import datetime, timedelta

PRIORITY = ["guvenlik", "islem", "hatirlatma", "sosyal", "yeniden_etkilesim", "kampanya"]  # önce gelen önemli
ALWAYS = {"guvenlik", "islem", "hatirlatma"}  # bütçeye takılmaz: işin parçası ya da kullanıcı kendisi kurdu


def plan(candidates, history, now):
    """Bugün gönderilecekleri seçer. history: (tür, gönderim anı, açıldı mı) listesi."""
    optional = [h for h in sorted(history, key=lambda h: h[1]) if h[0] not in ALWAYS]
    streak = 0  # sondan geriye: üst üste açılmayan isteğe bağlı bildirim sayısı
    for _, _, opened in reversed(optional):
        if opened:
            break
        streak += 1
    budget = 3 if streak < 5 else 1  # tepki vermeyen kullanıcıya daha az
    budget -= sum(1 for t, at, _ in optional if now - at < timedelta(hours=24))
    campaign_recent = any(t == "kampanya" and now - at < timedelta(days=7) for t, at, _ in optional)
    sent, skipped = [], []
    for kind in sorted(candidates, key=PRIORITY.index):
        if kind in ALWAYS:
            sent.append(kind)
        elif kind == "kampanya" and campaign_recent:
            skipped.append((kind, "haftada en çok bir kampanya"))
        elif budget <= 0:
            skipped.append((kind, f"günlük bütçe doldu (üst üste açılmayan: {streak})"))
        else:
            sent.append(kind)
            budget -= 1
    return sent, skipped


now = datetime(2026, 11, 23, 10, 0)
history = [("sosyal", now - timedelta(days=d), False) for d in range(1, 7)] + [("kampanya", now - timedelta(days=3), False)]
sent, skipped = plan(["kampanya", "sosyal", "islem", "yeniden_etkilesim", "hatirlatma"], history, now)
print("gönder:", sent)
for kind, why in skipped:
    print(f"atla: {kind:17s} → {why}")
assert sent == ["islem", "hatirlatma", "sosyal"]
```

```cikti
gönder: ['islem', 'hatirlatma', 'sosyal']
atla: yeniden_etkilesim → günlük bütçe doldu (üst üste açılmayan: 7)
atla: kampanya          → haftada en çok bir kampanya
```

Sayılar (3/gün, 1 kampanya/hafta, 5 açılmayan) başlangıç varsayımıdır, ölçüm değil; kontrol gruplu deneyle
ayarlanır. Bütçe kural olarak **tek yerde** yazılır ve her bildirim türü ondan geçer; her ekip kendi bildirimini
"bir tane daha"yla eklerse toplam yük kimsenin kararı olmadan büyür.

Sessiz saat (Türkiye için 22:00–08:00 makul bir varsayılan), kullanıcının saatine göre hesaplanır ve ertelenen
bildirimler sabah tek özet olur; uygulanışı: [örnek tasarım: bildirim sistemi](../40-sistem-tasarimi/ornek-bildirim-sistemi.md).

## Kanal seçimi

| Kanal | İyi olduğu iş | Kötü olduğu iş | Dikkat |
| --- | --- | --- | --- |
| Uygulama içi (kutu, rozet) | Uygulamayı açana bilgi, ayrıntı | Geri çağırma (açmayan görmez) | İzin istemez; her şeyin kaydı burada da dursun |
| Anlık bildirim | Kısa, zamanında, eyleme dönük ("Kuryeniz kapıda") | Uzun içerik, kayıt gereken bilgi | İzin bir kez; kötü kullanım kalıcı kayıp |
| E-posta | Uzun içerik, fatura, kayıt, haftalık özet | Acil olay | Toplu ileti ayrı alt alan adı; ticari ileti onayı |
| SMS | Kritik ve kısa (tek kullanımlık kod, randevu günü) | Pazarlama yükü, uzun metin | Maliyetli; ticari ileti onayı ve ret yolu |
| Mesajlaşma uygulaması | Kullanıcının zaten yazıştığı kanalda işlem bildirimi | Toplu duyuru | Sağlayıcı kuralları ve onay; maliyet |

Kural: aynı olayı birden çok kanaldan göndermeyin; tek kanal seçin, gerekirse "anlık açılmadıysa 2 saat sonra
e-posta" gibi sıralı yedek kurun. Güvenlik olayları bunun istisnasıdır.

## Ölçmek: atıf değil kontrol grubu

200.000 kullanıcı; %10'u rastgele kontrol grubu (bu bildirim türü gönderilmez). Bildirim az etkin kullanıcıyı biraz
daha çok çekiyor; zaten açacak olanların yarısı da uygulamayı bildirime dokunarak açıyor:

```python calistir
import math
import random

rng = random.Random(23)
users = []  # (kontrolde mi, o gün açtı mı, bildirime dokunarak mı açtı, yalnız bildirim yüzünden mi açtı)
for _ in range(200_000):
    base = rng.uniform(0.05, 0.6)  # bildirim olmadan o gün uygulamayı açma olasılığı
    holdout = rng.random() < 0.1  # %10 kontrol: bu bildirim türü hiç gönderilmez
    lift = 0.05 if base < 0.3 else 0.01  # bildirim az etkin kullanıcıyı biraz daha çok çeker
    anyway = rng.random() < base
    extra = not holdout and not anyway and rng.random() < lift
    via_tap = not holdout and (extra or (anyway and rng.random() < 0.5))  # zaten açacak olanın yarısı bildirime dokunur
    users.append((holdout, anyway or extra, via_tap, extra))


def pct(rows, index):
    return 100 * sum(r[index] for r in rows) / len(rows)


sent, control = [u for u in users if not u[0]], [u for u in users if u[0]]
print(f"panodaki 'bildirimden açılma' (dokunarak açan / gönderilen): %{pct(sent, 2):.1f}")
p1, p0 = pct(sent, 1) / 100, pct(control, 1) / 100
half = 196 * math.sqrt(p1 * (1 - p1) / len(sent) + p0 * (1 - p0) / len(control))  # %95 aralığın yarısı, puan
print(f"o gün açma: gönderilen %{100 * p1:.1f}, kontrol %{100 * p0:.1f} → fark {100 * (p1 - p0):.1f} ± {half:.1f} puan")
print(f"benzetimde bilinen gerçek katkı: {pct(sent, 3):.1f} puan")
```

```cikti
panodaki 'bildirimden açılma' (dokunarak açan / gönderilen): %18.4
o gün açma: gönderilen %34.6, kontrol %33.1 → fark 1.5 ± 0.7 puan
benzetimde bilinen gerçek katkı: 2.2 puan
```

Okuma: pano "%18 bildirimden açıldı" diyor; bildirimin gerçek katkısı ~2 puan. Atıf, zaten gelecek olanı bildirime
yazar. Kontrol grubu farkı gerçeği bulur ama **gürültülüdür** (±0,7 puan): küçük etkiler büyük kontrol grubu ve
birkaç haftalık ölçüm ister ([A/B testi](../70-veri/ab-testi.md)). Etkinin kime yaradığı (az etkin kullanıcıya daha
çok) [etki modelleme](../80-ml/etki-modelleme.md) sorusudur.

Ölçüm planı:

- Her isteğe bağlı bildirim türü için kalıcı küçük bir **kontrol grubu** (%5–10, kullanıcı kimliğiyle rastgele).
- Birincil ölçüt bildirimin amacı (geri dönüş, yanıtlama, satış); **koruma ölçütleri**: bildirimi/izni kapatma,
  abonelikten çıkma, uygulamayı kaldırma, 30 gün tutma.
- Kısa vadeli artış uzun vadeli izin kaybıyla birlikte okunur: günlük bildirim ilk hafta açılmayı artırıp ay sonunda
  izin kapatmayı katlayabilir. İki sayıyı aynı tabloda raporlayın.
- Açılma oranı e-postada gizlilik özellikleri yüzünden şişebilir; tıklama ve sonraki eyleme bakın.

## Özel kitle: suçlamayan, baskısız dil

Hassas kitlelerde (Köprü'nün afazili yetişkinleri gibi) yeniden etkileşim bildirimi kolayca baskıya dönüşür.
Kurallar: "seri" ve "kaçırdınız" dili yok; süre baskısı yok ("son 2 saat!"); çocuksu ödül dili yok; bildirim
kullanıcının seçtiği saatte, kendi kurduğu sıklıkta; bir dokunuşla kapatılır. Örnek:

| Kaçının | Yazın |
| --- | --- |
| "3 gündür pratik yapmadınız! Serinizi kaybetmeyin." | "Bugünkü kelimeler hazır. İsterseniz bakın." |
| "Son şans: indirim gece yarısı bitiyor!" | (Bu kitleye kampanya bildirimi göndermeyin.) |
| "Sizi özledik" + üzgün yüz simgesi | Hiç göndermeyin; geri dönüş yolunu uygulama içinde kolaylaştırın |

Arayüz dili kuralları: [arayüz dili](../97-turkce/arayuz-dili.md); ürün ilkeleri: [UX temelleri](ux-temelleri.md).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| İzin oranı çok düşük | İlk açılışta sistem penceresi | Bağlam içinde açıklama kartı; "Şimdi değil" |
| "Bildirimden açılma %18, harika" | Atıf zaten gelecekleri sayıyor | Kalıcı kontrol grubu; fark ve aralık |
| Bildirim sayısı aydan aya artıyor, kimse karar vermedi | Her ekip kendi türünü ekledi | Tek bütçe kuralı; yeni tür bütçeden pay alır |
| İzin kapatma ve kaldırma artıyor | Yorgunluk; değersiz türler | Tür başına kapatma oranı; tepki vermeyene bütçe düşürme |
| Gece bildirim gidiyor | Sunucu saatiyle hesap | Kullanıcının saat dilimiyle sessiz saat ([zaman](../30-arkauc/zaman-ve-saat-dilimi.md)) |
| Aynı olay üç kanaldan geldi | Kanallar ayrı ayrı tetikleniyor | Tek kanal + sıralı yedek |
| Kampanya bildirimi şikâyet aldı | Ticari ileti onayı yok ya da ret yolu zor | Açık onay kaydı; her iletide ret |
| Bildirim açılıyor ama ilgili ekran açılmıyor | Derin bağlantı yok | Her bildirim ilgili ekrana götürür; uçtan uca test |
| "Sizi özledik" dizisi | Geri kazanma dizi hâline gelmiş | En çok bir ileti; sonra listeden düşürme ([tutma ve iptal](tutma-ve-iptal-akisi.md)) |

## Denetim listesi

- [ ] Her bildirim türü yazılı: kimin yararına, onay türü, kanal, sıklık, başarı ve koruma ölçütü.
- [ ] İzin bağlam içinde, açıklama kartından sonra isteniyor; "Şimdi değil" sistem penceresini açmıyor.
- [ ] Kategori tercihi var; kampanya varsayılan kapalı; güvenlik bildirimi kapatılamıyor.
- [ ] Tek yerde bütçe kuralı: günlük sınır, kampanya sınırı, tepki vermeyene azaltma, sessiz saat.
- [ ] İsteğe bağlı her tür için kalıcı rastgele kontrol grubu var; rapor fark ± aralık veriyor.
- [ ] Koruma ölçütleri (izin kapatma, abonelikten çıkma, kaldırma) birincil ölçütle aynı tabloda.
- [ ] Ticari iletiler için açık onay kaydı ve her iletide ret yolu var.
- [ ] Metinler suçlamıyor, baskı kurmuyor; her bildirim ilgili ekrana götürüyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Yeni bildirim türü eklerken önce tabloyu doldur: tür, kimin yararına, onay, kanal, sıklık,
  başarı ölçütü, koruma ölçütü. Gönderimi bütçe kuralından geçir (tek işlev); kendi sayaç ya da zamanlayıcı yazma.
  %10 kontrol grubunu kullanıcı kimliğinin özetiyle seç. Metinde ünlem, 'seri', 'kaçırdınız' ve süre baskısı olmasın."
- **Modelin tipik hatası:** izni uygulama açılışında ister; "bildirimden açılma oranı"nı başarı ölçütü yapar; her
  olaya ayrı bildirim yazar (özet yok); sessiz saati sunucu saatiyle hesaplar; kampanya iletisini işlem bildirimi
  kanalından gönderir; "Sizi özledik!" metni üretir.
- **Çıktıda denetleyin:** izin isteme kodunun nerede çağrıldığı; bütçe işlevinin bütün türlerde kullanıldığı;
  kontrol grubunun rastgele ve kalıcı olduğu; metinlerde suçlayıcı/baskıcı kalıp; ticari ileti onay denetimi.
- **Sorun:** "Kullanıcı bu bildirimi kendisi isteseydi, bu saatte ve bu sıklıkta ister miydi?"

## İlgili

- [Örnek tasarım: bildirim sistemi](../40-sistem-tasarimi/ornek-bildirim-sistemi.md) — planlayıcı, sessiz saat, özet
- [E-posta ve bildirim](../30-arkauc/e-posta-ve-bildirim.md) · [Tarayıcı API'leri](../20-web-onyuz/tarayici-apileri.md)
  — izin isteme kalıbı · [PWA'yı telefona kurdurma](../60-devops/mobil-paketleme.md) — bildirim farkları
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md) · [A/B testi](../70-veri/ab-testi.md) · [Etki modelleme](../80-ml/etki-modelleme.md)
- [Tutma ve iptal akışı](tutma-ve-iptal-akisi.md) — geri kazanma · [İçerik ve büyüme](icerik-ve-buyume.md) — ticari ileti onayı
- [Segmentasyon ve RFM](../70-veri/segmentasyon-ve-rfm.md) — hangi segmente hangi ileti
