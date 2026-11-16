"""Model kartı (Markdown): modelin ne için yapıldığı, hangi veriyle eğitildiği, ne kadar iyi
olduğu ve nelere dikkat edilmesi gerektiği — tek sayfada, programcı olmayan okur için.

Bölümler: ayrıntılar, amaçlanan kullanım, kapsam dışı kullanım, eğitim verisi, ölçümler (güven
aralığıyla), etik ve adalet (hassas olabilecek sütun adları otomatik işaretlenir), bakım.
Metinler `messages.py`'dedir.
Genişletme: yeni bir hassas sütun sözcüğü için `_HASSAS`'a ekleyin; yeni bölüm için messages.py'ye
metin ve aşağıdaki `lines` listesine satır ekleyin.
"""

from __future__ import annotations

from typing import Any

from ml_temel.tablo.messages import t
from ml_temel.tablo.report import metric_name, num, split_text

_HASSAS = (
    "yas",
    "yaş",
    "cinsiyet",
    "sehir",
    "şehir",
    "il",
    "ilce",
    "ilçe",
    "uyruk",
    "din",
    "medeni",
)


def render_model_card(results: dict[str, Any]) -> str:
    """Model kartı (Markdown): ne için, hangi veriyle, ne kadar iyi, nelere dikkat."""
    data, best = results["veri"], results["en_iyi"]
    inputs = [
        c["ad"]
        for c in results["sutunlar"]
        if c["tur"] in ("sayisal", "kategori", "metin", "tarih")
    ]
    if data["gorev"] == "regresyon":
        output = t("kart_cikti_regresyon")
    elif data.get("pozitif") is not None:
        output = t(
            "kart_cikti_ikili", pozitif=data["pozitif"], esik=num(results["esik"]["kullanilan"], 2)
        )
    else:
        output = t("kart_cikti_cok")
    sensitive = [name for name in inputs if any(word in name for word in _HASSAS)]
    lines = [
        t("kart_baslik", hedef=data["hedef"]),
        "",
        t(
            "kart_ayrinti",
            model=t(f"model_{best}"),
            surum=results["surum"],
            tarih=results["olusturma"],
            sutunlar=", ".join(f"`{name}`" for name in inputs),
            cikti=output,
        ),
        "",
        t("kart_amac"),
        "",
        t("kart_disi"),
        "",
        t("kart_veri", dosya=data["dosya"], satir=data["satir"], ayrim=split_text(results)),
        "",
        t("kart_olcutler"),
        "",
    ]
    for metric, value in results["sinama"]["olcutler"].items():
        lines.append(
            f"- {metric_name(metric)}: {num(value['deger'])} "
            f"({num(value['alt'])} – {num(value['ust'])})"
        )
    names = ", ".join(f"`{name}`" for name in sensitive) if sensitive else t("kart_hassas_yok")
    lines += ["", t("kart_etik", sutunlar=names), "", t("kart_bakim"), ""]
    if results["uyarilar"]:
        lines += [t("bolum_uyarilar"), "", *[f"- {text}" for text in results["uyarilar"]], ""]
    return "\n".join(lines)
