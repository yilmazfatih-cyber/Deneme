"""Testlerin ortak parçaları: örnek işletme, sabit saat, yerel sahte HTTP sunucusu."""

from __future__ import annotations

import json
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from esnaf.depo import Depo
from esnaf.yapilandirma import Isletme, sozlukten, yukle
from esnaf.yonlendirici import Yonlendirici

KOK = Path(__file__).resolve().parent.parent
ORNEK = KOK / "ornek" / "isletme.json"
PAZARTESI_9 = datetime(2026, 11, 9, 9, 0)  # sabit yerel "şimdi": 9 Kasım 2026 Pazartesi 09:00


def isletme() -> Isletme:
    return yukle(ORNEK)


def ornek_sozluk() -> dict:
    """Örnek yapılandırmanın değiştirilebilir kopyası (doğrulama testleri için)."""
    return json.loads(ORNEK.read_text(encoding="utf-8"))


def isletme_ile(**degisiklik: object) -> Isletme:
    veri = ornek_sozluk()
    veri.update(degisiklik)
    return sozlukten(veri)


def yonlendirici(test, isl: Isletme | None = None, simdi: datetime = PAZARTESI_9, ajan=None) -> Yonlendirici:
    """Bellek içi veritabanlı yönlendirici; test bitince veritabanını kapatır."""
    saat = {"an": simdi}
    depo = Depo(":memory:")
    test.addCleanup(depo.kapat)
    y = Yonlendirici(isl or isletme(), depo, saat=lambda: saat["an"], ajan=ajan)
    y.saat_ayari = saat  # testler zamanı ilerletebilsin
    return y


class SahteSunucu:
    """Sırayla hazır JSON yanıtları döndüren, gelen istekleri kaydeden yerel HTTP sunucusu.

    yanitla(yol, govde) (kod, yanıt) döndürür; yanıt bayt ise olduğu gibi yazılır, değilse JSON'a çevrilir.
    """

    def __init__(self, yanitla) -> None:
        self.istekler: list[tuple[str, dict, dict]] = []  # (yol, gövde, başlıklar)
        dis = self

        class Isleyici(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                uzunluk = int(self.headers.get("Content-Length", "0"))
                govde = json.loads(self.rfile.read(uzunluk) or b"{}")
                dis.istekler.append((self.path, govde, dict(self.headers)))
                kod, yanit = yanitla(self.path, govde)
                veri = yanit if isinstance(yanit, bytes) else json.dumps(yanit).encode("utf-8")
                self.send_response(kod)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(veri)))
                self.end_headers()
                self.wfile.write(veri)

            def log_message(self, *args: object) -> None:
                return

        self.sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
        self.url = f"http://127.0.0.1:{self.sunucu.server_address[1]}"
        threading.Thread(target=self.sunucu.serve_forever, daemon=True).start()

    def kapat(self) -> None:
        self.sunucu.shutdown()
        self.sunucu.server_close()
