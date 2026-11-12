"""Testler için 127.0.0.1'de çalışan sahte "rakip mağaza" + sahte Firecrawl + sahte Telegram (internet gerekmez)."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def urun_sayfasi(fiyat: str, eski: str | None = None, stok: str = "Sepete Ekle", kampanya: str = "") -> str:
    eski_html = f"<del>{eski}</del>" if eski else ""
    return (
        '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ürün</title></head><body>'
        f'<h1>Filtre kahve makinesi X100</h1><div class="fiyat">{eski_html} <span>{fiyat}</span></div>'
        f"<p>{kampanya}</p><button>{stok}</button></body></html>"
    )


class YerelSunucu:
    """sayfalar: {yol: yanıt}. Yanıt: html metni, (durum, başlıklar, gövde) üçlüsü ya da bunların listesi (her istekte
    sıradaki; sonuncusu tekrarlanır). robots: robots.txt metni (None → 404). POST /bot... sahte Telegram, diğer POST'lar
    sahte Firecrawl'dır; hepsi `istekler`e, GET yolları `getler`e kaydedilir."""

    def __init__(self, sayfalar: dict, robots: str | None = "User-agent: *\nDisallow: /gizli\n"):
        self.sayfalar, self.robots, self.istekler, self.getler = sayfalar, robots, [], []
        self.firecrawl_yaniti, self.telegram_yaniti = None, (200, {"ok": True, "result": {"message_id": 1}})
        sahip = self

        class Isleyici(BaseHTTPRequestHandler):
            def _yaz(self, durum, govde, basliklar=None):
                govde = govde.encode() if isinstance(govde, str) else govde
                basliklar = {"Content-Type": "text/html; charset=utf-8", **(basliklar or {})}
                self.send_response(durum)
                for ad, deger in basliklar.items():
                    self.send_header(ad, deger)
                self.send_header("Content-Length", str(len(govde)))
                self.end_headers()
                self.wfile.write(govde)

            def do_GET(self):
                sahip.getler.append(self.path)
                if self.path == "/robots.txt":
                    if sahip.robots is None:
                        return self._yaz(404, "yok")
                    return self._yaz(200, sahip.robots, {"Content-Type": "text/plain"})
                yanit = sahip.sayfalar.get(self.path)
                if isinstance(yanit, list):
                    yanit = yanit.pop(0) if len(yanit) > 1 else yanit[0]
                if yanit is None:
                    return self._yaz(404, "yok")
                if isinstance(yanit, tuple):
                    return self._yaz(yanit[0], yanit[2], yanit[1])
                self._yaz(200, yanit)

            def do_POST(self):
                govde = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                sahip.istekler.append({"yol": self.path, "yetki": self.headers.get("Authorization"), "govde": govde})
                if self.path.startswith("/bot"):
                    durum, yanit = sahip.telegram_yaniti
                    return self._yaz(durum, json.dumps(yanit), {"Content-Type": "application/json"})
                yanit = sahip.firecrawl_yaniti or {"success": False, "error": "yapılandırılmadı"}
                ham = yanit if isinstance(yanit, bytes) else json.dumps(yanit).encode()
                self._yaz(200, ham, {"Content-Type": "application/json"})

            def log_message(self, *args):
                pass

        self.sunucu = ThreadingHTTPServer(("127.0.0.1", 0), Isleyici)
        self.adres = f"http://127.0.0.1:{self.sunucu.server_address[1]}"

    def __enter__(self):
        threading.Thread(target=self.sunucu.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True).start()
        return self

    def __exit__(self, *a):
        self.sunucu.shutdown()
        self.sunucu.server_close()
