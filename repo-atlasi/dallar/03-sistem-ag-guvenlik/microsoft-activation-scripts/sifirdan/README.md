# lisans_uyum — yazılım varlık yönetimi (SAM) için sıfırdan uyum raporu

Bu klasör, Microsoft-Activation-Scripts deposunun **yeniden yazımı değildir** ve onun yöntemlerini anlatmaz.
Etkinleştirme atlatma aracı yerine, kurumların yazılımı yasal biçimde kullandığını **kanıtlamasını** sağlayan
mekanizmayı öğretir: envanteri (ne kurulu) satın alınmış lisans haklarıyla (ne alındı) uzlaştırmak. ISO/IEC 19770-1'in
anlattığı yazılım varlık yönetimi (SAM) süreçlerinin en küçük hâlidir (~145 satır kod, ~100 satır test).

## Gereksinimler

Python 3.10+, bağımlılık yok.

## Çalıştırma

```bash
cd sifirdan
python3 lisans_uyum.py ornekler/envanter.csv ornekler/haklar.csv --eslesme ornekler/eslesme.json --bugun 2026-11-09
python3 lisans_uyum.py ornekler/envanter.csv ornekler/haklar.csv --eslesme ornekler/eslesme.json --json
```

Örnek çıktı (kısaltılmış):

```text
| Yazılım | Ölçüt | Kullanım | Geçerli hak | Durum | Fark |
| Windows 11 Pro | cihaz | 4 | 3 | EKSİK LİSANS | 1 |
| Microsoft 365 E3 | kullanici | 3 | 5 | atıl hak | 2 |
| Grafik Pro 2023 | cihaz | 1 | 0 | SÜRESİ DOLMUŞ | 1 |
```

Eksik lisans, süresi dolmuş hak ya da hak kaydı olmayan kurulum varsa çıkış kodu 1 olur (bir CI işine ya da aylık
zamanlanmış göreve bağlanabilir). Örnekteki `LAPTOP-07` satırı tipik bir durumu gösterir: lisanssız bir cihaz.
Yasal çözüm bir lisans satın almak ya da yazılımı kaldırmaktır; atlatma aracı kullanmak değil.

## Girdi biçimleri

| Dosya          | Sütunlar                                                           | Not                                                                  |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `envanter.csv` | `cihaz, kullanici, yazilim, surum, yayinci, kurulum_tarihi`        | Envanter aracından dışa aktarım; Excel'in BOM'lu UTF-8'i de okunur   |
| `haklar.csv`   | `yazilim, yayinci, olcut, adet, bitis, sozlesme_no`                | `olcut`: `cihaz`, `kullanici` ya da `site`; `bitis` boş = süresiz    |
| `eslesme.json` | `esanlamlilar` (envanter adı → sözleşme adı), `ucretsiz` (listesi) | Ad normalleme: küçük harf, tek boşluk, sondaki sürüm numarası atılır |

Envanteri yasal ve basit yollarla toplayabilirsin: Windows'ta PowerShell ile "Programlar ve Özellikler" kayıt defteri
anahtarlarını okumak ya da `winget list`; Linux'ta `dpkg-query -W` / `rpm -qa`; kurumsal ortamda yönetim aracının
(Intune, SCCM, osquery ...) dışa aktarımı.

## Test

```bash
python3 -m unittest discover -s . -t .      # 11 test
```

## Aşamalar

| Aşama | Fonksiyon             | Kavram                                                                         |
| ----- | --------------------- | ------------------------------------------------------------------------------ |
| 1     | `csv_oku`, `normalle` | Veri temizliği: aynı ürün envanterde üç farklı yazımla görünür                 |
| 2     | `uzlastir` (haklar)   | Geçerli hak = süresi dolmamış sözleşmelerin toplamı; 60 gün kala uyarı         |
| 3     | `uzlastir` (kullanım) | Lisans ölçütü: cihaz başına farklı cihaz, kullanıcı başına farklı kişi sayılır |
| 4     | `uzlastir` (durum)    | eksik / atıl / kayıtsız / süresi dolmuş / uyumlu; karışık ölçüt uyarısı        |
| 5     | `markdown`, `main`    | Denetçiye gösterilebilir rapor, makine okunur JSON, çıkış kodu                 |

## Mini ile gerçek depo eşlemesi

| Mini'deki parça           | Gerçek depodaki karşılığı                                                                        | Fark                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Envanter + hak kaydı      | Karşılığı yok                                                                                    | MAS tek bir makinede çalışır; kurum çapında envanter ya da sözleşme kaydı tutmaz            |
| Uzlaştırma ve uyum raporu | Karşılığı yok                                                                                    | SAM eksik hakkı **satın almaya** yönlendirir; atlatma aracı eksik hakkı gizler              |
| Lisans durumunu görmek    | `MAS/Separate-Files-Version/Check_Activation_Status.cmd` (yalnız dosya adı; içeriği incelenmedi) | Windows'un kendi aracı da durumu gösterir: `slmgr.vbs /dlv`. Kurumsal uyum ise sayım işidir |

## Bilinçli eksikler

Çekirdek başına sunucu lisansları ve erişim lisansları (CAL), sürüm hakları (downgrade), ikinci kullanım hakları,
sözleşme yönetimi, otomatik envanter ajanı. Ana dosyanın 6. bölümündeki alıştırmalar bunlara uzanır.
