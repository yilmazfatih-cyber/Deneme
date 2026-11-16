"""Türkçe Markdown rapor ve model kartı: `training.train`'in sonuç sözlüğünden üretilir.

Rapor, programcı olmayan bir okur için yazılır: önce özet ve uyarılar, sonra veri, değerlendirme
yöntemi (neden bu ayrım), adaylar, sınama sonuçları (güven aralığıyla), kalibrasyon, eşik,
sütun önemleri, kullanım ve sınırlar. Bütün metin parçaları `messages.py`'dedir; burada yalnız
yerleşim vardır. Sayılar Türkçe yazımla (ondalık virgül) gösterilir.
Model kartı `model_card.py`'dedir.
Genişletme: yeni bir bölüm = `_bolum_*` biçiminde bir fonksiyon + `render_report` listesine ekleme.
"""

from __future__ import annotations

import math
from typing import Any

from ml_temel.tablo.messages import t

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


def num(value: Any, digits: int = 3) -> str:
    """Türkçe sayı yazımı: 0.8333 → "0,833"; NaN → "—"."""
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return "—"
    return f"{float(value):.{digits}f}".replace(".", ",")


def percent(value: float) -> str:
    return "%" + num(100.0 * value, 1)


def metric_name(name: str) -> str:
    return t(f"olcut_{name}")


def _task_text(results: dict[str, Any]) -> str:
    data = results["veri"]
    if data["gorev"] == "regresyon":
        return t("gorev_regresyon")
    if data.get("pozitif") is not None:
        return t("gorev_siniflandirma_ikili", pozitif=data["pozitif"])
    return t("gorev_siniflandirma_cok", sayi=len(data["siniflar"]))


def _cv_row(results: dict[str, Any], model: str) -> dict[str, Any]:
    return next(row for row in results["cv"] if row["model"] == model)


def _interpretation(results: dict[str, Any]) -> str | None:
    metric, test = results["ana_olcut"], results["sinama"]
    value = test["olcutler"].get(metric, {}).get("deger")
    base = test["taban"].get(metric, {}).get("deger")
    if value is None:
        return None
    if metric == "roc_auc":
        return t("yorum_roc_auc", pozitif=results["veri"]["pozitif"], yuzde=100 * value)
    if metric == "log_loss" and base is not None:
        return t("yorum_log_loss", deger=num(value), taban=num(base))
    if metric == "rmse" and base is not None:
        return t("yorum_rmse", deger=num(value), taban=num(base))
    return None


def _bolum_ozet(results: dict[str, Any]) -> list[str]:
    metric, best = results["ana_olcut"], results["en_iyi"]
    cv = _cv_row(results, best)["olcutler"][metric]
    test = results["sinama"]["olcutler"].get(metric, {})
    base = results["sinama"]["taban"].get(metric, {}).get("deger")
    lines = [
        t("bolum_ozet"),
        "",
        t("ozet_gorev", metin=_task_text(results)),
        t(
            "ozet_model",
            model=t(f"model_{best}"),
            olcut=metric_name(metric),
            ort=num(cv["ort"]),
            std=num(cv["std"]),
            kat=results["ayrim"]["kat"],
        ),
        t(
            "ozet_sinama",
            satir=results["sinama"]["satir"],
            olcut=metric_name(metric),
            deger=num(test.get("deger")),
            alt=num(test.get("alt")),
            ust=num(test.get("ust")),
            taban=num(base),
        ),
    ]
    comment = _interpretation(results)
    if comment:
        lines.append(t("ozet_yorum", metin=comment))
    return [*lines, ""]


def _bolum_uyarilar(results: dict[str, Any]) -> list[str]:
    warnings = results["uyarilar"]
    body = [f"- ⚠️ {text}" for text in warnings] if warnings else [t("uyari_yok")]
    return [t("bolum_uyarilar"), "", *body, ""]


def _bolum_veri(results: dict[str, Any]) -> list[str]:
    lines = [t("bolum_veri"), "", t("veri_tablo_baslik"), "|---|---|---|---|---|"]
    for column in results["sutunlar"]:
        lines.append(
            f"| `{column['ad']}` | {column['tur']} | {percent(column['eksik'])} | "
            f"{column['farkli']} | {column['not']} |"
        )
    data = results["veri"]
    lines.append("")
    if "siniflar" in data:
        total = sum(data["siniflar"].values())
        parts = [
            f"{name}: {count} ({percent(count / total)})"
            for name, count in data["siniflar"].items()
        ]
        lines.append(t("veri_hedef_dagilim", dagilim=", ".join(parts)))
    else:
        summary = {key: num(value, 3) for key, value in data["hedef_ozet"].items()}
        lines.append(t("veri_hedef_ozet", **summary))
    return [*lines, ""]


def split_text(results: dict[str, Any]) -> str:
    """Ayrım stratejisinin açıklaması (rapor ve model kartı için)."""
    strategy, data = results["ayrim"]["strateji"], results["veri"]
    if strategy == "zaman":
        return t("ayrim_zaman", sutun=data["zaman"], oran=20)
    if strategy == "grup":
        return t("ayrim_grup", sutun=data["grup"])
    return t(f"ayrim_{strategy}")


def _bolum_yontem(results: dict[str, Any]) -> list[str]:
    split, metric = results["ayrim"], results["ana_olcut"]
    lines = [
        t("bolum_yontem"),
        "",
        t("yontem_ayrim", metin=split_text(results)),
        t("yontem_sinama", satir=split["sinama"]),
        t("yontem_cv", kat=split["kat"], satir=split["egitim"]),
        t("yontem_ana", olcut=metric_name(metric), anlam=t(f"anlam_{metric}")),
    ]
    if split.get("atilan_zamansiz"):
        lines.append(t("yontem_zamansiz", satir=split["atilan_zamansiz"]))
    return [*lines, ""]


def _bolum_adaylar(results: dict[str, Any]) -> list[str]:
    metrics = list(results["cv"][0]["olcutler"])
    header = (
        "| Model | " + " | ".join(metric_name(m) for m in metrics) + f" | {t('adaylar_sure')} |"
    )
    lines = [t("bolum_adaylar"), "", header, "|---" * (len(metrics) + 2) + "|"]
    for row in results["cv"]:
        name = t(f"model_{row['model']}")
        if row["model"] == results["en_iyi"]:
            name = f"**{name}**"
        cells = [
            f"{num(row['olcutler'][m]['ort'])} ± {num(row['olcutler'][m]['std'])}" for m in metrics
        ]
        lines.append(f"| {name} | " + " | ".join(cells) + f" | {num(row['sure'], 1)} |")
    return [*lines, "", t("adaylar_not"), ""]


def _bolum_sinama(results: dict[str, Any]) -> list[str]:
    test = results["sinama"]
    lines = [t("bolum_sinama"), "", t("sinama_baslik"), "|---|---|---|---|---|"]
    for metric, value in test["olcutler"].items():
        base = test["taban"].get(metric, {}).get("deger")
        lines.append(
            f"| {metric_name(metric)} | **{num(value['deger'])}** | {num(value['alt'])} – "
            f"{num(value['ust'])} | {num(base)} | {t(f'anlam_{metric}')} |"
        )
    lines += ["", t("sinama_not")]
    if "hata_dagilimi" in test:
        errors = {key: num(value) for key, value in test["hata_dagilimi"].items()}
        lines += ["", t("regresyon_hata", **errors)]
    return [*lines, ""]


def _bolum_kalibrasyon(results: dict[str, Any]) -> list[str]:
    test = results["sinama"]
    if "kalibrasyon_tablosu" not in test:
        return []
    calibration = results["kalibrasyon"]
    losses = ", ".join(
        f"{t(f'yontem_{name}')}: {num(value)}"
        for name, value in calibration["aday_log_kayip"].items()
    )
    lines = [
        t("bolum_kalibrasyon"),
        "",
        t("kalibrasyon_secim", metin=t(f"kalibrasyon_{calibration['yontem']}")),
        t("kalibrasyon_adaylar", liste=losses),
        t("kalibrasyon_ece", once=num(test["ece_once"]), sonra=num(test["ece_sonra"])),
        "",
        t("kalibrasyon_tablo_baslik"),
        "|---|---|---|",
    ]
    for row in test["kalibrasyon_tablosu"]["sonra"]:
        lines.append(f"| {num(row['tahmin'])} | {num(row['gercek'])} | {row['sayi']} |")
    return [*lines, ""]


def _matrix(labels: list[str], matrix: list[list[int]]) -> list[str]:
    lines = ["| | " + " | ".join(labels) + " |", "|---" * (len(labels) + 1) + "|"]
    for label, row in zip(labels, matrix, strict=True):
        lines.append(f"| **{label}** | " + " | ".join(str(v) for v in row) + " |")
    return lines


def _bolum_esik(results: dict[str, Any]) -> list[str]:
    test, data = results["sinama"], results["veri"]
    if "karisiklik" not in test:
        return []
    lines = [t("bolum_esik"), ""]
    if data.get("pozitif") is not None:
        negative = next(name for name in data["siniflar"] if name != data["pozitif"])
        labels = [negative, data["pozitif"]]
        lines += [
            t("esik_aciklama", pozitif=data["pozitif"], f1=num(results["esik"]["f1_en_iyi"], 2)),
            "",
        ]
    else:
        labels = list(data["siniflar"])
    for item in test["karisiklik"]:
        if item["esik"] is not None:
            lines += [t("esik_matris", esik=num(item["esik"], 2)), ""]
        lines += [*_matrix(labels, item["matris"]), ""]
    return lines


def _bolum_onem(results: dict[str, Any]) -> list[str]:
    items = results["onem"][:15]
    if not items:
        return []
    repeats = 2 if results["ayarlar"]["hizli"] else 5
    lines = [
        t("bolum_onem"),
        "",
        t("onem_aciklama", olcut=metric_name(results["ana_olcut"]), tekrar=repeats),
        "",
        t("onem_tablo_baslik"),
        "|---|---|---|---|",
    ]
    largest = max((float(item["ort"]) for item in items), default=0.0)
    for item in items:
        value = float(item["ort"])
        bar = "█" * round(20 * value / largest) if largest > 0 and value > 0 else ""
        lines.append(
            f"| `{item['sutun']}` | {num(value, 4)} | {num(float(item['std']), 4)} | {bar} |"
        )
    return [*lines, ""]


def _bolum_kullanim(results: dict[str, Any], model_path: str) -> list[str]:
    target = results["veri"]["hedef"]
    return [
        t("bolum_kullanim"),
        "",
        t("kullanim_tahmin"),
        "",
        "```bash",
        f"python -m ml_temel tahmin --model {model_path} --veri yeni.csv --cikti tahminler.csv",
        "```",
        "",
        t("kullanim_degerlendir"),
        "",
        "```bash",
        f"python -m ml_temel degerlendir --model {model_path} --veri etiketli.csv",
        f"# etiketli.csv içinde '{target}' sütunu dolu olmalı",
        "```",
        "",
    ]


def render_report(results: dict[str, Any], model_path: str = "model.npz") -> str:
    """Bütün rapor (Markdown)."""
    data = results["veri"]
    lines = [
        t("rapor_baslik", hedef=data["hedef"]),
        "",
        t(
            "rapor_altbilgi",
            tarih=results["olusturma"],
            surum=results["surum"],
            dosya=data["dosya"],
            satir=data["satir"],
            sutun=data["sutun"],
            bicim=data["bicim"] or "—",
        ),
        "",
    ]
    for section in (
        _bolum_ozet,
        _bolum_uyarilar,
        _bolum_veri,
        _bolum_yontem,
        _bolum_adaylar,
        _bolum_sinama,
        _bolum_kalibrasyon,
        _bolum_esik,
        _bolum_onem,
    ):
        lines += section(results)
    lines += _bolum_kullanim(results, model_path)
    lines += [t("bolum_sinirlar"), "", t("sinirlar_metni"), ""]
    return "\n".join(lines)
