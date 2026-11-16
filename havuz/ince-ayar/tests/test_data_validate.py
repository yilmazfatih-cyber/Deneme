"""Biçim doğrulayıcı: satır numaralı Türkçe hatalar, CSV tuzakları ve satırlar arası uyarılar."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path

import pytest

from ince_ayar.data.validate import load_chat, load_classification, load_pairs, load_tagged
from ince_ayar.errors import UserError
from tests.conftest import EXAMPLES

GOOD = {
    "messages": [{"role": "user", "content": "Merhaba"}, {"role": "assistant", "content": "Selam"}]
}


def _jsonl(path: Path, rows: Sequence[object]) -> Path:
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8"
    )
    return path


def test_ornek_dosyalarin_hepsi_gecerli() -> None:
    assert len(load_chat(EXAMPLES / "sohbet.jsonl").rows) == 12
    assert len(load_classification(EXAMPLES / "siniflandirma.csv").rows) == 24
    assert len(load_pairs(EXAMPLES / "gomme.jsonl").rows) == 12
    assert len(load_tagged(EXAMPLES / "varlik.jsonl").rows) == 12


def test_37_satirda_son_ileti_asistan_degilse_tam_ileti(tmp_path: Path) -> None:
    bad = {
        "messages": [
            {"role": "user", "content": "Soru"},
            {"role": "assistant", "content": "Yanıt"},
            {"role": "user", "content": "Yine soru"},
        ]
    }
    loaded = load_chat(_jsonl(tmp_path / "v.jsonl", [GOOD] * 36 + [bad]))
    assert [issue.render() for issue in loaded.errors] == [
        "37. satır: `messages` son öğesi asistan olmalı (şu an: user)"
    ]
    with pytest.raises(UserError, match="37. satır"):
        loaded.raise_if_errors()


@pytest.mark.parametrize(
    ("messages", "expected"),
    [
        (
            [{"role": "assistant", "content": "a"}, {"role": "user", "content": "b"}],
            "`messages[0]` rolü user olmalı",
        ),
        (
            [{"role": "user", "content": "a"}, {"role": "system", "content": "b"}],
            "system iletisi yalnız en başta olabilir",
        ),
        (
            [{"role": "user", "content": "  "}, {"role": "assistant", "content": "b"}],
            "`messages[0].content` boş olamaz",
        ),
        (
            [{"role": "kullanici", "content": "a"}, {"role": "assistant", "content": "b"}],
            "`messages[0].role` şunlardan biri olmalı",
        ),
        ([{"role": "user", "content": "a"}], "`messages` en az 2 öğe içermeli"),
    ],
)
def test_sohbet_hatalari_turkce(
    tmp_path: Path, messages: list[dict[str, str]], expected: str
) -> None:
    loaded = load_chat(_jsonl(tmp_path / "v.jsonl", [{"messages": messages}]))
    assert expected in loaded.errors[0].render()


def test_bozuk_json_ve_nesne_olmayan_satir(tmp_path: Path) -> None:
    path = tmp_path / "v.jsonl"
    path.write_text('{"messages": [\n[1, 2]\n', encoding="utf-8")
    rendered = [issue.render() for issue in load_chat(path).errors]
    assert rendered[0].startswith("1. satır: geçerli JSON değil")
    assert rendered[1] == "2. satır: satır bir JSON nesnesi olmalı ({…} ile başlayıp bitmeli)"


def test_baska_bicim_icin_donusturme_onerisi(tmp_path: Path) -> None:
    loaded = load_chat(_jsonl(tmp_path / "a.jsonl", [{"instruction": "Soru", "output": "Yanıt"}]))
    assert "veri donustur --kaynak-bicim alpaca" in loaded.errors[0].render()


def test_csv_bom_ve_noktali_virgul(tmp_path: Path) -> None:
    path = tmp_path / "excel.csv"
    path.write_bytes("﻿metin;etiket\nİade istiyorum;iade\nKargom nerede;kargo\n".encode())
    rows = load_classification(path).rows
    assert [(r.text, r.label) for r in rows] == [
        ("İade istiyorum", "iade"),
        ("Kargom nerede", "kargo"),
    ]


def test_windows_1254_dosyasi_yol_gosterir(tmp_path: Path) -> None:
    path = tmp_path / "eski.csv"
    path.write_bytes("metin,etiket\nŞifremi unuttum,hesap\nİade,iade\n".encode("cp1254"))
    with pytest.raises(UserError, match="--kodlama cp1254"):
        load_classification(path)
    assert load_classification(path, encoding="cp1254").rows[0].text == "Şifremi unuttum"


def test_sayisal_etiket_metne_cevrilir(tmp_path: Path) -> None:
    rows = load_classification(
        _jsonl(
            tmp_path / "s.jsonl", [{"metin": "iyi", "etiket": 1}, {"metin": "kötü", "etiket": 0}]
        )
    ).rows
    assert [r.label for r in rows] == ["1", "0"]


def test_siniflandirma_uyarilari(tmp_path: Path) -> None:
    rows = [
        {"metin": "aynı metin", "etiket": "Olumlu"},
        {"metin": "Aynı metin", "etiket": "olumsuz"},
    ]
    rows += [{"metin": f"metin {i}", "etiket": "olumlu"} for i in range(20)]
    warnings = [
        i.render() for i in load_classification(_jsonl(tmp_path / "s.jsonl", rows)).warnings
    ]
    text = "\n".join(warnings)
    assert "yalnız harf büyüklüğüyle ayrışıyor" in text
    assert "1. satırla aynı metin ama etiket farklı" in text
    assert "Sınıflar dengesiz" in text
    assert "'Olumlu' sınıfında yalnız 1 örnek var" in text


def test_hata_listesi_kirpilir(tmp_path: Path) -> None:
    loaded = load_chat(_jsonl(tmp_path / "v.jsonl", [{"messages": []}] * 25))
    with pytest.raises(UserError) as caught:
        loaded.raise_if_errors(limit=20)
    assert "25 hata var" in str(caught.value)
    assert "… ve 5 hata daha" in str(caught.value)


def test_gomme_olumsuz_bicimleri(tmp_path: Path) -> None:
    rows = [
        {"sorgu": "s", "olumlu": "o", "olumsuz": "x"},
        {"sorgu": "t", "olumlu": "p", "olumsuz": ["y", "z"]},
        {"sorgu": "u", "olumlu": "q", "olumsuz": "q"},
    ]
    loaded = load_pairs(_jsonl(tmp_path / "g.jsonl", rows))
    assert [r.negatives for r in loaded.rows] == [["x"], ["y", "z"]]
    assert "`olumsuz` metni `olumlu` ile aynı olamaz" in loaded.errors[0].render()


def test_varlik_etiket_denetimi(tmp_path: Path) -> None:
    rows = [
        {"sozcukler": ["Ali", "geldi"], "etiketler": ["B-KISI"]},
        {"sozcukler": ["Ali"], "etiketler": ["KISI"]},
        {"sozcukler": ["Ali", "Veli"], "etiketler": ["O", "I-KISI"]},
    ]
    errors = [i.render() for i in load_tagged(_jsonl(tmp_path / "v.jsonl", rows)).errors]
    assert "aynı uzunlukta olmalı" in errors[0]
    assert "etiket 'O', 'B-AD' ya da 'I-AD' olmalı" in errors[1]
    assert "'I-' etiketi aynı türden" in errors[2]
