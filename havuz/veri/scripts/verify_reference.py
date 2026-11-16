"""``tr/`` başvuru verilerini bağımsız kaynaklarla YENİDEN karşılaştırır (ağ ister; uzun denetim).

Kaynaklar (her biri ``tr/<ad>.meta.json``da yazılı): turkiye-api (GitHub ham dosya), Memleketim
(Hugging Face), turkey-neighbourhoods (npm), datasets/currency-codes (GitHub ham dosya) ve kuruluysa
``dogrulama`` ekstrasındaki kitaplıklar (babel/CLDR, holidays, pycountry, phonenumbers, schwifty):
    uv pip install --python .venv/bin/python -e ".[dogrulama]"
Bilinen ve gerekçesi meta dosyasında yazılı farklar ``KNOWN``da durur; başka her fark hatadır.
Kullanım: python scripts/verify_reference.py
"""

from __future__ import annotations

import csv
import io
import json
import sys
import tarfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from verihavuzu import reference
from verihavuzu.hat.fetch import FetchConfig, Fetcher
from verihavuzu.paths import work_dir

RAW = "https://raw.githubusercontent.com/"
TURKIYE_API = RAW + "ubeydeozdmr/turkiye-api/main/datasets/2025/"
MEMLEKETIM = "https://huggingface.co/datasets/oguzkaanatici/turkiye-81-il-973-ilce-memleketim/resolve/main/cities.json"
NEIGHBOURHOODS = (
    "https://registry.npmjs.org/turkey-neighbourhoods/-/turkey-neighbourhoods-4.0.3.tgz"
)
CURRENCIES = RAW + "datasets/currency-codes/main/data/codes-all.csv"
KNOWN = {  # (kaynak, konu) → gerekçe (meta dosyalarında da yazılı)
    ("turkiye-api", "bolge 18"): "kaynak Çankırı'yı Marmara yazıyor; doğrusu İç Anadolu",
    (
        "turkiye-api",
        "bolge 30",
    ): "kaynak Hakkari'yi Güneydoğu Anadolu yazıyor; doğrusu Doğu Anadolu",
    ("memleketim", "alan 34"): "kaynakta İstanbul için yalnız 212 var",
}

fetcher = Fetcher(
    FetchConfig(
        user_agent="verihavuzu-basvuru-dogrulama/0.1",
        min_interval=0.5,
        cache_dir=work_dir() / "http_onbellek",
    )
)
problems: list[str] = []


def get_json(url: str) -> Any:
    reply = fetcher.get(url)
    if reply.status != 200:
        raise RuntimeError(f"{url} alınamadı (HTTP {reply.status})")
    return json.loads(reply.body.decode("utf-8"))


def compare(source: str, topic: str, ours: Any, theirs: Any) -> None:
    if ours != theirs and (source, topic) not in KNOWN:
        problems.append(f"[{source}] {topic}: bizde {ours!r}, kaynakta {theirs!r}")


def check_provinces_and_districts() -> None:
    provinces = {row["plaka"]: row for row in reference.load("iller")}
    districts: dict[int, set[str]] = {}
    for row in reference.load("ilceler"):
        districts.setdefault(row["plaka"], set()).add(row["ilce"])
    api = {p["id"]: p for p in get_json(TURKIYE_API + "provinces.json")}
    api_districts: dict[int, set[str]] = {}
    for row in get_json(TURKIYE_API + "districts.json"):
        api_districts.setdefault(row["provinceId"], set()).add(row["name"])
    for plate, ours in provinces.items():
        theirs = api[plate]
        compare("turkiye-api", f"ad {plate}", ours["ad"], theirs["name"])
        compare("turkiye-api", f"bolge {plate}", ours["bolge"], theirs["region"]["tr"])
        compare("turkiye-api", f"buyuksehir {plate}", ours["buyuksehir"], theirs["isMetropolitan"])
        compare(
            "turkiye-api",
            f"alan {plate}",
            sorted(ours["alan_kodlari"]),
            sorted(theirs["phoneAreaCodes"]),
        )
        compare("turkiye-api", f"ilceler {plate}", districts[plate], api_districts[plate])
    for city in get_json(MEMLEKETIM):
        plate = int(city["plaka" if "plaka" in city else "plate"])
        compare("memleketim", f"ad {plate}", provinces[plate]["ad"], city["name"])
        compare("memleketim", f"bolge {plate}", provinces[plate]["bolge"], city["region"])
        compare(
            "memleketim",
            f"alan {plate}",
            [str(c) for c in provinces[plate]["alan_kodlari"]],
            [str(city["phoneCode"])],
        )
        compare(
            "memleketim",
            f"ilceler {plate}",
            districts[plate],
            {d["name"] for d in city["districts"]},
        )
    with tarfile.open(fileobj=io.BytesIO(fetcher.get(NEIGHBOURHOODS).body)) as archive:
        member = archive.extractfile("package/src/data/neighbourhoods.json")
        assert member is not None
        records = json.loads(member.read().decode("utf-8"))
    by_plate: dict[int, set[str]] = {}
    for code, _city, district, _hood, postal in records:
        by_plate.setdefault(int(code), set()).add(district)
        compare("turkey-neighbourhoods", f"posta kodu {postal}", postal[:2], code)
    for plate in provinces:
        compare("turkey-neighbourhoods", f"ilceler {plate}", districts[plate], by_plate[plate])


def check_currencies() -> None:
    reply = fetcher.get(CURRENCIES)
    rows = [
        r
        for r in csv.DictReader(io.StringIO(reply.body.decode("utf-8")))
        if not r["WithdrawalDate"]
    ]
    by_code = {r["AlphabeticCode"]: r for r in rows}
    for row in reference.load("para_birimleri"):
        theirs = by_code.get(row["kod"])
        if theirs is None:
            problems.append(f"[currency-codes] {row['kod']} güncel listede yok")
            continue
        compare(
            "currency-codes",
            f"{row['kod']} sayısal",
            row["sayisal_kod"],
            theirs["NumericCode"].zfill(3),
        )
        compare(
            "currency-codes",
            f"{row['kod']} küsurat",
            str(row["kusurat_basamagi"]),
            theirs["MinorUnit"],
        )


def check_with_libraries() -> None:
    """``dogrulama`` ekstrası kuruluysa kitaplıklarla karşılaştırır; değilse atlar ve söyler."""
    checks: list[tuple[str, Callable[[], None]]] = [
        ("babel", _babel),
        ("holidays", _holidays),
        ("pycountry", _pycountry),
        ("schwifty", _schwifty),
    ]
    for name, check in checks:
        try:
            check()
        except ImportError:
            print(f"atlandı: {name} kurulu değil (pip install -e '.[dogrulama]')")


def _babel() -> None:
    from babel import Locale  # type: ignore[import-not-found,unused-ignore]

    locale = Locale("tr")
    for row in reference.load("aylar"):
        compare(
            "CLDR",
            f"ay {row['no']}",
            (row["ad"], row["kisaltma"]),
            (
                locale.months["format"]["wide"][row["no"]],
                locale.months["format"]["abbreviated"][row["no"]],
            ),
        )
    for row in reference.load("gunler"):
        index = row["python_weekday"]
        compare(
            "CLDR",
            f"gün {row['no']}",
            (row["ad"], row["kisaltma"]),
            (locale.days["format"]["wide"][index], locale.days["format"]["abbreviated"][index]),
        )
    for row in reference.load("para_birimleri"):
        compare("CLDR", f"{row['kod']} ad", row["ad"], locale.currencies.get(row["kod"]))


def _holidays() -> None:
    import holidays  # type: ignore[import-not-found,unused-ignore]

    from verihavuzu.calendar_tr import fixed_holidays

    for year in (2025, 2026, 2027):
        theirs = holidays.country_holidays("TR", years=year, language="tr")
        for item in fixed_holidays(year):
            names = (theirs.get(item["tarih"]) or "").split("; ")
            compare("holidays", f"{item['tarih']}", item["ad"] in names, True)


def _pycountry() -> None:
    import pycountry  # type: ignore[import-not-found,unused-ignore]

    subdivisions = {
        int(s.code.split("-")[1]): s.name for s in pycountry.subdivisions.get(country_code="TR")
    }
    for row in reference.load("iller"):
        compare(
            "pycountry",
            f"ad {row['plaka']}",
            subdivisions[row["plaka"]] in (row["ad"], *row["diger_adlar"]),
            True,
        )
    for row in reference.load("para_birimleri"):
        compare(
            "pycountry",
            f"{row['kod']} sayısal",
            row["sayisal_kod"],
            pycountry.currencies.get(alpha_3=row["kod"]).numeric,
        )


def _schwifty() -> None:
    import schwifty  # type: ignore[import-not-found,unused-ignore]

    registry = Path(schwifty.__file__).parent / "bank_registry" / "manual_tr.json"
    names = {b["bank_code"]: b["name"] for b in json.loads(registry.read_text(encoding="utf-8"))}
    for row in reference.load("banka_kodlari"):
        compare("schwifty", f"banka {row['kod']}", row["unvan"], names.get(row["kod"]))


def main() -> int:
    check_provinces_and_districts()
    check_currencies()
    check_with_libraries()
    for problem in problems:
        print(problem)
    print(
        "Sonuç: "
        + ("FARK VAR" if problems else "tüm karşılaştırmalar uyumlu (bilinen farklar hariç)")
    )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
