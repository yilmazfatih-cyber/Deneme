"""CSV okuyucu: Türkçe Excel dışa aktarımları (BOM, `;`, ondalık virgül, binlik nokta, cp1254)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from ml_temel.ortak.table import Table
from ml_temel.tablo.csv_reader import CsvFormat, parse_number, read_csv, write_csv


def write(tmp_path: Path, content: str, encoding: str = "utf-8", name: str = "veri.csv") -> Path:
    path = tmp_path / name
    path.write_bytes(content.encode(encoding))
    return path


def test_turkish_excel_export(tmp_path: Path) -> None:
    content = (
        "﻿İl;Nüfus;Ortalama gelir;Kayıt tarihi;Not\r\n"
        'İstanbul;15.655.924;12.345,67;01.02.2024;"büyük; kalabalık"\r\n'
        "Iğdır;203.594;8.100,5;15.03.2024;\r\n"
        "Şırnak;NA;7.950;;-\r\n"
    )
    table, fmt = read_csv(write(tmp_path, content))
    assert fmt == CsvFormat("utf-8-sig", ";", ",")
    assert table.names == ["İl", "Nüfus", "Ortalama gelir", "Kayıt tarihi", "Not"]
    np.testing.assert_allclose(table["Nüfus"][:2], [15655924, 203594])
    assert np.isnan(table["Nüfus"][2])
    np.testing.assert_allclose(table["Ortalama gelir"], [12345.67, 8100.5, 7950.0])
    assert table["İl"].tolist() == ["İstanbul", "Iğdır", "Şırnak"]
    assert table["Kayıt tarihi"].tolist() == ["01.02.2024", "15.03.2024", None]  # tarih ≠ sayı
    assert table["Not"].tolist() == ["büyük; kalabalık", None, None]


def test_windows_turkish_encoding(tmp_path: Path) -> None:
    content = "şehir;puan\nŞanlıurfa;4,5\nİzmir;3\n"
    table, fmt = read_csv(write(tmp_path, content, encoding="cp1254"))
    assert fmt.encoding == "cp1254"
    assert table["şehir"].tolist() == ["Şanlıurfa", "İzmir"]
    np.testing.assert_allclose(table["puan"], [4.5, 3.0])


@pytest.mark.parametrize(
    ("content", "delimiter", "decimal"),
    [
        ("a,b\n1.5,x\n2,y\n", ",", "."),
        ("a\tb\n1,5\tx\n2\ty\n", "\t", ","),
        ("a|b\n1.234,5|x\n2|y\n", "|", ","),
        ("a;b\n1.5;x\n2.25;y\n", ";", "."),
    ],
)
def test_delimiter_and_decimal_detection(
    tmp_path: Path, content: str, delimiter: str, decimal: str
) -> None:
    table, fmt = read_csv(write(tmp_path, content))
    assert (fmt.delimiter, fmt.decimal) == (delimiter, decimal)
    assert table["a"].dtype.kind == "f"
    assert table["b"].tolist() == ["x", "y"]


def test_number_parsing_rules() -> None:
    assert parse_number("1.234,56", ",") == pytest.approx(1234.56)
    assert parse_number("-0,5", ",") == pytest.approx(-0.5)
    assert parse_number("1,234.5", ".") == pytest.approx(1234.5)
    assert parse_number("2e3", ".") == 2000.0
    for text, decimal in [("04.07.2023", ","), ("2023-07-04", "."), ("1.2.3", "."), ("abc", ",")]:
        assert parse_number(text, decimal) is None
    assert parse_number("inf", ".") is None


def test_header_problems_and_errors(tmp_path: Path) -> None:
    table, _ = read_csv(write(tmp_path, "ad;ad;;x\n1;2;3;4\n"))
    assert table.names == ["ad", "ad_2", "sutun_3", "x"]
    short, _ = read_csv(write(tmp_path, "a;b;c\n1;2\n3;4;5\n", name="kisa.csv"))
    assert np.isnan(short["c"][0])
    with pytest.raises(ValueError, match="başlıktan fazla"):
        read_csv(write(tmp_path, "a;b\n1;2;3\n", name="uzun.csv"))
    with pytest.raises(ValueError, match="boş"):
        read_csv(write(tmp_path, "yalniz;baslik\n", name="bos.csv"))


def test_forced_options_and_round_trip(tmp_path: Path) -> None:
    path = write(tmp_path, "x;y\n1,5;a\n2,5;b\n")
    forced, fmt = read_csv(path, delimiter=";", decimal=".")
    assert fmt.decimal == "."
    assert forced["x"].tolist() == ["1,5", "2,5"]  # nokta zorlandı: virgüllü değerler metin kalır
    table = Table(
        {
            "sayı": np.array([1234.5, np.nan, 2.0]),
            "metin": np.array(["İğne", "ıhlamur", None], dtype=object),
        }
    )
    target = write_csv(table, tmp_path / "cikti.csv", CsvFormat("utf-8-sig", ";", ","))
    assert target.read_bytes().startswith(b"\xef\xbb\xbf")
    assert "1234,5;İğne" in target.read_text(encoding="utf-8-sig")
    again, again_fmt = read_csv(target)
    assert again_fmt == CsvFormat("utf-8-sig", ";", ",")
    assert again["sayı"][0] == 1234.5
    assert np.isnan(again["sayı"][1])
    assert again["metin"].tolist() == ["İğne", "ıhlamur", None]
    skipped, _ = read_csv(write(tmp_path, "a;b\n1;x\n;\n2;y\n", name="bosluk.csv"))
    assert len(skipped) == 2  # bütünüyle boş satır (Excel artığı) atlanır
