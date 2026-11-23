---
baslik: "Çalışan erişimi ve ayrılış: en az yetki, kişisel hesap ve aynı gün kapatma"
ozet: Ekip büyürken kim neye erişir; rol başına en az yetki, paylaşılan hesap yasağı, iki aşamalı doğrulama zorunluluğu, işe girişte ve ayrılışta sıralı denetim listesi, sır döndürme ve dönemsel erişim gözden geçirmesi.
etiketler: [guvenlik, erisim, ekip, iki-asamali-dogrulama, sir-yonetimi, kvkk]
duzey: orta
guncellik: 2026-11
---

# Çalışan erişimi ve ayrılış: en az yetki, kişisel hesap ve aynı gün kapatma

> Bu notu ne zaman okumalı: ekibe ilk kez biri katılırken (çalışan, stajyer, serbest çalışan, ajans); biri ayrılırken
> ya da rolü değişirken; "bu hesabın şifresini kim biliyor?" sorusu yanıtsız kaldığında; üç ayda bir erişim gözden
> geçirmesi yapılırken. Sızıntı anındaki sıralı müdahale [Olay müdahalesi](olay-mudahalesi.md), sırların yeri ve
> döndürme yöntemi [Sır yönetimi](sir-yonetimi.md) notundadır.

Sözleşme, gizlilik taahhüdü ve iş hukuku konuları **hukuki danışmanlık değildir**; bir uzmanla doğrulayın.

## Temel fikir

- Erişim, yazdırılabilen bir **listedir**: kişi × sistem × izin. Listede olmayan erişim yoktur; liste ile sistemlerin
  gerçek hesap listesi düzenli karşılaştırılır.
- **Kişisel hesap:** her insanın her sistemde kendi hesabı vardır; paylaşılan hesap, ayrılan kişinin erişimini
  kapatmayı ve "bunu kim yaptı" sorusunu imkânsız kılar.
- **Rol başına en az yetki:** izin kişiye değil role verilir; rol değişince eski izinler geri alınır (yoksa yıllar
  içinde herkes her şeye erişir).
- **Her yerde iki aşamalı doğrulama;** yöneticilerde oltalamaya dayanıklı yöntem (güvenlik anahtarı, geçiş anahtarı).
- **Ayrılış aynı gün kapanır** ve yalnız hesapları değil, kişinin bildiği **paylaşılan sırları**, sunuculara elle
  eklenmiş anahtarları ve onun adına çalışan otomasyonları da kapsar.

## Karar tablosu: rol başına erişim (küçük ürün ekibi örneği)

| Sistem                                  | Kurucu / sahip | Geliştirici         | Destek                 | Tasarımcı | Dış ajans, stajyer          |
| --------------------------------------- | -------------- | ------------------- | ---------------------- | --------- | --------------------------- |
| Kod deposu                              | Yönetici       | Yazar               | —                      | Okur      | Yalnız ilgili depo, süreli  |
| CI/CD ve dağıtım                        | Yönetici       | Çalıştırır (onaylı) | —                      | —         | —                           |
| Barındırma paneli                       | Yönetici       | Okur (günlük)       | —                      | —         | —                           |
| Üretim sunucusu (SSH)                   | Acil durum     | Gerekçeyle, kayıtlı | —                      | —         | —                           |
| Üretim veritabanı                       | Acil durum     | Salt okur, kayıtlı  | —                      | —         | —                           |
| Uygulamanın yönetici paneli             | Yönetici       | —                   | Destek rolü (maskeli)  | —         | —                           |
| Alan adı ve DNS                         | Yönetici (2 kişi) | —                | —                      | —         | —                           |
| Ödeme sağlayıcısı paneli                | Yönetici       | Sınama ortamı       | İade (sınırlı)         | —         | —                           |
| E-posta sağlayıcısı, analitik, hata izleme | Yönetici    | Okur                | Okur (gerekiyorsa)     | Analitik okur | —                       |
| Parola yöneticisi kasaları              | Hepsi          | Ekip kasası         | Destek kasası          | Tasarım kasası | Yalnız kendi kasası   |
| Mağaza geliştirici hesabı               | Sahip (kurum adına) | Yayın yetkisi  | —                      | —         | —                           |

"Acil durum" erişimi günlük işte kullanılmaz: ayrı bir hesap ya da kısa süreli yetki yükseltmesidir, her kullanımı
kaydedilir ve uyarı üretir. Üretim verisine her erişim kayıtlıdır ve destek ekranları maskeli gösterir
([KVKK pratiği](kvkk-pratik.md) → "Çalışan erişimi").

## Paylaşılan hesap: neden yasak, ne zaman kaçınılmaz

Paylaşılan hesapta (`info@`, "ortak admin", herkesin bildiği panel şifresi): kim ne yaptı bilinmez; ayrılan kişinin
erişimi şifre değişmeden kapanmaz; şifre sohbette, e-postada, not defterlerinde dolaşır; iki aşamalı doğrulamanın
telefonu tek bir kişinin cebindedir ve o kişi ayrılınca hesap **kimsenin** olmaz.

Bazı hizmetler tek hesaba izin verir (bazı alan adı kayıt firmaları, sosyal medya, eski araçlar). O zaman:

- Hesap **kurumun** e-posta adresine açılır (kişinin adına değil); kurtarma e-postası ve telefonu da kurumundur.
- Şifre ve iki aşamalı doğrulamanın tohumu (TOTP) parola yöneticisinin paylaşılan kasasında durur; tek bir telefonda değil.
- Bir sahibi vardır; kasaya kimin eriştiği kaydedilir; kasaya erişen biri ayrılınca şifre ve TOTP tohumu döndürülür.

## İki aşamalı doğrulama

- Kurum düzeyinde **zorunlu kılın** (kod deposu, e-posta, barındırma gibi hizmetlerin çoğu bunu kurum ayarı olarak
  sunar; hizmetinizde doğrulayın). "Herkes açsın" ricası yetmez; birinin unuttuğu hesap açık kapıdır.
- Güç sırası: güvenlik anahtarı ve geçiş anahtarı (oltalamaya dayanıklı) > doğrulama uygulaması (TOTP) > SMS.
  Yöneticiler ve alan adı/DNS hesapları en üst yöntemi kullanır.
- Kurtarma kodları parola yöneticisinde durur; ekran görüntüsünde ya da masaüstünde değil.
- En çok unutulan yer: alan adı kayıt firması ve DNS hesabı. Ele geçerse saldırgan e-postanızı ve sertifikanızı da
  ele geçirir ([Alan adı ve DNS](../60-devops/alan-adi-ve-dns.md)).

Uygulamanızın **kullanıcılarına** iki aşamalı doğrulama sunmak ayrı bir konudur:
[Parola ve hesap güvenliği](parola-ve-hesap-guvenligi.md) → "İki aşamalı doğrulamayı işletmek".

## İşe giriş

1. Rolü yazın; erişimi tablodan verin (kişiye özel istisna varsa gerekçesi ve bitiş tarihiyle).
2. Kişisel hesaplar kurumsal e-postayla açılır; iki aşamalı doğrulama ilk gün açılır.
3. SSH anahtarı **kişi ve cihaz başına** üretilir (`ssh-keygen -t ed25519`), açık anahtar kayda yazılır, sonra
   sunucuya eklenir.
4. Parola yöneticisinde rolünün kasasına eklenir; sırlar sohbetle verilmez.
5. Cihaz: disk şifreleme, ekran kilidi, güncel işletim sistemi.
6. Erişim listesine satır: kim, ne, ne zaman, kim verdi.

Rol değişiminde aynı liste tersinden yürür: yeni rolün erişimi verilir, **eski rolün fazlası geri alınır**.

## Ayrılış: sıralı denetim listesi

Zamanlama: dostane ayrılışta son iş günü bitiminde; dostane olmayan ayrılışta kişiye haber verildiği **anda**.

| Sıra | Adım                                    | Ayrıntı                                                                                  | Doğrulama                                         |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1    | Ana kimliği askıya al                   | Kurumsal e-posta / tek oturum açma hesabı askıya (silme değil: veri ve devir için)        | Girişi deneyin: reddediliyor                      |
| 2    | Bütün oturumları kapat                  | E-posta, kod deposu, barındırma, uygulamanın yönetici paneli                              | Etkin oturum listesi boş                          |
| 3    | Doğrudan hesapları kapat                | Ana kimliğe bağlı olmayanlar: alan adı, DNS, ödeme, e-posta sağlayıcısı, analitik, mağaza, sosyal medya | Erişim listesinin her satırı işaretli |
| 4    | Anahtar ve belirteçler                  | Sunuculardaki SSH anahtarları, kişisel erişim belirteçleri, API anahtarları, CI dağıtım anahtarları, OAuth izinleri, VPN | `authorized_keys` denetimi (aşağıda) |
| 5    | Otomasyonu taşı                         | Kişinin belirteciyle çalışan zamanlanmış iş, CI, entegrasyon var mı? Önce servis hesabına taşı | İş yeni kimlikle bir kez koştu          |
| 6    | Bildiği sırları döndür                  | Üretim sırları, veritabanı parolası, webhook sırları, paylaşılan hesap şifreleri ve TOTP tohumları | Eski değer hiçbir yerde çalışmıyor      |
| 7    | Sahipliği devret                        | Depolar, belgeler, alan adı kaydı, mağaza hesabı, takvimler                               | Sahip alanında başka biri                         |
| 8    | Kurtarma bilgilerini denetle            | Kritik hesapların kurtarma e-postası ve telefonu kişinin kişisel bilgisi mi?              | Hepsi kurumun                                     |
| 9    | Cihaz ve e-posta kuralları              | Cihaz iadesi ya da uzaktan silme; e-posta yönlendirme kuralları (veri dışarı akıyor mu)   | Yönlendirme yok                                   |
| 10   | Son 30 günün kaydına bak                | Toplu indirme, dışa aktarma, yeni anahtar, yeni yönetici, yeni webhook                    | Olağandışı bir şey yok ya da olay açıldı          |
| 11   | Kaydet ve bir hafta sonra yeniden denetle | Hangi adım kim tarafından ne zaman yapıldı                                              | Gözden geçirme betiği temiz                       |

- 5. adım 6'dan **önce** gelir: kişinin belirteciyle çalışan gece yedeği, belirteç iptal edilince sessizce durur.
- 6. adımın listesi sır envanterinden çıkar; envanterde "kim biliyor" sütunu yoksa ekleyin
  ([Sır yönetimi](sir-yonetimi.md) → "Sır envanteri"). Döndürmenin sırası: yeni değer üret → tüketicilere dağıt →
  çalıştığını doğrula → eskisini kapat.
- Bilgi döndürülemez: kişinin gördüğü müşteri verisi ve iş sırları için gizlilik taahhüdü hukukun konusudur.

## Dönemsel gözden geçirme

Üç ayda bir ve her ayrılıştan bir hafta sonra: insan kaynakları listesi, rol tablosu ve sistemlerin hesap listeleri
karşılaştırılır. Hesap listeleri çoğu hizmetin panelinden dışa aktarılır; küçük bir betik farkları bulur:

```python calistir
KISILER = {  # insan kaynakları listesi: kimin çalıştığının tek doğru kaynağı
    "ayse": {"durum": "aktif", "rol": "kurucu"},
    "can": {"durum": "aktif", "rol": "gelistirici"},
    "deniz": {"durum": "ayrildi", "rol": "gelistirici"},
    "ece": {"durum": "aktif", "rol": "destek"},
}
ROL = {  # rol → sistem → en yüksek izin (en az yetki)
    "kurucu": {"git": "yonetici", "barindirma": "yonetici", "dns": "yonetici", "uygulama": "yonetici"},
    "gelistirici": {"git": "yazar", "barindirma": "okur"},
    "destek": {"uygulama": "destek"},
}
SIRA = ["okur", "destek", "yazar", "yonetici"]
ONAYLI_ORTAK = {("dns", "alanadi@sirket.example"): "ayse"}  # kaçınılmaz ortak hesap: sahibi ve kasası belli
HESAPLAR = [  # sistemlerin hesap listelerinden: (sistem, hesap, kişi, izin, iki aşamalı doğrulama)
    ("git", "ayse", "ayse", "yonetici", True), ("git", "can", "can", "yazar", True),
    ("git", "deniz", "deniz", "yazar", True),
    ("barindirma", "can", "can", "yonetici", True),
    ("barindirma", "ortak@sirket.example", None, "yonetici", False),
    ("dns", "alanadi@sirket.example", None, "yonetici", True), ("dns", "ayse", "ayse", "yonetici", False),
    ("uygulama", "ece", "ece", "destek", True),
]


def gozden_gecir() -> list[str]:
    bulgu = []
    for sistem, hesap, kisi, izin, iki_asama in HESAPLAR:
        yer = f"{sistem}/{hesap}"
        if kisi is None and (sistem, hesap) not in ONAYLI_ORTAK:
            bulgu.append(f"{yer}: sahipsiz ya da paylaşılan hesap")
        elif kisi is not None and KISILER.get(kisi, {}).get("durum") != "aktif":
            bulgu.append(f"{yer}: ayrılmış kişinin hesabı hâlâ açık")
        elif kisi is not None:
            sinir = ROL[KISILER[kisi]["rol"]].get(sistem)
            if sinir is None or SIRA.index(izin) > SIRA.index(sinir):
                bulgu.append(f"{yer}: '{izin}' izni rolün sınırını ({sinir or 'erişim yok'}) aşıyor")
        if not iki_asama:
            bulgu.append(f"{yer}: iki aşamalı doğrulama kapalı")
    return bulgu


for satir in gozden_gecir():
    print(satir)
```

```cikti
git/deniz: ayrılmış kişinin hesabı hâlâ açık
barindirma/can: 'yonetici' izni rolün sınırını (okur) aşıyor
barindirma/ortak@sirket.example: sahipsiz ya da paylaşılan hesap
barindirma/ortak@sirket.example: iki aşamalı doğrulama kapalı
dns/ayse: iki aşamalı doğrulama kapalı
```

Her bulgu ya düzeltilir ya da gerekçesi ve bitiş tarihiyle istisna listesine yazılır; "geçen sefer de vardı" bir
gerekçe değildir.

## Sunuculardaki SSH anahtarları

SSH anahtarları sunuculara çoğu zaman elle eklenir ve hiçbir panelde görünmez; ayrılan kişinin anahtarı yıllarca
kalır. Her sunucunun `authorized_keys` dosyası bir **anahtar kaydıyla** (anahtar → sahibi) karşılaştırılır:

```python calistir
import re

AUTHORIZED_KEYS = """\
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAyse0000000000000000000000000000000000000 ayse@dizustu-2026
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICan00000000000000000000000000000000000000 can@masaustu
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDeniz000000000000000000000000000000000000 deniz@dizustu
from="10.0.0.0/8",no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICi0000000000000000000000000000000000000000 ci-dagitim
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQEski00000000000000000000000000000000000
"""
KAYITLI = {  # anahtar kaydı: anahtar → sahibi (kişi ya da servis hesabı); kayda yazılmayan anahtar eklenmez
    "AAAAC3NzaC1lZDI1NTE5AAAAIAyse0000000000000000000000000000000000000": "ayse",
    "AAAAC3NzaC1lZDI1NTE5AAAAICan00000000000000000000000000000000000000": "can",
    "AAAAC3NzaC1lZDI1NTE5AAAAIDeniz000000000000000000000000000000000000": "deniz",
    "AAAAC3NzaC1lZDI1NTE5AAAAICi0000000000000000000000000000000000000000": "servis:ci",
}
AKTIF = {"ayse", "can", "servis:ci"}
ANAHTAR = re.compile(r"(?:^|\s)((?:sk-)?(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+)(?:@openssh\.com)?)\s+(\S+)\s*(.*)$")

for no, satir in enumerate(AUTHORIZED_KEYS.splitlines(), 1):
    eslesme = ANAHTAR.search(satir)
    if not eslesme:
        print(f"{no}. satır okunamadı")
        continue
    tur, govde, yorum = eslesme.groups()
    sahip = KAYITLI.get(govde)
    if sahip is None:
        print(f"{no}. satır: kayıtsız anahtar ({tur}, yorum: {yorum or 'yok'}) → sil ya da sahibini bul")
    elif sahip not in AKTIF:
        print(f"{no}. satır: ayrılmış kişinin anahtarı ({sahip}) → sil")
```

```cikti
3. satır: ayrılmış kişinin anahtarı (deniz) → sil
5. satır: kayıtsız anahtar (ssh-rsa, yorum: yok) → sil ya da sahibini bul
```

Örnekteki anahtar gövdeleri sahtedir. Gerçek dosyada anahtarların parmak izlerini `ssh-keygen -lf
~/.ssh/authorized_keys` listeler; yorum alanına güvenmeyin (herkes istediğini yazar), kayıtla **anahtarın kendisi**
karşılaştırılır. Her sunucuda her kullanıcının dosyası (`/root/.ssh`, `/home/*/.ssh`) taranır. Sunucu sayısı
arttıkça anahtarları elle değil bir yapılandırma aracıyla ya da kısa ömürlü SSH sertifikalarıyla yönetmek gerekir.

## Tuzaklar

| Belirti                                                          | Neden                                                         | Çözüm                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Ayrılan geliştirici aylar sonra hâlâ sunucuya girebiliyordu      | SSH anahtarı elle eklenmişti; hiçbir listede yoktu            | Anahtar kaydı + düzenli `authorized_keys` denetimi            |
| Ayrılıştan sonra gece yedeği sessizce durdu                      | Yedek, kişinin kişisel belirteciyle çalışıyordu              | Önce servis hesabına taşı, sonra belirteci iptal et           |
| Alan adı kaydı yenilenemedi, hesap kimsenin değil                 | Hesap ayrılan kişinin adına ve e-postasına açılmıştı          | Kurum adına, kurumsal e-postayla; iki yönetici                |
| Ortak panel hesabının iki aşamalı kodu ayrılan kişinin telefonunda | TOTP tek telefona kurulmuştu                                | Tohum parola yöneticisinin ortak kasasında                    |
| "Bunu kim sildi?" yanıtsız                                       | Paylaşılan hesap                                              | Kişisel hesap; kaçınılmazsa sahipli ve kayıtlı kasa           |
| Stajyer üretim veritabanını silebiliyordu                        | Herkese yönetici verildi ("işi hızlansın")                    | Rol tablosu; üretim yazma yetkisi yalnız acil durumda         |
| Rol değişen kişide eski ekibin bütün yetkileri duruyor           | Yalnız ekleme yapıldı, geri alma yapılmadı                    | Rol değişimi = yeni rol ver + eski fazlayı al                 |
| Ayrılan kişinin bildiği üretim sırrı hâlâ geçerli                | Hesaplar kapandı ama paylaşılan sırlar döndürülmedi           | Sır envanterinde "kim biliyor" sütunu; ayrılışta döndürme     |
| Ayrılmadan önce bütün müşteri listesi dışa aktarılmıştı          | Dışa aktarma kaydı ve uyarısı yoktu                           | Toplu indirme uyarısı; ayrılışta son 30 günün kaydına bakış   |
| Kurumsal e-posta silindi, belgeler ve faturalar kayboldu          | Kimlik silindi, askıya alınmadı                               | Önce askıya al, sahipliği devret, sonra saklama süresiyle sil |
| İki aşamalı doğrulama "çoğu kişide açık"                         | Zorunlu değil, rica edildi                                    | Kurum düzeyinde zorunlu; gözden geçirme betiği                |

## Denetim listesi

- [ ] Erişim listesi yazılı: kişi × sistem × izin; rol tablosu var; istisnaların gerekçesi ve bitiş tarihi var.
- [ ] Her sistemde kişisel hesap; kaçınılmaz ortak hesaplar kurum adına, sahipli, kasada ve kayıtlı.
- [ ] İki aşamalı doğrulama kurum düzeyinde zorunlu; yöneticiler ve alan adı/DNS hesabı en güçlü yöntemle.
- [ ] Kritik hesapların kurtarma e-postası ve telefonu kurumun; alan adı/DNS hesabında en az iki yönetici.
- [ ] Sır envanterinde "kim biliyor" sütunu var.
- [ ] Ayrılış listesi (11 adım) yazılı ve son ayrılışta işaretlendi; bir hafta sonra yeniden denetlendi.
- [ ] Otomasyonlar kişisel belirteçle değil servis hesaplarıyla çalışıyor.
- [ ] Sunuculardaki `authorized_keys` dosyaları anahtar kaydıyla karşılaştırılıyor; kayıtsız anahtar yok.
- [ ] Üç ayda bir erişim gözden geçirmesi yapılıyor; bulgular kapanıyor ya da gerekçeli istisna oluyor.
- [ ] Toplu dışa aktarma ve yeni yönetici/anahtar oluşturma uyarı üretiyor.

## Küçük modele yaptırırken

- **İsteme yazın:** "Şu kişi ayrılıyor: [rol, son gün]. Erişim listesinden ve sır envanterinden onun için ayrılış
  planını 11 adımlık sırayla çıkar; her adımda hangi sistem, kim yapacak, nasıl doğrulanacak yaz. Kişinin
  belirteciyle çalışan otomasyonları ayrıca listele ve önce servis hesabına taşınmalarını öner. Hesap silme değil
  askıya alma öner."
- **Modelin tipik hatası:** yalnız e-posta ve kod deposu hesabını kapatır; sunuculardaki SSH anahtarlarını,
  belirteçleri ve paylaşılan sırları unutur; otomasyonu taşımadan belirteci iptal ettirir; kurumsal e-postayı hemen
  sildirir; "ortak bir yönetici hesabı açalım" diye önerir; iki aşamalı doğrulamayı isteğe bağlı bırakır.
- **Çıktıda arayın:** planda SSH anahtarı, kişisel erişim belirteci, CI anahtarı, paylaşılan şifre ve TOTP tohumu
  satırları var mı; otomasyon taşıma adımı döndürmeden önce mi; kurtarma e-postası/telefonu denetimi var mı.

## İlgili

- [Sır yönetimi](sir-yonetimi.md) (envanter, döndürme, en az yetki) · [Olay müdahalesi](olay-mudahalesi.md) ·
  [KVKK pratiği](kvkk-pratik.md) (çalışan erişimi ve kişisel veri)
- [Güvenlik günlüğü ve denetim izi](gunluk-ve-izleme-guvenlik.md) (toplu indirme ve yeni yönetici uyarıları) ·
  [Parola ve hesap güvenliği](parola-ve-hesap-guvenligi.md)
- [Sunucu sertleştirme](../60-devops/sunucu-sertlestirme.md) (kişi başına kullanıcı ve anahtar) ·
  [CI/CD](../60-devops/ci-cd.md) (dağıtım anahtarları, ortam korumaları)
- Havuzda: [`uygulama/docs/GUVENLIK.md`](../../uygulama/docs/GUVENLIK.md) (yönetici hesabı, olay anında komutlar)
