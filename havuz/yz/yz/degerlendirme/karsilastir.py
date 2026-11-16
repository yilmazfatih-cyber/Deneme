"""Modeller arası karşılaştırma: aynı görev kümesini birden çok sağlayıcı/modelle koşar.

"Hangi küçük model benim işimi görür?" sorusunun yanıtı: doğruluk, biçim geçerliliği, gecikme,
belirteç ve maliyet tek tabloda. Sağlayıcılar SIRAYLA koşulur (gecikme ölçümü birbirini
etkilemesin); her sağlayıcının içinde örnekler `es_zamanlilik` kadar paraleldir.
Kim kullanır: cli.py (`karsilastir`).
Genişletme: sıralama ölçütünü değiştirmek için `en_iyi`'yi düzenleyin.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from pathlib import Path

from yz.degerlendirme.kosu import KosuSonucu, OrnekSonucu, kosu_yap
from yz.degerlendirme.rapor import karsilastirma_md
from yz.degerlendirme.tanim import KosuTanimi
from yz.saglayici.taban import Saglayici


def karsilastir(
    tanim: KosuTanimi,
    saglayicilar: Sequence[Saglayici],
    *,
    sinir: int | None = None,
    es_zamanlilik: int | None = None,
    ilerleme: Callable[[str, OrnekSonucu], None] | None = None,
    kayit_klasoru: Path | None = None,
) -> list[KosuSonucu]:
    """Her sağlayıcı için bir koşu yapar; istenirse her koşuyu alt klasöre kaydeder."""
    kosular: list[KosuSonucu] = []
    for sira, saglayici in enumerate(saglayicilar, start=1):
        geri_cagri = (lambda o, m=saglayici.model: ilerleme(m, o)) if ilerleme else None
        kosu = kosu_yap(
            tanim, saglayici, sinir=sinir, es_zamanlilik=es_zamanlilik, ilerleme=geri_cagri
        )
        if kayit_klasoru is not None:
            guvenli_ad = "".join(h if h.isalnum() or h in "-_." else "_" for h in saglayici.model)
            kosu.kaydet(kayit_klasoru / f"{sira:02d}-{guvenli_ad}")
        kosular.append(kosu)
    return kosular


def en_iyi(kosular: Sequence[KosuSonucu]) -> KosuSonucu:
    """En yüksek doğruluk; eşitlikte daha yüksek biçim geçerliliği, sonra daha düşük gecikme."""
    return max(kosular, key=lambda k: (k.dogruluk, k.bicim_gecerliligi, -k.gecikme(50)))


def karsilastirma_raporu(tanim: KosuTanimi, kosular: Sequence[KosuSonucu]) -> str:
    kazanan = en_iyi(kosular)
    return (
        f"# Model karşılaştırması: {tanim.ad}\n\n{tanim.aciklama}\n\n"
        f"{karsilastirma_md(kosular)}\n\n"
        f"En iyi sonuç: **{kazanan.model}** (doğruluk %{kazanan.dogruluk * 100:.1f}).\n\n"
        "Not: gecikme bu makinede ve bu eşzamanlılıkla ölçüldü; maliyet yalnız yz.yaml'daki "
        "fiyat tablosu doluysa hesaplanır.\n"
    )
