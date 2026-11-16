"""Sohbet arayüzü uçtan uca: Sahte sağlayıcıyla akışlı yanıt, belge yükleme + kaynaklar, mobil düzen, axe.

Açmak için: YZ_E2E=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium .venv/bin/python -m pytest tests/e2e
Gerekenler: `uv pip install -e ".[e2e]"` (playwright); ilk koşuda axe-core npm'den indirilir
(.yz/e2e/ altına; ağ gerekir). Ekran görüntüleri docs/ekran/ altına yazılır (deviceScaleFactor 2).
"""

import io
import os
import socket
import tarfile
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        os.environ.get("YZ_E2E") != "1", reason="tarayıcı testleri kapalı (YZ_E2E=1 ile açın)"
    ),
]

KOK = Path(__file__).resolve().parents[2]
EKRAN = KOK / "docs" / "ekran"
AXE_SURUM = "4.14.0"  # npm'de 2026-10-05'te yayımlandı (MPL-2.0)
GORUNUMLER = [(390, 844), (360, 800)]


def _axe() -> str:
    yol = KOK / ".yz" / "e2e" / f"axe-{AXE_SURUM}.min.js"
    if not yol.is_file():
        adres = f"https://registry.npmjs.org/axe-core/-/axe-core-{AXE_SURUM}.tgz"
        veri = httpx.get(adres, timeout=60).raise_for_status().content
        with tarfile.open(fileobj=io.BytesIO(veri)) as arsiv:
            dosya = arsiv.extractfile("package/axe.min.js")
            assert dosya is not None
            yol.parent.mkdir(parents=True, exist_ok=True)
            yol.write_bytes(dosya.read())
    return yol.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def adres(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    import uvicorn

    from yz.ayar import Ayarlar
    from yz.saglayici.sahte import Sahte
    from yz.sunucu.uygulama import uygulama_kur

    ayarlar = Ayarlar(veri_dizini=tmp_path_factory.mktemp("veri"))
    uygulama = uygulama_kur(
        ayarlar,
        saglayici_fabrikasi=lambda p, m: Sahte.gosterim(parca_boyu=4, parca_gecikmesi_sn=0.04),
        ortam={},
    )
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        kapi = s.getsockname()[1]
    sunucu = uvicorn.Server(
        uvicorn.Config(uygulama, host="127.0.0.1", port=kapi, log_level="warning")
    )
    is_parcacigi = threading.Thread(target=sunucu.run, daemon=True)
    is_parcacigi.start()
    bitis = time.monotonic() + 30
    while not sunucu.started and time.monotonic() < bitis:
        time.sleep(0.05)
    yield f"http://127.0.0.1:{kapi}/"
    sunucu.should_exit = True
    is_parcacigi.join(10)


@pytest.fixture(scope="module")
def tarayici() -> Iterator[object]:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        yol = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") or None
        tarayici = p.chromium.launch(executable_path=yol)
        yield tarayici
        tarayici.close()


def _sayfa(tarayici: object, genislik: int, yukseklik: int):  # type: ignore[no-untyped-def]
    baglam = tarayici.new_context(
        viewport={"width": genislik, "height": yukseklik}, device_scale_factor=2
    )  # type: ignore[attr-defined]
    return baglam.new_page()


def _yatay_kaydirma_yok(sayfa) -> bool:  # type: ignore[no-untyped-def]
    return bool(
        sayfa.evaluate(
            "document.documentElement.scrollWidth <= document.documentElement.clientWidth"
        )
    )


def _axe_ihlalleri(sayfa) -> list[str]:  # type: ignore[no-untyped-def]
    sayfa.add_script_tag(content=_axe())
    sonuc = sayfa.evaluate(
        "async () => (await axe.run()).violations.map(v => [v.id, v.impact, v.nodes.length])"
    )
    return [f"{k} ({etki}, {n} öğe)" for k, etki, n in sonuc if etki in ("critical", "serious")]


@pytest.mark.parametrize(("genislik", "yukseklik"), GORUNUMLER)
def test_akisli_yanit_ve_mobil_duzen(adres, tarayici, genislik, yukseklik):
    sayfa = _sayfa(tarayici, genislik, yukseklik)
    sayfa.goto(adres)
    sayfa.wait_for_selector("body[data-hazir='1']")
    assert sayfa.locator("#saglayici option").count() >= 1
    sayfa.fill("#girdi", "Küçük modellerle güvenilir iş nasıl yapılır?")
    sayfa.click("#gonder")
    yanit = sayfa.locator(".mesaj.asistan .govde").last
    uzunluklar: list[int] = []
    bitis = time.monotonic() + 30
    while time.monotonic() < bitis and sayfa.locator(".mesaj.asistan .bilgi").count() == 0:
        uzunluklar.append(len(yanit.inner_text()))
        time.sleep(0.05)
    assert sayfa.locator(".mesaj.asistan .bilgi").count() == 1, "yanıt tamamlanmadı"
    ara_uzunluklar = sorted(set(uzunluklar))
    assert len(ara_uzunluklar) >= 3, f"akış gözlenmedi (ara uzunluklar: {ara_uzunluklar})"
    assert "gösterim yanıtıdır" in yanit.inner_text()
    assert _yatay_kaydirma_yok(sayfa)
    for secici in ("#gonder", "#yukle", "#girdi", "#kip", "#saglayici", "#yeni"):
        kutu = sayfa.locator(secici).bounding_box()
        assert kutu is not None and kutu["height"] >= 44, f"{secici} dokunma alanı 44 px'ten küçük"
    sayfa.screenshot(path=str(EKRAN / f"sohbet-{genislik}x{yukseklik}.png"))
    assert _axe_ihlalleri(sayfa) == []


def test_belge_yukle_ve_kaynakli_yanit(adres, tarayici, tmp_path):
    belge = tmp_path / "iade-politikasi.md"
    belge.write_text(
        "# İade\n\nÜrünler teslimattan sonra 14 gün içinde iade edilebilir.\n", encoding="utf-8"
    )
    sayfa = _sayfa(tarayici, *GORUNUMLER[0])
    sayfa.goto(adres)
    sayfa.wait_for_selector("body[data-hazir='1']")
    sayfa.set_input_files("#dosya", str(belge))
    sayfa.wait_for_function("document.getElementById('durum').textContent.includes('yüklendi')")
    assert sayfa.locator("#kip").input_value() == "rag"
    sayfa.fill("#girdi", "Ürünü kaç gün içinde iade edebilirim?")
    sayfa.click("#gonder")
    sayfa.wait_for_selector(".mesaj.asistan .bilgi", timeout=30_000)
    assert "14 gün" in sayfa.locator(".mesaj.asistan .govde").last.inner_text()
    ayrinti = sayfa.locator(".mesaj.asistan details").first
    ayrinti.locator("summary").click()
    assert "iade-politikasi.md" in ayrinti.inner_text()
    assert _yatay_kaydirma_yok(sayfa)
    sayfa.screenshot(path=str(EKRAN / "belgeye-sor-390x844.png"))
    assert _axe_ihlalleri(sayfa) == []


def test_ajan_dokumu_goruntuleyici(adres, tarayici, tmp_path):
    from yz.ajan.dongu import Ajan
    from yz.arac.hazir import hesap_araci
    from yz.saglayici.sahte import Sahte

    sahte = Sahte([Sahte.arac_yaniti("hesapla", {"ifade": "6*7"}), "Sonuç 42."])
    Ajan(sahte, [hesap_araci]).calistir("6*7?").dokum_kaydet(tmp_path / "dokum.jsonl")
    sayfa = _sayfa(tarayici, *GORUNUMLER[1])
    sayfa.goto(adres + "kayit.html")
    sayfa.wait_for_function("document.querySelector('h1').textContent.length > 0")
    sayfa.set_input_files("#dosya", str(tmp_path / "dokum.jsonl"))
    sayfa.wait_for_selector(".adim.arac")
    metin = sayfa.locator("#liste").inner_text()
    assert "hesapla" in metin and "42" in metin and "Durma nedeni: yanit" in metin
    assert _yatay_kaydirma_yok(sayfa)
    sayfa.screenshot(path=str(EKRAN / "ajan-dokumu-360x800.png"))
    assert _axe_ihlalleri(sayfa) == []
