# KVKK notları: veriyle çalışan biri için pratik denetim listesi

> **Hukuki danışmanlık değildir.** 6698 sayılı Kişisel Verilerin Korunması Kanunu ve Kurul kararları
> değişebilir; güncel metin ve rehberler için kvkk.gov.tr'ye bakın, gerekirse bir hukukçuya danışın.

## Önce şunu bilin

- **Kişisel veri**: kimliği belirli ya da belirlenebilir bir gerçek kişiye ilişkin HER bilgi (ad, TCKN,
  telefon, e-posta, IP, konum, satın alma geçmişi…). Tek başına tanımlamayan bilgiler birleşince
  tanımlayabilir.
- **Özel nitelikli kişisel veri** (sağlık, biyometrik, din, siyasi görüş, ceza mahkûmiyeti vb.) çok
  daha sıkı kurallara bağlıdır; mümkünse hiç toplamayın.
- **Takma adlandırma ≠ anonimleştirme.** `maskele --yontem takma_ad` ya da `bicimli` ile üretilen
  veri, anahtar elinizde olduğu sürece geri bağlanabilir; KVKK açısından hâlâ kişisel veridir.

## Denetim listesi (her yeni veri işi için)

1. **Amaç**: Bu veriyi ne için işliyorum? Amaç belirli, açık ve meşru mu? Amaç dışı kullanım yok mu?
2. **Hukuki sebep**: Açık rıza mı, sözleşmenin ifası mı, kanuni yükümlülük mü, meşru menfaat mi?
   Hangisine dayandığımı yazdım mı?
3. **Aydınlatma**: Veri sahibine kimin, hangi amaçla, kime aktararak işlediğim söylendi mi?
4. **Veri en aza indirme**: Gerçekten TCKN gerekiyor mu? Doğum tarihi yerine yaş aralığı yetmez mi?
   Gereksiz sütunu toplamayın, toplananı silin.
5. **Saklama süresi**: Ne zaman sileceğim/anonimleştireceğim? Silme gerçekten yapılıyor mu?
6. **Güvenlik**: Erişim yetkisi gerekenle sınırlı mı? Disk/yedek şifreli mi? Günlüklere kişisel veri
   yazılıyor mu (yazılmamalı)? Parola/anahtar kodda değil ortam değişkeninde mi?
7. **Aktarım**: Veri üçüncü bir tarafa ya da yurt dışındaki bir hizmete (bulut, yapay zekâ API'si)
   gidiyor mu? Yurt dışına aktarımın kendi şartları vardır; bu kontrol edildi mi?
8. **Geliştirme ve test**: Gerçek veri yerine **sentetik veri** (`python -m verihavuzu uret …`)
   kullanılabilir mi? Kullanılamıyorsa veri maskelendi mi?
9. **İhlal**: Sızıntı olursa kime, ne kadar sürede bildireceğim biliniyor mu? (Kurul'a bildirim süresi
   kısadır; güncel süreyi kvkk.gov.tr'den denetleyin.)
10. **Kayıt**: VERBİS kaydı yükümlülüğü sizin için geçerli mi? Kişisel veri envanteri tutuluyor mu?

## Bu depodaki araçlarla

| İş | Komut |
| --- | --- |
| Dosyada kişisel veri var mı? | `python -m verihavuzu maskele veri.csv --rapor calisma/kv.md` (yalnız tarar) |
| Hangi sütunlar kişisel veri gibi? | `python -m verihavuzu profil veri.csv` → "Kişisel veri?" sütunu |
| Paylaşmadan önce maskele | `python -m verihavuzu maskele veri.csv --cikti maskeli.csv` |
| Tutarlı takma ad (birleştirme gerekirse) | `VERIHAVUZU_TAKMA_AD_ANAHTARI=… python -m verihavuzu maskele veri.csv --yontem takma_ad --cikti t.csv` |
| Test verisi | `python -m verihavuzu uret kisiler --adet 1000` (uydurma) |

Sınırlar: bulucu biçim + sağlamaya dayanır; ad-soyad, adres, serbest metindeki sağlık bilgisi gibi
biçimsiz kişisel veriyi BULMAZ. Maskelenmiş dosyayı paylaşmadan önce gözle de denetleyin.

## Bu depoda uyulan kurallar

- `calisma/` klasörü (indirilenler, önbellek, hat çıktıları) depoya girmez.
- Raporlarda kişisel veri değeri yazılmaz; doğrulama hatalarında değerin yalnız son iki hanesi görünür.
- Sentetik kişiler uydurmadır ama numaraları gerçek bir numarayla tesadüfen çakışabilir: bunları
  hiçbir zaman gerçek bir sistemde sorgulamayın.
