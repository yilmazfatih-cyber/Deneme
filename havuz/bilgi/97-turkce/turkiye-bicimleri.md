---
baslik: Türkiye biçimleri
ozet: TCKN, VKN, IBAN, telefon, plaka ve posta kodunun biçimi ve sağlama algoritmaları; tanımdan kurulmuş ve kütüphaneyle karşılaştırılmış kod, geçerli ama uydurma örnek üretimi ve kişisel veri notu.
etiketler: [turkce, dogrulama, tckn, iban, telefon, kisisel-veri]
duzey: orta
guncellik: 2026-11
---

# Türkiye biçimleri

> Bu notu ne zaman okumalı: bir formda T.C. kimlik numarası, vergi numarası, IBAN, telefon, plaka ya da posta kodu
> alırken; bunlar için test verisi üretirken; ya da bir modelin yazdığı doğrulayıcıyı denetlerken.

## Temel fikir

- TCKN, VKN ve IBAN'da **sağlama haneleri** vardır: yanlış yazılmış numarayı sunucuya gitmeden yakalarlar.
- Doğrulayıcı yalnız **biçimi ve sağlamayı** denetler; numaranın gerçekten var olduğunu ya da o kişiye ait olduğunu
  söyleyemez. Bunun için ilgili kurumun resmî servisi gerekir.
- Tek bir **saklama biçimi** seçin: yalnız rakam (TCKN, VKN), boşluksuz büyük harf (IBAN), E.164 (telefon).
  Gruplama ve maskeleme yalnız gösterimdedir.
- Kimlik numaraları **sayı değil metindir:** sayı olarak saklanırsa baştaki sıfır kaybolur, tablolama
  programında bilimsel gösterime döner.
- Test verisi için gerçek numara kullanılmaz; algoritmayla **geçerli ama uydurma** numara üretilir.
- Bunların hepsi kişisel veridir (aşağıdaki not).

## Karar tablosu

| Alan        | Biçim                                                      | Sağlama                        | Saklama                  | Gösterim                          |
| ----------- | ---------------------------------------------------------- | ------------------------------ | ------------------------ | --------------------------------- |
| TCKN        | 11 rakam, ilki 0 değil                                     | 10. ve 11. hane                | `"10000000146"` (metin)  | Maskeli: `100******46`            |
| VKN         | 10 rakam                                                   | 10. hane                       | `"1234567890"` (metin)   | Olduğu gibi                       |
| IBAN (TR)   | TR + 2 sağlama + 5 banka kodu + ayrılmış `0` + 16 hesap = 26 | ISO 7064 mod 97              | `TR330006…` boşluksuz    | `TR33 0006 1005 1978 6457 8413 26` |
| Telefon     | Ulusal 10 hane: 2xx–4xx sabit, 5xx cep, 850 özel           | Yok                            | E.164: `+905321234567`   | `0532 123 45 67`                  |
| Plaka       | İl kodu 01–81 + 1–3 harf + 2–5 rakam                       | Yok                            | `"34 ABC 123"`           | Aynı                              |
| Posta kodu  | 5 rakam; ilk ikisi il plaka kodu                           | Yok (il kodu denetlenir)       | `"06420"` (metin)        | Aynı                              |

## TCKN

Tanım: 11 hane, ilk hane 0 değil.

- **10. hane** = ((1. + 3. + 5. + 7. + 9. haneler) × 7 − (2. + 4. + 6. + 8. haneler)) mod 10
- **11. hane** = (ilk 10 hanenin toplamı) mod 10

```python calistir
import random
import re


def tckn_check_digits(first9: list[int]) -> tuple[int, int]:
    odd, even = sum(first9[0::2]), sum(first9[1::2])  # 1-3-5-7-9. ve 2-4-6-8. haneler
    d10 = (odd * 7 - even) % 10  # Python'da % eksi sonuç vermez (JavaScript'te verir!)
    return d10, (sum(first9) + d10) % 10


def validate_tckn(value: str) -> bool:
    if not re.fullmatch(r"[1-9][0-9]{10}", value):  # isdigit() değil: başka yazıların rakamlarını da kabul eder
        return False
    digits = [int(ch) for ch in value]
    return tuple(digits[9:]) == tckn_check_digits(digits[:9])


def generate_tckn(rng: random.Random) -> str:
    """Geçerli ama UYDURMA numara: yalnız test ve gösterim için."""
    first9 = [rng.randint(1, 9)] + [rng.randint(0, 9) for _ in range(8)]
    return "".join(map(str, first9 + list(tckn_check_digits(first9))))


assert validate_tckn("10000000146")  # yaygın kullanılan sınama numarası
assert not validate_tckn("10000000147") and not validate_tckn("01234567890")
arabic = "\N{ARABIC-INDIC DIGIT ONE}\N{ARABIC-INDIC DIGIT TWO}"
assert arabic.isdigit() and int(arabic) == 12  # isdigit() ve int() bu rakamları da kabul eder

rng = random.Random(1)
samples = [generate_tckn(rng) for _ in range(200)]
assert all(validate_tckn(s) for s in samples)
subs = [s[:i] + d + s[i + 1 :] for s in samples for i in range(11) for d in "0123456789" if d != s[i]]
assert not any(validate_tckn(x) for x in subs)  # tek hane hatalarının hepsi yakalanır
swaps = [s[:i] + s[i + 1] + s[i] + s[i + 2 :] for s in samples for i in range(10) if s[i] != s[i + 1]]
missed = sum(validate_tckn(x) for x in swaps) / len(swaps)
print(f"tek hane hatası: hepsi yakalanır · bitişik iki hanenin yer değiştirmesi: yaklaşık %{round(missed * 100)} kaçar")
```

```cikti
tek hane hatası: hepsi yakalanır · bitişik iki hanenin yer değiştirmesi: yaklaşık %9 kaçar
```

JavaScript'te en sık hata: `%` işlecinin eksi sayıda eksi sonuç vermesi. Tek haneleri toplamı küçük, çift
haneleri toplamı büyük numaralarda 10. hane eksi çıkar ve **geçerli numara reddedilir**:

```js calistir
import assert from 'node:assert/strict'

const sum = (xs) => xs.reduce((a, b) => a + b, 0)
const mod = (n, m) => ((n % m) + m) % m // her zaman 0…m-1

function checkDigits(d, modulo) {
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  const d10 = modulo(odd * 7 - even, 10)
  return [d10, modulo(sum(d.slice(0, 9)) + d10, 10)]
}

function validateTckn(id, modulo) {
  if (!/^[1-9][0-9]{10}$/.test(id)) return false
  const d = [...id].map(Number)
  const [d10, d11] = checkDigits(d, modulo)
  return d[9] === d10 && d[10] === d11
}

const naive = (n, m) => n % m // YANLIŞ: JavaScript'te eksi sayının kalanı eksidir
assert.equal(validateTckn('10000000146', naive), true)
assert.equal(validateTckn('19090909018', naive), false) // geçerli numara reddedildi: (1·7 − 36) % 10 = −9
assert.equal(validateTckn('19090909018', mod), true)
console.log('tamam')
```

```cikti
tamam
```

## VKN (vergi kimlik numarası)

10 hane. 10. hane, yaygın yayımlanmış tanıma göre şöyle hesaplanır (resmî belgeyle karşılaştırılamadı;
havuzdaki kütüphanenin bağımsız gerçeklemesiyle 20.000 rastgele girdide aynı sonucu veriyor):

- Her i = 1…9 için: t = (i. hane + 10 − i) mod 10. t ≠ 0 ise t = (t × 2^(10 − i)) mod 9; sonuç 0 çıkarsa 9.
- 10. hane = (10 − (t'lerin toplamı mod 10)) mod 10.

```python calistir
import random
import re


def vkn_check_digit(first9: list[int]) -> int:
    total = 0
    for i, digit in enumerate(first9):  # i = 0 → 1. hane
        t = (digit + 9 - i) % 10
        if t:
            t = (t * 2 ** (9 - i)) % 9 or 9
        total += t
    return (10 - total % 10) % 10


def validate_vkn(value: str) -> bool:
    if not re.fullmatch(r"[0-9]{10}", value):
        return False
    digits = [int(ch) for ch in value]
    return digits[9] == vkn_check_digit(digits[:9])


def generate_vkn(rng: random.Random) -> str:
    """Geçerli ama UYDURMA vergi numarası."""
    first9 = [rng.randint(0, 9) for _ in range(9)]
    return "".join(map(str, first9 + [vkn_check_digit(first9)]))


assert validate_vkn("1234567890")  # 123456789'un sağlama hanesi 0
rng = random.Random(2)
for _ in range(1000):
    vkn = generate_vkn(rng)
    assert validate_vkn(vkn) and not validate_vkn(vkn[:9] + str((int(vkn[9]) + 1) % 10))
print("tamam")
```

```cikti
tamam
```

## IBAN (TR)

Yapı: `TR` + 2 sağlama hanesi + 5 hane banka kodu + 1 ayrılmış hane (`0`) + 16 karakter hesap numarası = 26
karakter. Sağlama (ISO 7064 mod 97): ilk dört karakter sona alınır, harfler sayıya çevrilir (A=10 … Z=35), çıkan
büyük sayının 97'ye bölümünden kalan 1 olmalıdır. Üretimde sağlama hanesi = 98 − (sağlama yeri "00" iken kalan).

```python calistir
import re


def mod97(iban: str) -> int:
    rearranged = iban[4:] + iban[:4]  # ülke kodu ve sağlama haneleri sona
    return int("".join(str(int(ch, 36)) for ch in rearranged)) % 97  # rakam aynı kalır, A=10 … Z=35


def validate_iban_tr(value: str) -> bool:
    iban = re.sub(r"[\s-]", "", value).upper()
    return bool(re.fullmatch(r"TR[0-9]{7}0[0-9A-Z]{16}", iban)) and mod97(iban) == 1


def make_iban_tr(bank: str, account: str) -> str:
    """Geçerli ama UYDURMA IBAN: 5 hane banka kodu + ayrılmış 0 + 16 karakter hesap."""
    bban = f"{bank:0>5}0{account:0>16}"
    return f"TR{98 - mod97('TR00' + bban):02d}{bban}"


example = "TR33 0006 1005 1978 6457 8413 26"  # IBAN kaydındaki Türkiye örneği
compact = example.replace(" ", "")
assert validate_iban_tr(example) and len(compact) == 26
assert compact[9] == "0"  # ayrılmış hane: 10. karakter (sıfırdan sayınca 9)
for i in range(2, 26):
    for d in "0123456789":
        if d != compact[i]:
            assert not validate_iban_tr(compact[:i] + d + compact[i + 1 :])  # her tek hane hatası yakalanır
fake = make_iban_tr("99999", "1234567")  # uydurma banka kodu
assert validate_iban_tr(fake)
print(" ".join(fake[i : i + 4] for i in range(0, 26, 4)))
```

```cikti
TR72 9999 9000 0000 0001 2345 67
```

Not: Bu notun ilk taslağında ayrılmış hane bir sıra kaymış denetleniyordu ve kayıttaki örnek IBAN'da tesadüfen
doğru göründüğü için fark edilmedi; kütüphaneyle karşılaştırma testi yakaladı. Tek örnekle sınanan doğrulayıcıya
güvenmeyin: üreteçle binlerce örnek üretip denetleyin. Banka kodları listesi:
[veri/tr/banka_kodlari.csv](../../veri/tr/banka_kodlari.csv).

## Telefon

- Ulusal numara 10 hanedir: 2xx, 3xx, 4xx sabit hat alan kodları; 5xx cep; 850 ülke geneli; 800 ücretsiz hat.
  444'lü hizmet numaraları 7 hanedir ve bu biçime girmez.
- Girişte boşluk, ayraç, tire, baştaki `0`, `+90`, `0090` kabul edilir; E.164'e çevrilip saklanır.
- Alan kodu listesi: [veri/tr/iller.csv](../../veri/tr/iller.csv) (`alan_kodlari` sütunu).

```python calistir
import re


def normalize_phone_tr(value: str) -> str | None:
    """Kullanıcı girişini E.164'e çevirir: "0 (532) 123 45 67" → "+905321234567"; değilse None."""
    digits = re.sub(r"[\s().-]", "", value)
    for prefix in ("+90", "0090", "90", "0"):
        if digits.startswith(prefix) and len(digits) - len(prefix) == 10:
            digits = digits[len(prefix) :]
            break
    if not re.fullmatch(r"[2-58][0-9]{9}", digits):  # 2xx-4xx sabit hat, 5xx cep, 8xx özel (850…)
        return None
    return "+90" + digits


def format_phone_tr(e164: str) -> str:
    n = e164[3:]
    return f"0{n[:3]} {n[3:6]} {n[6:8]} {n[8:]}"


for raw in ["0 (532) 123 45 67", "+90 532 123 4567", "5321234567", "0090-212-555-12-34"]:
    e164 = normalize_phone_tr(raw)
    print(f"{raw:20} → {e164} → {format_phone_tr(e164)}")
assert normalize_phone_tr("532 123 45") is None  # eksik hane
assert normalize_phone_tr("0 444 1 444") is None  # 444'lü hizmet numaraları bu biçime girmez
```

```cikti
0 (532) 123 45 67    → +905321234567 → 0532 123 45 67
+90 532 123 4567     → +905321234567 → 0532 123 45 67
5321234567           → +905321234567 → 0532 123 45 67
0090-212-555-12-34   → +902125551234 → 0212 555 12 34
```

## Plaka ve posta kodu

- Plaka: il kodu (01–81) + harf grubu + rakam grubu. Harflerde Ç, Ğ, İ, Ö, Ş, Ü ve Q, W, X kullanılmaz. Harf ve
  rakam sayısı birbirine bağlıdır (aşağıdaki tablo kütüphaneden alındı; yönetmelik metniyle doğrulanmadı).
  Resmî ve diplomatik plakalar bu biçime girmez.
- Plakayı büyütürken **Türkçe kural kullanmayın:** "i" → "İ" olur, plakada İ yoktur. ASCII büyütme ya da İ → I.
- Posta kodu: 5 rakam; ilk iki hane ilin plaka kodudur.

```python calistir
import re

LETTERS = "ABCDEFGHIJKLMNOPRSTUVYZ"  # Ç Ğ İ Ö Ş Ü ve Q W X kullanılmaz
DIGITS = {1: (4, 5), 2: (3, 4), 3: (2, 3)}  # harf sayısı → rakam sayısı aralığı (doğrulanmadı)


def normalize_plate(value: str) -> str | None:
    compact = re.sub(r"[\s-]", "", value).replace("İ", "I").upper()  # i, ı, İ → I: plakada İ yok
    match = re.fullmatch(rf"([0-9]{{2}})([{LETTERS}]{{1,3}})([0-9]{{2,5}})", compact)
    if not match or not 1 <= int(match[1]) <= 81:
        return None
    low, high = DIGITS[len(match[2])]
    return f"{match[1]} {match[2]} {match[3]}" if low <= len(match[3]) <= high else None


def validate_postal_code(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9]{5}", value)) and 1 <= int(value[:2]) <= 81  # ilk iki hane il kodu


assert normalize_plate("34abc123") == "34 ABC 123"
assert normalize_plate("06 a 1234") == "06 A 1234"
assert normalize_plate("34 İ 1234") == "34 I 1234"
assert normalize_plate("82 A 1234") is None  # il kodu 01–81
assert normalize_plate("34 Ç 123") is None  # Türkçe harf yok
assert normalize_plate("34 A 123") is None  # tek harfte en az 4 rakam
assert validate_postal_code("06420") and not validate_postal_code("82000") and not validate_postal_code("6420")
print("tamam")
```

```cikti
tamam
```

## Kişisel veri notu

Bu not hukuki danışmanlık değildir; genel ilkeleri özetler. TCKN, telefon, adres, IBAN ve plaka bir kişiyi
tanımlar; Kişisel Verilerin Korunması Kanunu (KVKK) kapsamındadır.

- **Gerekmedikçe toplamayın.** Fatura için gerekmiyorsa TCKN istemeyin; doğum yılı yetiyorsa tam tarih istemeyin.
- **Günlüğe yazmayın, adrese koymayın:** `?tckn=…` adres çubuğunda, tarayıcı geçmişinde ve sunucu günlüğünde kalır;
  isteğin gövdesinde gönderin.
- **Gösterimde maskeleyin:** `100******46`, `TR** **** … 1326`, `+90 532 *** ** 67`
  ([maske.py](../../kutuphane/py/kutuphane/maske.py)). Maskeleme yalnız gösterimdir, veriyi korumaz.
- **Test ve demoda gerçek numara kullanmayın;** üreteçle uydurun. Üretilen numaranın gerçek bir kişiye denk gelip
  gelmediği bilinemez; onu hiçbir gerçek bilgiyle (ad, adres) eşleştirmeyin.
- Saklama süresi, aydınlatma metni ve açık rıza gibi yükümlülükler için havuzdaki notlara bakın:
  [veri/docs/KVKK_NOTLARI.md](../../veri/docs/KVKK_NOTLARI.md); ayrıntı `50-guvenlik` kümesindedir.

## Tuzaklar

| Belirti                                                       | Neden                                                      | Çözüm                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Bazı geçerli TCKN'ler JavaScript'te reddediliyor              | `%` eksi sonuç verdi                                       | `((x % 10) + 10) % 10`                                       |
| Başka yazıların rakamları ("١٢") kabul edildi                 | `isdigit()`, `int()` ve Python'da `\d` Unicode rakamı kabul eder | `[0-9]` ile denetleyin                                  |
| VKN'nin baştaki sıfırı kayboldu; TCKN "1,00E+10" görünüyor    | Sayı olarak saklandı ya da tablolama programında açıldı    | Metin olarak saklayın; dışa aktarımda metin sütunu           |
| Geçerli IBAN reddediliyor                                     | Ayrılmış hane yanlış sırada ya da hesap kısmı yalnız rakam sanıldı | Kayıttaki yapı: `TR` + 7 rakam + `0` + 16 harf/rakam |
| Plaka "34 İ 1234" diye kaydedildi                             | Türkçe kurallı büyütme                                     | Plakada ASCII büyütme ya da İ → I                            |
| Telefon "+90 0532…" ya da "905321234567" olarak kaydedildi    | Önek temizliği eksik                                       | Önce ayraçları silin, sonra bilinen önekleri, sonra 10 hane  |
| Doğrulayıcı tek örnekte geçti, gerçek verinin bir kısmını reddetti | Yalnız bir örnekle sınandı                            | Üreteçle binlerce örnek + bağımsız gerçeklemeyle karşılaştırma |
| "Numara doğrulandı" denip işlem yapıldı, numara kimseye ait değil | Sağlama gerçekliği kanıtlamaz                          | Kritik işlemde resmî doğrulama servisi                       |
| Test verisinde gerçek kişilerin numaraları                    | Üreteç yerine kopyala-yapıştır                             | Üreteç; depoda gerçek kişisel veri yok                       |
| Kimlik numarası sunucu günlüğünde                             | Adres çubuğunda ya da hata iletisinde gönderildi           | Gövdede gönderin; günlükte maskeleyin                        |

## Denetim listesi

- [ ] TCKN, VKN, posta kodu metin olarak saklanıyor; IBAN boşluksuz büyük harf; telefon E.164.
- [ ] Rakam denetimi `[0-9]` ile; `isdigit()` ya da Python'da `\d` yok.
- [ ] JavaScript sağlama hesabında eksi kalan düzeltilmiş; "19090909018" testte geçerli çıkıyor.
- [ ] Doğrulayıcılar üreteçle üretilmiş binlerce örnekle ve tek hane bozulmalarıyla sınanıyor.
- [ ] Giriş alanları boşluk, tire, ayraç ve önekleri kabul ediyor; kullanıcıya biçim dayatılmıyor.
- [ ] Gösterimde maskeleme var; kimlik numarası adreste, günlükte, hata iletisinde yok.
- [ ] Test ve demo verisinde gerçek numara yok.
- [ ] Kişisel veri yalnız gerekli olduğu kadar toplanıyor; gerekçesi yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Doğrulama için projedeki kütüphaneyi kullan; yeniden yazma. Kimlik numaralarını metin olarak
  sakla. Rakam denetimini `[0-9]` ile yap. Test verisini üreteçle üret; gerçek numara yazma. Kimlik numarasını
  günlüğe ve adrese koyma." Havuzda: [dogrulama.py](../../kutuphane/py/kutuphane/dogrulama.py) ve TypeScript eşi
  [dogrulama.ts](../../kutuphane/ts/src/dogrulama.ts).
- **Modelin tipik hatası:** JavaScript'te eksi kalan hatası; TCKN'yi `number` tipinde tutmak; IBAN uzunluğunu ya da
  ayrılmış haneyi yanlış bilmek; telefonu yalnız tek biçimde kabul etmek; plakayı Türkçe kuralla büyütmek; test
  verisine gerçekçi görünen ama elle uydurulmuş (sağlaması tutmayan) numara yazmak; VKN algoritmasını ezberden
  yanlış yazmak.
- **Çıktıda denetleyin:** yukarıdaki sınama numaraları (10000000146, 19090909018, TR33 0006 1005 1978 6457 8413 26)
  ve tek hane bozulmaları testte var mı; `parseInt`, `Number(` ile kimlik numarası işleme; günlük satırlarında
  kimlik numarası.

## İlgili

- [Yerelleştirme denetimi](yerellestirme-denetimi.md): ad, adres, telefon formları.
- [Türkçe büyük/küçük harf](buyuk-kucuk-harf.md): neden plakada Türkçe büyütme kullanılmaz.
- [Test stratejisi](../00-yontem/test-stratejisi.md): üreteç ve farksal test.
- Sınama vektörleri: [kutuphane/vektorler/dogrulama.json](../../kutuphane/vektorler/dogrulama.json).
