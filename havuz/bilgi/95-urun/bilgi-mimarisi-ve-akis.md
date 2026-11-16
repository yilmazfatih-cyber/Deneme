---
baslik: Bilgi mimarisi ve akış
ozet: Ekran envanteri, gezinme yapısı, bir ekranda bir iş, menü derinliği, metinle akış çizimi, dokunuş sayısını hesaplamak ve ilk kullanım deneyiminden gereksiz adımları atmak.
etiketler: [urun, bilgi-mimarisi, gezinme, kullanici-akisi, ilk-kullanim]
duzey: temel
guncellik: 2026-11
---

# Bilgi mimarisi ve akış

> Bu notu ne zaman okumalı: bir ürünün ekranlarını ve menüsünü planlarken; "şu nerede?" sorusu sık soruluyorsa;
> yeni kullanıcılar ilk açılışta bırakıyorsa; bir modele yeni ekran ekletmeden önce.

## Temel fikir

Bilgi mimarisi (information architecture), **ne nerede durur ve oraya nasıl gidilir** sorusudur. Üç belge yeter:

1. **Ekran envanteri:** her ekranın kimliği ve tek işi. Envanterde olmayan ekran yapılmaz.
2. **Gezinme haritası:** hangi ekrandan hangisine tek dokunuşla gidilir.
3. **Akışlar:** bir işi bitirmek için izlenen yol; her akışın dokunuş hedefi vardır.

Bir ekran = bir iş. Derinlik en çok üç seviyedir ve genişlik derinlikten iyidir ([UX temelleri](ux-temelleri.md) →
Hick). Adlar kullanıcının sözcükleridir, ekibin değil. İlk kullanımda en önemli sayı **ilk değere kadar adım
sayısıdır**: her adım bir bırakma noktasıdır; ertelenebilen her şey ertelenir.

## Karar tablosu: gezinme kalıbı

| Durum                                                | Kalıp                                                           | Neden                                          |
| ---------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| Telefonda 2–5 eşit önemli ana bölüm                  | Alt sekme çubuğu                                                | Başparmağa yakın, her an görünür               |
| Tek ana iş + seyrek ayarlar                          | Tek ana ekran + köşede "Ayarlar"                                | En az karar                                    |
| 6+ bölüm                                             | Ana ekranda büyük kartlar (merkez ve uçlar) + arama             | Gizli menüdeki öğe daha az bulunur             |
| Sırayla yapılan iş (kurulum, ödeme)                  | Sihirbaz: her adım tek soru, ilerleme göstergesi, geri dönülebilir | Bilişsel yük düşer                          |
| Çok ve kategorili içerik (Köprü panosu)              | Kategori ızgarası, ≤ 3 seviye + ilk harfle bulma                | Tanıma; derinlik sınırı                        |
| Masaüstünde yoğun araç                               | Yan menü                                                        | Ekran genişliği var                            |
| "Her şeyi açılır menüye koyalım"                     | Kaçının                                                         | Görünmeyen öğe kullanılmaz                     |

## Ekran envanteri

```text
Ekran envanteri — Sedir kuaför uygulaması (kurgusal)
Kimlik  Ekran              Tek işi                          Kim      Nereden gelinir         Hâller
E1      Bugün              Günün randevularını görmek       Kuaför   açılış, alt sekme       ilk boş, yükleniyor, hata, dolu
E2      Randevu ayrıntısı  Randevuyu iptal etmek, taşımak   Kuaför   E1                      hata
E3      Bağlantım          Randevu bağlantısını paylaşmak   Kuaför   alt sekme, E1 ilk boş   —
E4      Ayarlar            Saat ve hizmetleri değiştirmek   Kuaför   alt sekme               —
M1      Hizmetler          Hizmet seçmek                    Müşteri  paylaşılan bağlantı     hata
M2      Boş saatler        Saat seçmek                      Müşteri  M1                      boş (hafta dolu)
M3      Bilgiler           Ad ve telefonla onaylamak        Müşteri  M2                      alan hatası
M4      Onay               Takvime eklemek                  Müşteri  M3                      —
```

Gerçek bir örnek: Köprü projesinin (depo kökü) `docs/PLAN.md` dosyasındaki "Modül A" tablosu (Ekran · Amaç · Temel
öğeler) bir ekran envanteridir. Havuzdaki [`uygulama`](../../uygulama/) temelinde her sayfa
`web/src/app/routes.tsx`'te kayıtlıdır ve bir kural testi bunu korur; envanter ile bu dosya karşılaştırılarak yetim ya
da envanter dışı ekran bulunur.

## Gezinme haritası ve dokunuş sayısı

Gezinme haritası bir çizgedir; her ekrana en az kaç dokunuşla gidildiği genişlik öncelikli aramayla bulunur. Aynı
hesap, **yetim** (hiçbir yerden gidilemeyen) ve **çok derin** ekranları da gösterir:

```python calistir
from collections import deque

# Ekran → bir dokunuşla gidilen ekranlar (Sedir kuaför uygulaması taslağı, kurgusal)
nav = {
    "Bugün": ["Randevu ayrıntısı", "Bağlantım", "Ayarlar"],
    "Randevu ayrıntısı": ["İptal onayı"],
    "Bağlantım": ["Paylaş"],
    "Ayarlar": ["Çalışma saatleri", "Hizmetler", "Hesap"],
    "Hesap": ["Fatura bilgileri"],
    "Fatura bilgileri": ["Fatura geçmişi"],
    "Fatura geçmişi": ["Fatura belgesi"],
    "Raporlar": ["Aylık rapor"],  # taslağa eklendi ama hiçbir ekrandan bağlantı yok
}
GOALS = {"İptal onayı": 2, "Paylaş": 2, "Çalışma saatleri": 2}  # iş → en çok dokunuş
MAX_DEPTH = 3


def taps_from(start: str, graph: dict[str, list[str]]) -> dict[str, int]:
    """Başlangıçtan her ekrana en az dokunuş sayısı (genişlik öncelikli arama)."""
    taps, queue = {start: 0}, deque([start])
    while queue:
        screen = queue.popleft()
        for target in graph.get(screen, []):
            if target not in taps:
                taps[target] = taps[screen] + 1
                queue.append(target)
    return taps


taps = taps_from("Bugün", nav)
screens = set(nav) | {t for targets in nav.values() for t in targets}
orphans = sorted(screens - set(taps))
too_deep = sorted((s, d) for s, d in taps.items() if d > MAX_DEPTH)
assert all(taps[goal] <= limit for goal, limit in GOALS.items())
assert orphans == ["Aylık rapor", "Raporlar"]
print("yetim:", ", ".join(orphans))
print("çok derin:", ", ".join(f"{s} ({d})" for s, d in too_deep))
```

```cikti
yetim: Aylık rapor, Raporlar
çok derin: Fatura belgesi (5), Fatura geçmişi (4)
```

Düzeltme: "Raporlar"a "Bugün" ekranından bir giriş verin ya da envanterden çıkarın; fatura ekranlarını tek ekranda
birleştirin (bilgiler üstte, geçmiş altta, belge satırdan açılır). Dokunuş hedefleri ürün ölçütüdür: Köprü'nün
ilk sprint kabul ölçütü "temel bir ihtiyaç ana ekrandan en çok 3 dokunuşta söylenir" ve uçtan uca testle
korunuyor (`docs/sprints/S01/brief.md`, depo kökü).

## Akışı metinle çizmek

Akışın çizim kuralları [UX temelleri](ux-temelleri.md) → "Akış çizme" bölümündedir. Bilgi mimarisi açısından her
akışta dört şey yazılır: **başlangıç** (kullanıcı nereden geliyor), **bitiş** (değeri nerede alıyor), **mutlu yol**,
**en az iki dal** (hata, boş, iptal). Aynı iş iki ayrı yoldan yapılabiliyorsa iki yol aynı ekrana çıkmalıdır; iki
ayrı ekran iki ayrı hata kaynağıdır.

## İlk kullanım deneyimi

Önce **ilk değer anını** tanımlayın: kullanıcının "işe yaradı" dediği ilk an. Sedir'de "bağlantıdan ilk randevunun
gelmesi"; Köprü'de bakım veren için "15 dakikada 10 kişisel öğe" (`docs/PLAN.md` başarı ölçütü). Sonra o ana kadar
olan her adıma bir karar verin:

| Karar            | Ne demek                                             | Örnek                                                   |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Gerekli          | Bu olmadan ilk değer yok                             | Hizmetler ve süreleri                                   |
| Ertele           | Değerden sonra istenir                               | Hesap açma, logo, profil fotoğrafı                      |
| Varsayılan       | Hazır değerle gelir, sonra düzenlenir                | Çalışma saatleri 09:00–19:00                            |
| İhtiyaç anında   | Özellik ilk kullanıldığında, gerekçesiyle istenir    | Bildirim, mikrofon, kamera izni                         |
| Kaldır           | Değer üretmiyor                                      | Beş ekranlık tanıtım turu                               |

Her adım bir bırakma noktasıdır. Adım başına kalma oranı varsayımıyla kaba bir büyüklük sezgisi:

```python calistir
# İlk kullanım adımları ve kararları (Sedir, kurgusal)
steps = [
    ("Hesap aç: e-posta ve şifre", "ertele"),  # önce dene, ilk randevudan sonra hesap
    ("İşletme adı", "gerekli"),
    ("Logo yükle", "ertele"),
    ("Hizmetler ve süreleri", "gerekli"),
    ("Çalışma saatleri", "varsayılan"),  # 09:00–19:00 hazır gelir, sonra düzenlenir
    ("Bildirim izni", "ihtiyaç anında"),
    ("Tanıtım turu (5 ekran)", "kaldır"),
    ("Bağlantıyı paylaş", "gerekli"),
]
KEEP = 0.85  # her adımda devam eden oranı: VARSAYIM; ölçünce gerçek huniyle değiştirin

before = len(steps)
after = sum(1 for _, decision in steps if decision == "gerekli")
assert after < before
print(f"ilk değere kadar adım: {before} → {after}")
print(f"kaba tamamlama tahmini: %{100 * KEEP**before:.0f} → %{100 * KEEP**after:.0f}")
```

```cikti
ilk değere kadar adım: 8 → 3
kaba tamamlama tahmini: %27 → %61
```

Gerçek oranlar adımdan adıma değişir ve ölçülür ([ölçüm ve öğrenme](olcum-ve-ogrenme.md) → huni); hesap yalnız
"her adım çarpılarak kaybettirir" sezgisini verir. Öteki teknikler: hesapsız başlangıç ve sonradan hesaba taşıma
(havuzdaki [`uygulama`](../../uygulama/) temelinde hazır), örnek veriyle dolu ilk ekran, tanıtım turu yerine ilk boş
durumda tek düğmelik yönlendirme, en çok 3–5 maddelik "başlangıç listesi". İzin reddedilirse ürün o özellik olmadan
çalışmaya devam eder (Köprü `docs/PLAN.md` → "İzinler ihtiyaç anında açıklamayla istenir").

## Adlandırma ve bulunabilirlik

- Bölüm adları kullanıcının sözcükleriyle: görüşme notlarındaki "SÖZCÜKLER" satırı ([kullanıcı
  görüşmesi](kullanici-gorusmesi.md)). "Dashboard", "Kaynaklar", "Modüller" gibi iç ya da çeviri adlardan kaçının.
- Yer adı isim ("Randevular"), eylem adı fiil ("Randevu ekle"). Aynı şeyin uygulamada ve tanıtım sitesinde aynı adı
  olsun.
- **Kart sıralama** (card sorting): 20–40 kartı (içerik ya da işlev adı) 5+ kişiye verin, gruplatın ve gruplara ad
  verdirin. Gruplar ve adlar menüyü verir.
- **Ağaç testi** (tree testing): menüyü metin ağacı olarak verin, "Fatura geçmişini nerede bulurdunuz?" diye sorun.
  Tasarım olmadan bulunabilirliği ölçer; kâğıtla ya da bir tabloyla yapılır.

## Tuzaklar

| Belirti                                                          | Neden                                                   | Çözüm                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Kullanıcılar bir ayarı bulamıyor                                 | 4+ seviye ya da gizli menü                              | ≤ 3 seviye; ağaç testi; arama                                             |
| Model bir ekran ekledi ama hiçbir yerden gidilmiyor              | Envanter ve gezinme haritası güncellenmedi              | Her yeni ekranda "nereden gelinir?" satırı; yetim denetimi                |
| Aynı iş iki yoldan iki farklı ekranla yapılıyor                  | Akışlar birbirinden habersiz yazıldı                    | Tek ekran; ikinci giriş aynı ekrana çıkar                                 |
| Menü adları ekibin dili                                          | İç jargon ya da İngilizceden çeviri                     | Görüşme sözcükleri; kart sıralama                                         |
| Kayıt formu sekiz alan; yeni kullanıcı bırakıyor                 | İlk kullanımda her şey soruluyor                        | Ertele, varsayılan ver, hesapsız başlat                                   |
| Tanıtım turu atlanıyor, sonra kimse özelliği bilmiyor            | Tur eylemsiz bilgi veriyor                              | İlk boş durumda tek düğmelik bağlamsal yönlendirme                        |
| İzin ilk açılışta istendi, reddedildi, bir daha sorulamıyor      | İzin bağlamsız ve gerekçesiz istendi                    | İhtiyaç anında, nedenini söyleyerek; reddedilince özelliksiz çalışsın     |
| Alt sekme çubuğu yedi öğeye çıktı                                | Her yeni bölüm sekme yapıldı                            | En çok beş sekme; ötekiler ana bölümlerin içine                           |
| Geri tuşu beklenmedik yere götürüyor                             | Akışta geçmiş kaydı tutarsız                            | Her akışın testinde geri tuşunu deneyin ([yönlendirme ve URL](../20-web-onyuz/yonlendirme-ve-url.md)) |
| Ana iş altı dokunuş sürüyor ve kimse fark etmedi                 | Dokunuş hedefi yazılmadı                                | Hedefi yazın; hesapla ya da uçtan uca testle koruyun                       |

## Denetim listesi

- [ ] Ekran envanteri var: kimlik, tek iş, kim görür, nereden gelinir, hâller.
- [ ] Her ekrana en az bir yoldan gidiliyor (yetim yok); hiçbir ekran üç seviyeden derin değil.
- [ ] Ana işlerin dokunuş hedefi yazılı ve tutuyor (hesapla ya da uçtan uca testle).
- [ ] Gezinme kalıbı bölüm sayısına uygun; alt sekme en çok beş.
- [ ] Adlar kullanıcının sözcükleriyle; aynı şeye her yerde tek ad.
- [ ] İlk değer anı tanımlı; ilk kullanımdaki her adım gerekli / ertele / varsayılan / ihtiyaç anında / kaldır diye
      işaretli.
- [ ] İzinler ihtiyaç anında ve gerekçeyle isteniyor; reddedilince ürün çalışıyor.
- [ ] Her akışta geri tuşu beklenen yere dönüyor.

## Küçük modele yaptırırken

- **İsteme yazın:** ekran envanterini yapıştırın ve "Yalnız bu envanterdeki ekranları yap. Yeni ekran gerekiyorsa
  önce envantere bir satır öner (tek iş, nereden gelinir) ve bekle" deyin.
- **Yeni ekran ekletirken:** "Bu ekrana hangi ekrandan, hangi düğmeyle gelinecek? Gezinme haritasını sözlük olarak
  (ekran → gidilen ekranlar) güncelle." Çıkan sözlüğü yukarıdaki denetimden geçirin.
- **Modelin tipik hatası:** girişi olmayan ekran ekler; her özelliğe ayrı ayar ekranı açar; menüyü iç içe kurar;
  İngilizce ad koyar ("Dashboard"); ilk açılışta uzun form ve izin istekleri sıralar.
- **Çıktıda denetleyin:** değişiklikte yeni rota var mı ve envanterde karşılığı var mı; yetim ve derinlik denetimi
  temiz mi; ilk açılışta kaç ekran geçildiği (ekran görüntüleriyle).

## İlgili

- [UX temelleri](ux-temelleri.md): tek birincil eylem, Hick, akış çizme kuralları, boş durumlar.
- [MVP kapsamı](mvp-kapsami.md): çekirdek akış ve hangi ekranların ilk sürümde olacağı.
- [Kullanılabilirlik testi](kullanilabilirlik-testi.md): akışı gerçek kullanıcıyla sınamak.
- [Ölçüm ve öğrenme](olcum-ve-ogrenme.md): ilk kullanım hunisini ölçmek.
- Uygulama tarafı: [PWA ve çevrimdışı](../20-web-onyuz/pwa-ve-cevrimdisi.md),
  [duyarlı tasarım ve mobil](../20-web-onyuz/duyarli-tasarim-ve-mobil.md).
