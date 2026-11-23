"""Sunucu testleri (sahte modellerle): uçlar, gövde sınırı (gövde okunmadan), piksel sınırı, yerel kipte
Host/Origin denetimi, API anahtarı. Her saldırı testi "denedi, olmadı" biçimindedir."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from goruntu.arama.embedders import HistogramEmbedder
from goruntu.arama.index import ImageIndex, IndexItem
from goruntu.disa_aktar.runtime import Prediction
from goruntu.hazirlik.loader import LoadLimits
from goruntu.io_utils import sha256_bytes
from goruntu.sunucu.app import create_app
from goruntu.sunucu.gate import host_name
from goruntu.sunucu.state import ServerState
from tests.conftest import encode
from tests.test_loader import png_header_only
from tests.test_search import KeywordEmbedder

LOCAL = "http://127.0.0.1:8465"


class FakeClassifier:
    def predict(self, images: list[Image.Image], top: int = 3) -> list[Prediction]:
        bright = float(np.asarray(images[0]).mean()) > 127
        label = "açık" if bright else "koyu"
        return [Prediction(label, 0.9, [(label, 0.9), ("diğer", 0.1)][:top])]


def _index(embedder) -> ImageIndex:  # type: ignore[no-untyped-def]
    images = [
        Image.new("RGB", (32, 32), color) for color in ((220, 30, 30), (30, 30, 220), (30, 200, 30))
    ]
    index = ImageIndex(embedder.name, embedder.dim)
    items = [
        IndexItem(kimlik=f"{i:016d}", yol=f"{name}.jpg")
        for i, name in enumerate(("kırmızı", "mavi", "yeşil"))
    ]
    index.add(items, embedder.embed_images(images))
    return index


def _client(api_key: str | None = None, embedder=None, **kwargs) -> TestClient:  # type: ignore[no-untyped-def]
    embedder = embedder or KeywordEmbedder()
    state = ServerState(
        FakeClassifier(),
        _index(embedder),
        embedder,
        api_key,
        LoadLimits(max_pixels=1_000_000, max_bytes=200_000),
        **kwargs,
    )
    return TestClient(create_app(state), base_url=LOCAL)


def _upload(image: Image.Image | bytes) -> dict[str, tuple[str, bytes, str]]:
    data = image if isinstance(image, bytes) else encode(image, "PNG")
    return {"dosya": ("foto.png", data, "image/png")}


def test_saglik() -> None:
    response = _client().get("/saglik")
    assert response.json() == {"durum": "ok", "siniflandirici": True, "dizin": 3}


def test_siniflandir() -> None:
    response = _client().post(
        "/siniflandir", files=_upload(Image.new("RGB", (20, 20), (250, 250, 250)))
    )
    assert response.status_code == 200
    assert response.json()["etiket"] == "açık" and response.json()["emin_degil"] is False


def test_bozuk_goruntu_400_ve_neden() -> None:
    response = _client().post("/siniflandir", files=_upload(b"bu bir resim degil"))
    assert response.status_code == 400 and response.json()["neden"] == "taninmadi"


def test_sikistirma_bombasi_reddedilir() -> None:
    response = _client().post("/siniflandir", files=_upload(png_header_only(5000, 5000)))
    assert response.status_code == 400 and response.json()["neden"] == "piksel_siniri"


def test_buyuk_govde_okunmadan_413() -> None:
    client = _client()
    response = client.post(
        "/siniflandir",
        content=b"x" * 10,
        headers={"content-length": "999999999", "content-type": "application/octet-stream"},
    )
    assert response.status_code == 413
    streamed = client.post("/siniflandir", files=_upload(b"\x00" * 400_000))
    assert streamed.status_code == 413


def test_ara_ve_benzer() -> None:
    client = _client()
    found = client.post("/ara", json={"metin": "mavi bir çanta", "k": 2}).json()["sonuclar"]
    assert found[0]["yol"] == "mavi.jpg" and len(found) == 2
    similar = client.post("/benzer?k=1", files=_upload(Image.new("RGB", (16, 16), (25, 190, 35))))
    assert similar.json()["sonuclar"][0]["yol"] == "yeşil.jpg"
    assert client.post("/benzer?k=0", files=_upload(Image.new("RGB", (8, 8)))).status_code == 422
    assert client.post("/ara", json={"metin": ""}).status_code == 422


def test_benzer_sorgunun_kendisini_dondurmez() -> None:
    embedder = HistogramEmbedder()
    upload = encode(Image.new("RGB", (16, 16), (220, 30, 30)), "PNG")
    index = ImageIndex(embedder.name, embedder.dim)
    index.add(
        [
            IndexItem(kimlik=sha256_bytes(upload), yol="ayni.png"),
            IndexItem(kimlik="b" * 16, yol="baska.png"),
        ],
        embedder.embed_images(
            [Image.new("RGB", (16, 16), (220, 30, 30)), Image.new("RGB", (16, 16), (200, 40, 40))]
        ),
    )
    client = TestClient(create_app(ServerState(None, index, embedder)), base_url=LOCAL)
    found = client.post("/benzer", files=_upload(upload)).json()["sonuclar"]
    assert [row["yol"] for row in found] == ["baska.png"]


def test_metin_desteklemeyen_model_ve_eksik_bilesen() -> None:
    client = _client(embedder=HistogramEmbedder())
    response = client.post("/ara", json={"metin": "mavi"})
    assert response.status_code == 400 and "metinle arama" in response.json()["hata"]
    empty = TestClient(create_app(ServerState()), base_url=LOCAL)
    assert empty.post("/ara", json={"metin": "x"}).status_code == 503
    assert empty.post("/siniflandir", files=_upload(Image.new("RGB", (8, 8)))).status_code == 503


@pytest.mark.parametrize("host", ["evil.example", "192.168.1.5:8465", "127.0.0.1.evil.example"])
def test_yerel_kipte_yabanci_host_reddedilir(host: str) -> None:
    response = _client().get("/saglik", headers={"host": host})
    assert response.status_code == 403 and "yerel kipte" in response.json()["hata"]


def test_yerel_kipte_baska_site_reddedilir_ayni_site_gecer() -> None:
    client = _client()
    image = _upload(Image.new("RGB", (8, 8)))
    assert (
        client.post(
            "/siniflandir", files=image, headers={"origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert client.post("/siniflandir", files=image, headers={"origin": LOCAL}).status_code == 200
    allowed = _client(allowed_origins=("https://magaza.example",))
    assert (
        allowed.post(
            "/siniflandir", files=image, headers={"origin": "https://magaza.example"}
        ).status_code
        == 200
    )


def test_api_anahtari() -> None:
    client = _client(api_key="gizli-anahtar")
    image = _upload(Image.new("RGB", (8, 8)))
    assert client.post("/siniflandir", files=image).status_code == 401
    assert (
        client.post(
            "/siniflandir", files=image, headers={"authorization": "Bearer yanlis"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/siniflandir", files=image, headers={"authorization": "Bearer gizli-anahtar"}
        ).status_code
        == 200
    )
    assert (
        client.post("/siniflandir", files=image, headers={"x-api-key": "gizli-anahtar"}).status_code
        == 200
    )
    assert client.get("/saglik").status_code == 200  # açık yol
    outside = client.get("/saglik", headers={"host": "sunucu.example"})
    assert outside.status_code == 200  # anahtar kipinde Host kısıtı yok


def test_host_adi_ayristirma() -> None:
    assert host_name("LocalHost:8465") == "localhost"
    assert host_name("[::1]:8465") == "::1"
    assert host_name("::1") == "::1"


def test_anahtarsiz_dis_adres_uyarisi(capsys, tmp_path: Path) -> None:  # type: ignore[no-untyped-def]
    from goruntu.cli import main

    assert main(["sun", "--adres", "0.0.0.0"]) == 1  # bileşen yok: başlamadan açık hata
    assert "--model" in capsys.readouterr().err
