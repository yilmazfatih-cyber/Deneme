"""Öğretmen modelin lisans denetimi: üretilen veri öğretmenin lisansına tabidir.

Kim kullanır: `synth/cli.py` (üretim başlamadan önce).

Kurallar:
1. `ogretmen.lisans` boş olamaz (şema zorunlu kılar).
2. Lisans ticari kullanıma kapalıysa (`hayir`, ör. CC-BY-NC) üretim **durur**; ancak
   `ticari_olmayan_kullanim = true` ile verinin ticari kullanılmayacağı açıkça onaylanırsa sürer.
3. Lisans koşulluysa (`kosullu`, ör. Llama, Gemma, "other") uyarı verilir: çıktıların başka bir
   modeli eğitmekte kullanımı lisansta kısıtlanmış olabilir; lisans metni okunmalıdır.
4. `katalog_kimligi` verilmişse katalogdaki lisansla karşılaştırılır; uyuşmazlık hatadır.

Genişletme: kurala yeni bir lisans eklemek için `ince_ayar/catalog.py` içindeki kümelere bakın.
"""

from __future__ import annotations

from ince_ayar.catalog import license_class, load_catalog
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.synth.config import TeacherSection


def check_teacher_license(teacher: TeacherSection) -> list[str]:
    """Lisansı denetler; durdurucu durumda `UserError`, aksi hâlde uyarı listesi döndürür."""
    warnings: list[str] = []
    if teacher.katalog_kimligi:
        entry = load_catalog().find(teacher.katalog_kimligi)
        if entry is None:
            warnings.append(t("uret.lisans.katalogda_yok", kimlik=teacher.katalog_kimligi))
        elif entry.lisans != teacher.lisans:
            raise UserError(
                t(
                    "uret.lisans.uyusmaz",
                    kimlik=entry.kimlik,
                    katalog=entry.lisans,
                    ayar=teacher.lisans,
                )
            )
    kind = license_class(teacher.lisans)
    if kind == "hayir" and not teacher.ticari_olmayan_kullanim:
        raise UserError(t("uret.lisans.ticari_degil", lisans=teacher.lisans))
    if kind == "hayir":
        warnings.append(t("uret.lisans.ticari_degil_onayli", lisans=teacher.lisans))
    elif kind == "kosullu":
        warnings.append(t("uret.lisans.kosullu", lisans=teacher.lisans))
    return warnings
