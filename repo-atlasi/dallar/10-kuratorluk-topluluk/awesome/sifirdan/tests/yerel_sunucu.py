"""Testler için yerel HTTP sunucusu: internete çıkmadan 200/301/404/zaman aşımı üretir."""

from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# yol -> (durum, ek başlıklar). Özel davranışlar _yanitla içinde.
SABIT = {
    "/tamam": (200, {}),
    "/tasindi": (301, {"Location": "/tamam"}),
    "/gecici": (302, {"Location": "/tamam"}),
    "/zincir": (308, {"Location": "/tasindi"}),
    "/dongu": (301, {"Location": "/dongu"}),
    "/yok": (404, {}),
    "/gitti": (410, {}),
    "/hata": (500, {}),
    "/yasak": (403, {}),
}


class _Isleyici(BaseHTTPRequestHandler):
    server: "YerelSunucu"

    def log_message(self, *args) -> None:  # test çıktısını kirletme
        pass

    def _gonder(self, durum: int, basliklar: dict[str, str] | None = None) -> None:
        self.send_response(durum)
        for ad, deger in (basliklar or {}).items():
            self.send_header(ad, deger)
        self.send_header("Content-Length", "2")
        self.end_headers()
        if self.command == "GET":
            self.wfile.write(b"ok")

    def _yanitla(self) -> None:
        yol = self.path.split("?")[0]
        sunucu = self.server
        with sunucu.kilit:
            sunucu.istekler.append((self.command, self.path))
            sunucu.aktif += 1
            sunucu.en_cok_aktif = max(sunucu.en_cok_aktif, sunucu.aktif)
        try:
            if yol in SABIT:
                self._gonder(*SABIT[yol])
            elif yol == "/yavas":
                time.sleep(1.0)
                self._gonder(200)
            elif yol == "/bekle":
                time.sleep(0.3)
                self._gonder(200)
            elif yol == "/head-yasak":
                self._gonder(405 if self.command == "HEAD" else 200)
            elif yol == "/kalabalik":
                with sunucu.kilit:
                    sunucu.kalabalik_sayaci += 1
                    ilk = sunucu.kalabalik_sayaci == 1
                if ilk:
                    self._gonder(429, {"Retry-After": "0"})
                else:
                    self._gonder(200)
            else:
                self._gonder(404)
        finally:
            with sunucu.kilit:
                sunucu.aktif -= 1

    do_GET = _yanitla
    do_HEAD = _yanitla


class YerelSunucu(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self) -> None:
        super().__init__(("127.0.0.1", 0), _Isleyici)
        self.kilit = threading.Lock()
        self.istekler: list[tuple[str, str]] = []
        self.aktif = 0
        self.en_cok_aktif = 0
        self.kalabalik_sayaci = 0
        self._is = threading.Thread(target=self.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)

    def handle_error(self, request, client_address) -> None:  # istemci zaman aşımında bağlantıyı keser
        pass

    def adres(self, yol: str) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}{yol}"

    def __enter__(self) -> "YerelSunucu":
        self._is.start()
        return self

    def __exit__(self, *exc) -> None:
        self.shutdown()
        self.server_close()
