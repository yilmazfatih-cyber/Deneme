# Sıfırdan: çalışma planı motoru (ilerleme yarısı)

CIU'nun yöntemi "çatalla, kutuyu işaretle, commit'le"dir. Bu mini o kutuları okuyup bölüm bölüm ilerleme, toplam yüzde
ve "sıradaki maddeler" listesi çıkaran `ilerleme.py`'yi ve CIU'nun konu sırasını açık bir önkoşul grafına çeviren
`veri/ciu-konulari.json`'u içerir. Planlama yarısı (graf → takvim → Markdown) komşu klasördedir:
[ossu-computer-science/sifirdan](../../ossu-computer-science/sifirdan/README.md).

## Gereksinimler

- Python 3.11 veya üstü (3.13 ile denendi). Yalnızca standart kütüphane.

## Çalıştırma

```bash
cd repo-atlasi/dallar/09-bilgisayar-bilimi/coding-interview-university/sifirdan
python3 ilerleme.py ornekler/ornek-ilerleme.md                      # bölüm özetleri + sıradaki 5 madde
python3 ilerleme.py ornekler/ornek-ilerleme.md --seviye 3 --yapraklar
python3 ilerleme.py ../../ossu-computer-science/sifirdan/ornek-plan-12-ay.md --seviye 3 --sonraki 3
python3 ilerleme.py ornekler/ornek-ilerleme.md --json               # başka araçlar için
```

Örnek çıktı:

```text
Algoritma karmaşıklığı  [####################]    2/2
Veri yapıları           [#########...........]    3/7
Sıralama                [##########..........]    1/2
TOPLAM                  [###########.........]    6/11   (55%)

Sıradaki maddeler:
     16. satır  insert(index, item), delete(index)
```

Kendi CIU çatalında: `python3 ilerleme.py README.md --seviye 2 --yapraklar`.

## Test

```bash
python3 -m unittest discover -s repo-atlasi/dallar/09-bilgisayar-bilimi/coding-interview-university/sifirdan \
  -t repo-atlasi/dallar/09-bilgisayar-bilimi/coding-interview-university/sifirdan
```

12 test. Biri OSSU klasöründeki örnek planı okur (dosya yoksa atlanır): iki aracın yalnızca dosya biçimi üzerinden
konuştuğunu gösterir.

## Desteklenen biçim

- Liste işaretleri `-`, `*`, `+` ve `1.`; kutular `[ ]`, `[x]`, `[X]`.
- İç içe kutular: hemen altında daha içeride bir kutu olan madde "özet"tir; `--yapraklar` yalnızca yaprakları sayar.
- Başlıklar `#`…`######` ve CIU'nun kullandığı liste içi başlıklar (`- ### Arrays`). `--seviye`, bölüm sayılacak en
  derin başlığı seçer.
- Kod blokları (üç ters tırnak ya da `~~~` ile açılan) içindeki kutular sayılmaz.
- Sekmeler 4 boşluk sayılır (CIU README'sinde girinti için sekme de kullanılmış).

## Aşamalar

1. `KUTU`, `BASLIK`, `CIT` düzenli ifadeleri ve `maddeleri_oku` — satır satır durum makinesi (kod içinde mi?).
2. Yaprak tespiti — girintiye bakarak.
3. `ozetle`, `cubuk`, `rapor_metni` — gruplama ve ASCII ilerleme çubuğu (her terminalde aynı görünür).
4. `sonraki_maddeler` — belge sırasında ilk işaretsiz yapraklar.
5. `--json` — `dataclasses.asdict` ile makine okunur çıktı.
6. `veri/ciu-konulari.json` — CIU "Topics of Study"nin 31 konusu; saatler ve önkoşullar öğretmen tahmini (CIU'da
   yalnızca sıra var). Planlamak için:
   `python3 ../../ossu-computer-science/sifirdan/plan_yaz.py veri/ciu-konulari.json --paralel 1 --saat 10`
   (CIU "her gün listedeki sıradaki konu" dediği için tek kulvar; haftada 10 saatle zorunlu konular 26 haftada biter).

## Eşleme tablosu

| Mini'deki parça              | CIU'daki karşılığı                                                    | Fark                                                          |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| Onay kutusu ayrıştırma       | README'deki 463 kutulu satır, "How to use it" (fork + `[x]` + commit) | Sayım ve rapor; CIU'da yalnızca GitHub'ın görsel işaretlemesi |
| Yaprak / özet ayrımı         | "Implement a vector:" gibi alt kutulu maddeler                        | Özet maddeler istenirse sayılmaz                              |
| Liste içi başlıklar          | `- ### Arrays`, `- ### Linked Lists` …                                | Bölüm olarak tanınır                                          |
| `sonraki_maddeler`           | "The Daily Plan": her gün sıradaki konu                               | Otomatik "bugün ne yapayım?" listesi                          |
| `veri/ciu-konulari.json`     | "Topics of Study" sırası                                              | Örtük sıra açık önkoşullara çevrildi; saat tahmini eklendi    |
| `ornekler/ornek-ilerleme.md` | CIU'nun kutu düzeni                                                   | Özgün, kısa Türkçe örnek (CIU metni kopyalanmadı)             |
