"""Türkçe metin yardımcıları: büyük/küçük harf, ölçüt ve yineleme sadeleştirmesi."""

from __future__ import annotations

from ince_ayar.text_tr import fold_for_match, lower_tr, normalize_for_metric, upper_tr, words


def test_turkce_kucuk_harf_noktali_noktasiz_i() -> None:
    assert lower_tr("IŞIK İSTANBUL") == "ışık istanbul"
    assert lower_tr("İ") == "i"  # str.lower() burada iki karakter üretirdi


def test_turkce_buyuk_harf() -> None:
    assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"


def test_olcut_sadelestirmesi_noktalama_ve_bosluk() -> None:
    assert normalize_for_metric("  İstanbul'da,   KARGO!  ") == "istanbul da kargo"
    assert words("Kargo üç günde gelir.") == ["kargo", "üç", "günde", "gelir"]


def test_yineleme_sadelestirmesi_aksan_ve_i_ayrimini_kaldirir() -> None:
    assert fold_for_match("İSTANBUL'DA ŞEKER") == "istanbul da seker"
    assert fold_for_match("Istanbul") == fold_for_match("istanbul") == fold_for_match("İSTANBUL")
