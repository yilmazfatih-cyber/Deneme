"""Veri sözlüğü üreteci: tablo sözleşmesinden (şemadan) Markdown sütun tablosu.

Kullanım: ``python -m verihavuzu sozluk ornekler/eticaret/siparisler.sema.json``. Örnek kümelerin
veri kartlarındaki "Sütunlar" bölümü de buradan üretilir.
Genişletme: yeni bir kural gösterilecekse ``_rules`` içine bir satır ekleyin.
"""

from __future__ import annotations

from verihavuzu.kalite.schema import Column, TableContract
from verihavuzu.kalite.validators import VALIDATOR_LABELS

TYPE_LABELS = {
    "metin": "metin",
    "tam_sayi": "tam sayı",
    "ondalik": "ondalık",
    "mantiksal": "mantıksal",
    "tarih": "tarih",
    "zaman": "zaman",
}


def _rules(column: Column) -> str:
    rules: list[str] = []
    if column.benzersiz:
        rules.append("benzersiz")
    if column.en_az is not None or column.en_cok is not None:
        low = "−∞" if column.en_az is None else f"{column.en_az:g}"
        high = "∞" if column.en_cok is None else f"{column.en_cok:g}"
        rules.append(f"[{low}, {high}]")
    if column.en_erken or column.en_gec:
        rules.append(f"{column.en_erken or '…'} – {column.en_gec or '…'}")
    if column.izinli:
        rules.append("değerler: " + ", ".join(str(v) for v in column.izinli))
    if column.desen:
        rules.append(f"desen `{column.desen}`")
    if column.denetim:
        rules.append(VALIDATOR_LABELS[column.denetim])
    return "; ".join(rules).replace("|", "\\|")


def data_dictionary_markdown(contract: TableContract, *, heading_level: int = 2) -> str:
    """Sözleşmenin sütun tablosu (Sütun | Tür | Zorunlu | Kurallar | Açıklama)."""
    hashes = "#" * heading_level
    lines = [f"{hashes} {contract.ad}", ""]
    if contract.aciklama:
        lines += [contract.aciklama, ""]
    if contract.birincil_anahtar:
        lines += [f"Birincil anahtar: `{', '.join(contract.birincil_anahtar)}`", ""]
    lines += ["| Sütun | Tür | Zorunlu | Kurallar | Açıklama |", "| --- | --- | --- | --- | --- |"]
    for column in contract.sutunlar:
        required = "evet" if column.zorunlu else "hayır"
        description = column.aciklama.replace("|", "\\|")
        lines.append(
            f"| `{column.ad}` | {TYPE_LABELS[column.tur]} | {required} | {_rules(column)} "
            f"| {description} |"
        )
    return "\n".join(lines) + "\n"
