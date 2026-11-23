"""Tahmin servisi: şema doğrulama + gerçek HTTP sunucusu (boş kapı, iş parçacığında) + CLI kuralı.

Başvuru: aynı satırlar için servisin olasılıkları, CSV yolundaki `TabularModel.predict_proba` ile
aynı olmalı (JSON → tablo dönüşümü eğitimdeki CSV okumasıyla tutarlı mı?).
"""

from __future__ import annotations

import http.client
import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from ml_temel.ortak.table import Table
from ml_temel.tablo.cli import main
from ml_temel.tablo.csv_reader import CsvFormat, read_csv, write_csv
from ml_temel.tablo.serve import PredictionService, make_server
from ml_temel.tablo.serve_schema import MAX_ROWS, InputError
from ml_temel.veri import make_churn_table

ANAHTAR = "deneme-anahtari-123"


@pytest.fixture(scope="module")
def egitilmis(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, Table]:
    klasor = tmp_path_factory.mktemp("serve")
    veri = write_csv(make_churn_table(400, random_state=3), klasor / "m.csv", CsvFormat())
    kod = main(["egit", "--veri", str(veri), "--hedef", "kayip", "--hizli", "--modeller",
                "dogrusal", "--cikti", str(klasor / "model")])  # fmt: skip
    assert kod == 0
    tablo, _ = read_csv(veri)
    return klasor / "model" / "model.npz", tablo


def satirlar(tablo: Table, adet: int, sutunlar: list[str]) -> list[dict[str, Any]]:
    """CSV'den okunan tablonun ilk satırlarını JSON satırına çevirir (NaN → null)."""
    sonuc = []
    for i in range(adet):
        satir: dict[str, Any] = {"_kimlik": f"M{i}"}
        for ad in sutunlar:
            deger = tablo[ad][i]
            if isinstance(deger, float | np.floating):
                satir[ad] = None if np.isnan(deger) else float(deger)
            else:
                satir[ad] = deger
        sonuc.append(satir)
    return sonuc


def test_sema_modelin_girdi_sutunlarini_ve_turlerini_verir(egitilmis: tuple[Path, Table]) -> None:
    service = PredictionService.from_file(str(egitilmis[0]))
    turler = {a["ad"]: a["tur"] for a in service.schema.describe()["alanlar"]}
    assert turler["aylik_ucret"] == "sayi"
    assert turler["sehir"] == "metin"
    assert turler["kayit_tarihi"] == "tarih"
    assert "kayip" not in turler and "musteri_no" not in turler  # hedef ve kimlik girdi değil


def test_json_yolu_csv_yoluyla_ayni_olasiliklari_verir(egitilmis: tuple[Path, Table]) -> None:
    yol, tablo = egitilmis
    service = PredictionService.from_file(str(yol))
    alanlar = [f.name for f in service.schema.fields]
    yanit = service.predict({"satirlar": satirlar(tablo, 25, alanlar)})
    beklenen = service.model.predict_proba(tablo.take_rows(np.arange(25)))
    adlar = list(yanit["tahminler"][0]["olasiliklar"])
    alinan = np.array([[t["olasiliklar"][a] for a in adlar] for t in yanit["tahminler"]])
    np.testing.assert_allclose(alinan, beklenen, atol=1e-6)
    assert [t["_kimlik"] for t in yanit["tahminler"]] == [f"M{i}" for i in range(25)]
    assert {t["tahmin"] for t in yanit["tahminler"]} <= {"evet", "hayır"}


def test_dogrulama_her_sorunu_alan_yoluyla_listeler(egitilmis: tuple[Path, Table]) -> None:
    service = PredictionService.from_file(str(egitilmis[0]))
    satir = satirlar(egitilmis[1], 1, [f.name for f in service.schema.fields])[0]
    bozuk = dict(satir, aylik_ucret="12,5", kayit_tarihi="dün", sehri="Ankara")
    del bozuk["paket"]
    with pytest.raises(InputError) as hata:
        service.predict({"satirlar": [satir, bozuk]})
    yollar = {a["yol"] for a in hata.value.details}
    assert yollar == {
        "satirlar[1].aylik_ucret",
        "satirlar[1].kayit_tarihi",
        "satirlar[1].sehri",
        "satirlar[1].paket",
    }


@pytest.mark.parametrize(
    "govde",
    [
        [],
        {"satirlar": []},
        {"satirlar": [{}], "fazla": 1},
        {"satirlar": ["metin"]},
        {"satirlar": [{}] * (MAX_ROWS + 1)},
    ],
)
def test_bicimsiz_govde_reddedilir(egitilmis: tuple[Path, Table], govde: Any) -> None:
    with pytest.raises(InputError):
        PredictionService.from_file(str(egitilmis[0])).predict(govde)


def test_null_ve_eksik_isaretleri_eksik_deger_sayilir(egitilmis: tuple[Path, Table]) -> None:
    service = PredictionService.from_file(str(egitilmis[0]))
    satir = dict.fromkeys((f.name for f in service.schema.fields), None)
    satir["sehir"] = "  NA "
    tahmin = service.predict({"satirlar": [satir]})["tahminler"][0]
    assert abs(sum(tahmin["olasiliklar"].values()) - 1) < 1e-6


@pytest.fixture
def sunucu(egitilmis: tuple[Path, Table]) -> Iterator[tuple[int, PredictionService]]:
    service = PredictionService.from_file(str(egitilmis[0]))
    http_sunucu = make_server(service, "127.0.0.1", 0, ANAHTAR)
    is_parcacigi = threading.Thread(target=http_sunucu.serve_forever, daemon=True)
    is_parcacigi.start()
    yield int(http_sunucu.server_address[1]), service
    http_sunucu.shutdown()
    http_sunucu.server_close()


def istek(kapi: int, yontem: str, yol: str, govde: bytes | None = None,
          basliklar: dict[str, str] | None = None) -> tuple[int, dict[str, Any]]:  # fmt: skip
    baglanti = http.client.HTTPConnection("127.0.0.1", kapi, timeout=30)
    baglanti.request(yontem, yol, body=govde, headers=basliklar or {})
    yanit = baglanti.getresponse()
    veri = json.loads(yanit.read().decode("utf-8"))
    baglanti.close()
    return yanit.status, veri


def test_http_uclari(sunucu: tuple[int, PredictionService], egitilmis: tuple[Path, Table]) -> None:
    kapi, service = sunucu
    durum, veri = istek(kapi, "GET", "/saglik")
    assert (durum, veri["durum"], veri["hedef"]) == (200, "ok", "kayip")
    json_ = {"Content-Type": "application/json", "Authorization": f"Bearer {ANAHTAR}"}
    govde = json.dumps(
        {"satirlar": satirlar(egitilmis[1], 2, [f.name for f in service.schema.fields])}
    )
    durum, veri = istek(kapi, "POST", "/tahmin", govde.encode(), json_)
    assert durum == 200 and len(veri["tahminler"]) == 2
    durum, veri = istek(kapi, "GET", "/sema", None, json_)
    assert durum == 200 and veri["en_cok_satir"] == MAX_ROWS


@pytest.mark.parametrize(
    ("basliklar", "govde", "beklenen"),
    [
        ({"Content-Type": "application/json"}, b'{"satirlar": []}', (401, "anahtar")),
        ({"Authorization": f"Bearer {ANAHTAR}"}, b"a=b", (415, "json_degil")),
        ({"Authorization": f"Bearer {ANAHTAR}", "Content-Type": "application/json"}, b"{bozuk",
         (400, "dogrulama")),
        ({"Authorization": f"Bearer {ANAHTAR}", "Content-Type": "application/json"},
         b'{"satirlar": [{"aylik_ucret": NaN}]}', (400, "dogrulama")),
        ({"Authorization": f"Bearer {ANAHTAR}", "Content-Type": "application/json",
          "Content-Length": str(2 * 1024 * 1024)}, b"{}", (413, "buyuk")),
    ],
)  # fmt: skip
def test_http_hatalari(
    sunucu: tuple[int, PredictionService],
    basliklar: dict[str, str],
    govde: bytes,
    beklenen: tuple[int, str],
) -> None:
    durum, veri = istek(sunucu[0], "POST", "/tahmin", govde, basliklar)
    assert (durum, veri["hata"]["kod"]) == beklenen
    assert veri["hata"]["ileti"]


def test_bilinmeyen_yol_ve_yontem(sunucu: tuple[int, PredictionService]) -> None:
    assert istek(sunucu[0], "GET", "/yok")[0] == 404
    assert istek(sunucu[0], "DELETE", "/tahmin")[0] == 405


def test_aga_anahtarsiz_acilmaz(
    egitilmis: tuple[Path, Table],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("ML_TEMEL_ANAHTAR", raising=False)
    assert main(["sun", "--model", str(egitilmis[0]), "--adres", "0.0.0.0", "--kapi", "0"]) == 2
    assert "ML_TEMEL_ANAHTAR" in capsys.readouterr().err
