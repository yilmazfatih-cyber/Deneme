"""MCP testleri: süreç içi istemci, stdio ve Streamable HTTP üzerinden uçtan uca, ajan köprüsü.

stdio ve HTTP testleri `python -m yz mcp` sürecini başlatır (birkaç saniye sürer); ağ gerekmez
(yalnız 127.0.0.1).
"""

import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

pytest.importorskip("mcp")

from mcp import StdioServerParameters

from yz.ajan import Ajan
from yz.mcp.kopru import McpKoprusu
from yz.mcp.sunucu import mcp_sunucusu_kur
from yz.saglayici import Sahte

KOK = Path(__file__).resolve().parent.parent
BELGELER = KOK / "gorevler" / "getirme" / "belgeler"


def test_surec_ici_araclar_ve_hata_iletimi():
    with McpKoprusu(mcp_sunucusu_kur(belge_klasoru=BELGELER)) as kopru:
        araclar = {a.ad: a for a in kopru.araclar()}
        assert set(araclar) == {
            "hesapla",
            "simdi",
            "tarih_farki",
            "tarih_ekle",
            "belge_ara",
            "dosya_listele",
            "dosya_oku",
        }
        assert araclar["hesapla"].parametreler["required"] == ["ifade"]
        assert araclar["hesapla"].calistir({"ifade": "6*7"}).icerik == "42"
        hata = araclar["hesapla"].calistir({"ifade": "1/0"})
        assert hata.hata and "sıfıra bölme" in hata.icerik  # SDK iletiyi gizlemez (ToolError)
        assert "kargo.md" in araclar["belge_ara"].calistir({"sorgu": "kargo ücreti"}).icerik
        assert araclar["dosya_oku"].calistir({"yol": "../../siniflandirma.yaml"}).hata


def test_belgesiz_sunucu_yalniz_temel_araclar():
    with McpKoprusu(mcp_sunucusu_kur()) as kopru:
        assert {a.ad for a in kopru.araclar()} == {"hesapla", "simdi", "tarih_farki", "tarih_ekle"}


def test_ajan_mcp_araclarini_kullanir():
    with McpKoprusu(mcp_sunucusu_kur()) as kopru:
        sahte = Sahte([Sahte.arac_yaniti("hesapla", {"ifade": "12*12"}), "144"])
        sonuc = Ajan(sahte, kopru.araclar()).calistir("12*12?")
    assert sonuc.yanit == "144" and sonuc.arac_cagrilari[0].icerik == "144"


def test_stdio_uctan_uca():
    parametre = StdioServerParameters(command=sys.executable, args=["-m", "yz", "mcp", "--klasor", str(BELGELER)],
                                      cwd=str(KOK))  # fmt: skip
    with McpKoprusu(parametre, zaman_asimi_sn=60) as kopru:
        araclar = {a.ad: a for a in kopru.araclar()}
        assert araclar["hesapla"].calistir({"ifade": "2**8"}).icerik == "256"
        assert "iade.md" in araclar["belge_ara"].calistir({"sorgu": "iade süresi"}).icerik


def _bos_kapi() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def test_http_uctan_uca():
    kapi = _bos_kapi()
    surec = subprocess.Popen(
        [sys.executable, "-m", "yz", "mcp", "--http", "--kapi", str(kapi)],
        cwd=KOK, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )  # fmt: skip
    try:
        bitis = time.monotonic() + 60
        while time.monotonic() < bitis:
            try:
                socket.create_connection(("127.0.0.1", kapi), timeout=1).close()
                break
            except OSError:
                time.sleep(0.3)
        with McpKoprusu(f"http://127.0.0.1:{kapi}/mcp", zaman_asimi_sn=60) as kopru:
            araclar = {a.ad: a for a in kopru.araclar()}
            assert (
                araclar["tarih_farki"]
                .calistir({"baslangic": "2026-01-01", "bitis": "2026-03-01"})
                .icerik
                == "59 gün"
            )
    finally:
        surec.terminate()
        surec.wait(timeout=20)
