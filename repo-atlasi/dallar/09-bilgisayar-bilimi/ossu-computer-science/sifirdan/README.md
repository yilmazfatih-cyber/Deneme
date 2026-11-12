# Sıfırdan: çalışma planı motoru (planlama yarısı)

OSSU'nun README tablolarındaki "Duration / Effort / Prerequisites" sütunlarını bir veri dosyasına çevirip
**önkoşul grafı → topolojik sıra → haftalık takvim → Markdown plan** hattını kuruyoruz. Üretilen planın onay kutuları,
motorun ikinci yarısı olan [`ilerleme.py`](../../coding-interview-university/sifirdan/README.md) ile sayılır; iki
araç birbirini içe aktarmaz, ortak dilleri GitHub görev listesi biçimidir.

## Gereksinimler

- Python 3.11 veya üstü (3.13 ile denendi). Yalnızca standart kütüphane.

## Çalıştırma

```bash
cd repo-atlasi/dallar/09-bilgisayar-bilimi/ossu-computer-science/sifirdan
python3 plan_yaz.py veri/turkce-12-ay.json --saat 15 --cikti ornek-plan-12-ay.md   # örnek planı yeniden üret
python3 plan_yaz.py veri/turkce-12-ay.json --karsilastir 10,15,20                   # hangi bütçe kaç hafta sürer
python3 plan_yaz.py veri/ossu.json --karsilastir 10,15,20                           # OSSU Intro + Core CS
python3 plan_yaz.py ../../coding-interview-university/sifirdan/veri/ciu-konulari.json --paralel 1 --saat 10
```

Seçenekler: `--saat` (haftalık bütçe), `--paralel` (kulvar yoksa aynı anda kaç ders), `--baslangic 2027-01-04`,
`--cikti dosya.md`, `--karsilastir 10,15,20`.

## Test

```bash
python3 -m unittest discover -s repo-atlasi/dallar/09-bilgisayar-bilimi/ossu-computer-science/sifirdan \
  -t repo-atlasi/dallar/09-bilgisayar-bilimi/ossu-computer-science/sifirdan
```

25 test. Biri, depodaki `ornek-plan-12-ay.md`'nin belgelenen komutla birebir yeniden üretildiğini denetler (TheAlgorithms
mini'sindeki DIRECTORY.md tazelik testiyle aynı fikir).

## Veri biçimi

```json
{
  "baslik": "…",
  "dersler": [
    {
      "kimlik": "algo-1",
      "ad": "Algorithms: Design and Analysis, Part 1",
      "hafta": 8,
      "saat_min": 4,
      "saat_max": 8,
      "onkosullar": ["math-for-cs"],
      "kulvar": "algoritma",
      "secmeli": false,
      "kaynak": "https://…",
      "aciklama": "…"
    }
  ]
}
```

`saat` doğrudan verilebilir; verilmezse `hafta × (saat_min + saat_max) / 2`. Ders dışı önkoşullar (ör. "lise
matematiği", "C benzeri bir dil") graf kenarı değil, `onkosul_metni` alanındadır.

Veri dosyaları:

- `veri/ossu.json` — OSSU Intro CS + Core CS'in 30 dersi, README'den (`8f8272b`). Toplam 1.697,5 saat. Coursera
  bağlantılı derslerde FAQ'teki ücret uyarısı `aciklama` alanında.
- `veri/turkce-12-ay.json` — D09 için 21 kalemlik karma plan: OSSU dersleri, CIU konu blokları ve bu daldaki
  mini'ler. Zorunlular 755 saat, seçmeliler 170 saat. İki kulvar: `algoritma` ve `matematik-sistem`.

## Planlama kuralları

1. Bir ders, önkoşullarının hepsi **önceki** haftalarda bittiyse başlar.
2. Dersler kulvarlarda yürür; kulvar başına aynı anda tek ders. Başlanan ders bitmeden kulvarı bırakmaz. Veride kulvar
   yoksa `--paralel` kadar genel kulvar açılır. (OSSU README'si basitlik için yukarıdan aşağı sırayı önerir; matematiği
   giriş dersleriyle paralel almayı "popüler bir seçenek" olarak anar, FAQ da bölümleri paralel yürütmeye izin verir.)
3. Haftalık bütçe yürüyen derslere eşit bölünür; ihtiyacı payından az olanın artanı diğerine geçer ("su doldurma").
   Yürüyen dersler hafta ortasında biterse kulvar, hazır olan sıradaki dersle aynı hafta dolar.
4. Seçmeliler, zorunluların hepsi bitince başlar.

İlk denemede kulvar yoktu ve iki uzun ders (Math for CS ve Networking) iki genel kulvarı haftalarca tuttu; veri
yapıları ancak 15. haftada başlayabildi. Kulvar kavramı bu gözlemden doğdu: plan algoritması kadar veri modeli de
önemlidir.

## Aşamalar

1. `mufredat.py` — `dersten` (JSON → `Ders`), `dogrula` (yinelenen kimlik, bilinmeyen önkoşul), `dongu_bul` (üç renkli
   DFS, döngünün yolunu döndürür), `topolojik_sira` (Kahn + öncelik kuyruğu: önce zorunlu, sonra dosya sırası).
2. `takvim.py` — `haftalik_plan` (kulvarlar, su doldurma, aynı hafta yerine geçme), `zorunlu_bitis_haftasi`.
3. `plan_yaz.py` — Prettier biçimiyle uyumlu Markdown tablo, Türkçe tarih ve ondalık virgül, haftalık onay kutuları,
   `--karsilastir` tablosu.

## Eşleme tablosu

| Mini'deki parça             | OSSU'daki karşılığı                                         | Fark                                                                  |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| `veri/ossu.json`            | README ders tabloları (Duration, Effort, Prerequisites)     | Metin önkoşullar ders kimliklerine çevrildi; saat = hafta × ort. efor |
| `mufredat.topolojik_sira`   | FAQ: "progress linearly" ya da "use the prerequisites"      | Sıra programla üretiliyor, döngü denetleniyor                         |
| `takvim.haftalik_plan`      | README'de bağlantısı verilen tahmin tablosu (Google Sheets) | Önkoşul ve kulvar farkında; tablo yalnızca toplam süreyi tahmin eder  |
| Markdown onay kutuları      | "How to show your progress": fork + ✅                      | Haftalık kutular; `ilerleme.py` ile sayılabilir                       |
| `onkosul_metni`, `aciklama` | Tablolardaki serbest metin önkoşullar, FAQ notları          | Graf dışı bilgi kaybolmuyor                                           |
