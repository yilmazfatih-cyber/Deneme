# Moda Radar

Defile görsellerinden sezonun tutacak **renklerini (Pantone TCX koduyla), kumaşlarını, desenlerini ve siluetlerini**
olasılıkla tahmin eden; bu tahmini **ülke ve sosyoekonomik segment** (İstanbul için Beymen, Zara, LCW, Addax ve pazar
kitlesi) bazında yerelleştiren; ürün ürün **yatır / dene / bekle / girme** kararı üreten karar destek sistemi.
WGSN'nin kapalı kutu yaptığını açık yöntemle ve Türkiye odağıyla yapar.

> **Yatırım tavsiyesi değildir.** Sistem gerekçeli öneri verir; satın alma kararı insanındır.

## Nasıl kuruldu

- **Mimar:** Fable 5.1. Anayasa `CLAUDE.md`, plan `docs/PLAN.md`, yol haritası `docs/ROADMAP.md`, kararlar `docs/decisions/`.
- **Üretim ekibi:** Opus 5.5 ajanları, `.claude/agents/` (baş mimar, veri mühendisi, görsel analist, renk bilimci,
  trend modelci, yatırım analisti, moda editörü). Roller ve WGSN kadro karşılaştırması `docs/EKIP.md`.
- **Sözleşme:** `moda_radar/sema.py` (Pydantic). Bütün modüller bu şemaları üretir ve tüketir.
- **İçerik:** `content/segmentler.json` (5 İstanbul segmenti, gecikme önselleri), `content/taksonomi.json` (kapalı nitelik sözlüğü).

## Başlamak

```bash
cd moda-radar
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[test]"
python -m moda_radar dogrula
pytest
```

Bir sezon döngüsünü ajan ekibiyle yürütmek için bu klasörü ayrı bir depo kökü olarak açın ve:

```bash
claude --agent bas-mimar
```

ardından `/sezon SS27` yazın. İlk aşama (P0) yalnız renk, yalnız kadın üst giyim, yalnız Zara TR ve LCW ile çalışır;
iki geçmiş sezonda podyum→raf gecikmesini ölçmeden ileri tahmin yayımlanmaz.

## Çıktılar

| Çıktı            | Dosya                            | İçerik                                                         |
| ---------------- | -------------------------------- | -------------------------------------------------------------- |
| Sezon paleti     | `docs/sezonlar/<SEZON>/rapor.md` | TCX kodu, hex, Lab, ΔE, podyum payı, segment başına raf tarihi |
| Trend tablosu    | aynı rapor                       | nitelik × segment olasılık, ufuk, yön                          |
| Yatırım kartları | aynı rapor + JSON                | beş boyut ayrı; karar; gerekçe; "kararı değiştirecek sinyal"   |
| Karne            | `docs/karne/<surum>.md`          | geriye test: ilk 10 renk isabeti, Brier, taban karşılaştırması |
