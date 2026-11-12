"""Deneme POS'u: siparişleri HTTP ile alır, fişi ekrana yazar, sözleşmeyi alıcı tarafın göreceği gibi uygular.

- Aynı `Idempotency-Key` ikinci kez gelirse yok sayar (yine 200 döner).
- Siparişi numarasına göre tutar; yalnız daha yüksek revizyon eskisinin yerine geçer.
- `GET /` açık siparişlerin son hâlini JSON olarak verir.

    python -m yemekhane_kasa pos-simulator --port 8099
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from yemekhane_kasa.pos import fis_metni


class PosSimulator(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, adres: tuple[str, int], sessiz: bool = False) -> None:
        super().__init__(adres, _Isleyici)
        self.sessiz = sessiz
        self.kilit = threading.Lock()
        self.alinanlar: list[dict[str, Any]] = []  # tekrarlar hariç, geliş sırasıyla
        self.siparisler: dict[str, dict[str, Any]] = {}  # siparis_no → en yüksek revizyon
        self.kapananlar: list[str] = []
        self.tekrar_sayisi = 0
        self._anahtarlar: set[str] = set()

    def isle(self, anahtar: str | None, mesaj: dict[str, Any]) -> str:
        with self.kilit:
            if anahtar and anahtar in self._anahtarlar:
                self.tekrar_sayisi += 1
                return "tekrar"
            if anahtar:
                self._anahtarlar.add(anahtar)
            self.alinanlar.append(mesaj)
            no = mesaj["siparis_no"]
            if mesaj["islem"] == "kapandi":
                self.kapananlar.append(no)
            elif no not in self.siparisler or mesaj["revizyon"] > self.siparisler[no]["revizyon"]:
                self.siparisler[no] = mesaj
        if not self.sessiz:
            print(fis_metni(mesaj), flush=True)
        return "alindi"


class _Isleyici(BaseHTTPRequestHandler):
    server: PosSimulator

    def do_POST(self) -> None:  # noqa: N802 — http.server adı
        try:
            uzunluk = int(self.headers.get("Content-Length", "0"))
            mesaj = json.loads(self.rfile.read(uzunluk).decode("utf-8"))
            if not isinstance(mesaj, dict) or "siparis_no" not in mesaj or "islem" not in mesaj:
                raise ValueError("siparis_no ve islem gerekli")
        except (ValueError, UnicodeDecodeError) as e:
            self._yanitla(400, {"hata": str(e)})
            return
        durum = self.server.isle(self.headers.get("Idempotency-Key"), mesaj)
        self._yanitla(200, {"durum": durum})

    def do_GET(self) -> None:  # noqa: N802
        with self.server.kilit:
            self._yanitla(200, {"siparisler": list(self.server.siparisler.values())})

    def _yanitla(self, kod: int, veri: dict[str, Any]) -> None:
        govde = json.dumps(veri, ensure_ascii=False).encode("utf-8")
        self.send_response(kod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(govde)))
        self.end_headers()
        self.wfile.write(govde)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 — http.server imzası
        pass


def calistir(host: str = "127.0.0.1", port: int = 8099) -> None:
    sunucu = PosSimulator((host, port))
    print(f"POS simülatörü dinliyor: http://{host}:{sunucu.server_port}/siparis  (durdurmak için Ctrl+C)", flush=True)
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        sunucu.server_close()
