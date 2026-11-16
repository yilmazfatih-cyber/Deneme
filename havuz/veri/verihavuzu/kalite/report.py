"""Kalite raporları: Türkçe Markdown (insan için) + JSON (makine için).

Her ``*_markdown`` işlevi ilgili modülün sonucunu okunur bir rapora çevirir; JSON için sonucu
olduğu gibi ``write_reports`` ile yazın. Raporlarda kişisel veri değeri yer almaz: doğrulama
sorunlarında ``x-denetim`` sütunları maskelenir, denetim sonuçları yalnız satır numarası taşır.
Genişletme: yeni bir sonuç türü için ``x_markdown`` işlevi yazın; ``_table`` yardımcısını kullanın.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any

from verihavuzu.files import json_text, write_text_atomic
from verihavuzu.kalite.checks import CheckResult
from verihavuzu.kalite.validate import ValidationResult


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:,.4g}".replace(",", " ") if abs(value) >= 1e4 else f"{value:.4g}"
    if isinstance(value, bool):
        return "evet" if value else "hayır"
    return str(value).replace("|", "\\|").replace("\n", " ")


def _table(headers: Sequence[str], rows: Sequence[Sequence[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(" --- " for _ in headers) + "|"]
    lines += ["| " + " | ".join(_fmt(cell) for cell in row) + " |" for row in rows]
    return "\n".join(lines)


def validation_markdown(result: ValidationResult) -> str:
    status = "✅ Geçerli" if result.gecerli else f"❌ {result.toplam_sorun} sorun"
    parts = [
        f"# Doğrulama raporu: {result.tablo}",
        "",
        f"- Satır sayısı: {result.satir_sayisi}",
        f"- Sonuç: {status}",
        "",
    ]
    if result.kural_sayilari:
        parts += [
            "## Kurala göre",
            "",
            _table(["Kural", "Sorun"], list(result.kural_sayilari.items())),
            "",
        ]
        parts += [
            "## Sütuna göre",
            "",
            _table(["Sütun", "Sorun"], list(result.sutun_sayilari.items())),
            "",
        ]
        examples = [
            (i.satir or "-", i.sutun or "-", i.kural, i.mesaj, i.deger or "")
            for i in result.sorunlar[:50]
        ]
        parts += [
            "## İlk sorunlar",
            "",
            _table(["Satır", "Sütun", "Kural", "İleti", "Değer"], examples),
            "",
        ]
    return "\n".join(parts)


def checks_markdown(results: Sequence[CheckResult], title: str = "Denetim raporu") -> str:
    failed = sum(not r.gecti for r in results)
    rows = [
        (
            "✅" if r.gecti else "❌",
            r.ad,
            r.hatali_satir,
            r.mesaj,
            ", ".join(map(str, r.ornek_satirlar)),
        )
        for r in results
    ]
    return "\n".join(
        [
            f"# {title}",
            "",
            f"- Denetim: {len(results)} · başarısız: {failed}",
            "",
            _table(["", "Denetim", "Hatalı satır", "İleti", "Örnek satırlar"], rows),
            "",
        ]
    )


def profile_markdown(profile: dict[str, Any]) -> str:
    parts = [
        f"# Profil: {profile['tablo']}",
        "",
        f"- Satır: {profile['satir_sayisi']} · sütun: {profile['sutun_sayisi']} · "
        f"birebir yinelenen satır: {profile['yinelenen_satir']}",
        "",
        "## Özet",
        "",
    ]
    summary = [
        (
            c["sutun"],
            c["tur"],
            f"{c['eksik_orani']:.1%}",
            c["farkli_deger"],
            "evet" if c["aday_anahtar"] else "",
            ", ".join(c.get("kisisel_veri_ipucu", {})),
        )
        for c in profile["sutunlar"]
    ]
    parts += [
        _table(["Sütun", "Tür", "Eksik", "Farklı", "Aday anahtar", "Kişisel veri?"], summary),
        "",
    ]
    for column in profile["sutunlar"]:
        parts += [f"## {column['sutun']} ({column['tur']})", ""]
        if column["tur_uyumsuz"]:
            parts.append(f"- Türe uymayan değer: {column['tur_uyumsuz']}")
        if "sayisal" in column:
            s = column["sayisal"]
            p = s["yuzdelikler"]
            parts.append(
                f"- En küçük {_fmt(s['en_kucuk'])} · ortanca {_fmt(p['p50'])} · "
                f"en büyük {_fmt(s['en_buyuk'])} · ortalama {_fmt(s['ortalama'])} · "
                f"std {_fmt(s['std'])}"
            )
            parts.append(
                f"- Aykırı (IQR): {s['iqr_aykiri']} · aykırı (sağlam z): {s['saglam_z_aykiri']}"
            )
        if "tarih" in column:
            t = column["tarih"]
            parts.append(
                f"- Aralık: {t['en_erken']} … {t['en_gec']} · ISO dışı yazım: {t['iso_disi_bicim']}"
            )
        if "metin" in column:
            m = column["metin"]
            shapes = ", ".join(f"`{shape}` ({count})" for shape, count in m["desenler"])
            parts.append(
                f"- Uzunluk {m['uzunluk']['en_kisa']}–{m['uzunluk']['en_uzun']} · "
                f"desenler: {shapes}"
            )
            if m["bas_son_bosluk"]:
                parts.append(f"- Baş/son boşluklu değer: {m['bas_son_bosluk']}")
        if column.get("kisisel_veri_ipucu"):
            hints = ", ".join(
                f"{k} (%{v * 100:.0f})" for k, v in column["kisisel_veri_ipucu"].items()
            )
            parts.append(f"- ⚠️ Kişisel veri olabilir: {hints}")
        parts.append("")
    return "\n".join(parts)


def drift_markdown(report: dict[str, Any]) -> str:
    rows = []
    for item in report["sutunlar"]:
        psi = item.get("psi")
        ks = item.get("ks")
        rows.append(
            (
                item["sutun"],
                item["tur"],
                f"{item['eksik_referans']:.1%} → {item['eksik_yeni']:.1%}",
                f"{psi['psi']:.4f} ({psi['yorum']})" if psi else item.get("not", ""),
                f"D={ks['d']:.3f}, p={ks['p_degeri']:.3g}" if ks else "",
            )
        )
    return "\n".join(
        [
            "# Kayma raporu",
            "",
            f"- Referans: {report['referans_satir']} satır · yeni: {report['yeni_satir']} satır",
            "- PSI yorumu yaygın kuraldır: < 0,1 küçük · 0,1–0,25 orta · > 0,25 büyük.",
            "",
            _table(["Sütun", "Tür", "Eksik oranı", "PSI", "KS"], rows),
            "",
        ]
    )


def pii_markdown(counts: dict[str, dict[str, int]], method: str) -> str:
    rows = [
        (column, kind, count)
        for column, kinds in sorted(counts.items())
        for kind, count in sorted(kinds.items())
    ]
    total = sum(count for _, _, count in rows)
    return "\n".join(
        [
            f"# Kişisel veri raporu (yöntem: {method})",
            "",
            f"- Bulunan: {total}",
            "",
            _table(["Sütun", "Tür", "Adet"], rows) if rows else "Kişisel veri bulunmadı.",
            "",
        ]
    )


def write_reports(markdown: str, data: Any, md_path: Path | None, json_path: Path | None) -> None:
    """Raporu istenen yollara yazar (yol verilmeyen biçim atlanır)."""
    if md_path is not None:
        write_text_atomic(md_path, markdown)
    if json_path is not None:
        write_text_atomic(json_path, json_text(data))
