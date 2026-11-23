"""Süreç yönetimi ve HTTP yardımcısı: gerçek bir küçük sunucu (python -m http.server) boş kapıda başlar,
sağlık beklenir, istek atılır, kapatılınca alt süreç kalmaz; ölen sunucu yol gösteren hata verir.

Genişletme: Surec'e yeni bir davranış eklenirse burada gerçek bir süreçle sınayın (sahte değil).
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from tarifcik.sunucu import Surec, SurecHatasi, bos_kapi, http_istek


def test_surec_baslar_saglik_bekler_ve_kapanir(tmp_path: Path) -> None:
    (tmp_path / "saglik").write_text("ok", encoding="utf-8")
    kapi = bos_kapi()
    komut = [sys.executable, "-m", "http.server", str(kapi), "--bind", "127.0.0.1"]
    with Surec("http.server", komut, tmp_path, None, tmp_path / "gunluk.txt") as surec:
        surec.saglik_bekle(f"http://127.0.0.1:{kapi}/saglik", sure_sn=30)
        durum, _, govde = http_istek("GET", f"http://127.0.0.1:{kapi}/saglik")
        assert (durum, govde) == (200, "ok")
        pid = surec._surec.pid if surec._surec else 0
    assert not surec.calisiyor
    with pytest.raises(ProcessLookupError):
        os.kill(pid, 0)


def test_olen_surec_gunlukle_hata_verir(tmp_path: Path) -> None:
    komut = [sys.executable, "-c", "import sys; print('ayar eksik: X'); sys.exit(3)"]
    with (
        Surec("bozuk", komut, tmp_path, None, tmp_path / "g.txt") as surec,
        pytest.raises(SurecHatasi, match="ayar eksik"),
    ):
        surec.saglik_bekle(f"http://127.0.0.1:{bos_kapi()}/", sure_sn=20)


class _Yankici(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        uzunluk = int(self.headers.get("Content-Length", "0"))
        govde = json.loads(self.rfile.read(uzunluk))
        cevap = json.dumps({"gelen": govde, "yetki": self.headers.get("Authorization")}).encode()
        self.send_response(201 if govde.get("tamam") else 400)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(cevap)

    def log_message(self, *_args: object) -> None:
        return


def test_http_istek_json_gonderir_hata_kodunu_dondurur() -> None:
    sunucu = ThreadingHTTPServer(("127.0.0.1", 0), _Yankici)
    is_parcacigi = threading.Thread(target=sunucu.serve_forever, daemon=True)
    is_parcacigi.start()
    try:
        url = f"http://127.0.0.1:{sunucu.server_address[1]}/"
        durum, basliklar, govde = http_istek(
            "POST", url, {"tamam": True, "ad": "Ayşe"}, {"Authorization": "Bearer x"}
        )
        assert durum == 201
        assert basliklar["Content-Type"] == "application/json"
        assert govde == {"gelen": {"tamam": True, "ad": "Ayşe"}, "yetki": "Bearer x"}
        durum, _, _ = http_istek("POST", url, {"tamam": False})
        assert durum == 400
    finally:
        sunucu.shutdown()
        sunucu.server_close()
