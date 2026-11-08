---
name: moda
description: Moda Radar'a (moda-radar/ klasörü) renk, desen, kumaş, kalıp ve segment için yatırım kararı sorar. "/moda LCW için keten oversize gömlek, lacivert, düz, hedef 899 TL" gibi. Depo kökünden çalışır; moda-radar/.claude/skills/sor ile aynı akışı izler.
---

# /moda <soru>

`moda-radar/.claude/skills/sor/SKILL.md` dosyasını oku ve aynı adımları uygula; komutları `cd moda-radar &&` ile çalıştır.
Bağımlılık eksikse önce `python3 -m pip install -e "moda-radar[test,renk,tahmin]"`.
Veritabanı (`moda-radar/veri/moda.db`) yoksa sistem `content/sinyaller/` rapor sinyalleriyle çalışır; kartta bunu belirt
("görsel sayımı değil, yayımlanmış defile raporları").
