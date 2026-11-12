"""n8n'in HTTP Request düğümüyle tetikleyeceği küçük uç nokta.

Neden komut değil HTTP: n8n'de Execute Command düğümü güvenlik gereği varsayılan olarak yüklenmez
(n8n-io/n8n @ 5ee06d3, packages/@n8n/config/src/configs/nodes.config.ts → NODES_EXCLUDE varsayılanı
"n8n-nodes-base.executeCommand" ve "n8n-nodes-base.localFileTrigger").

POST /calistir  (başlık X-Radar-Anahtari)  → bir tarama turu, JSON özet
GET  /saglik                                → {"durum": "hazır"}

Güvenlik: anahtar sabit sürede karşılaştırılır; gövde, anahtar denetiminden sonra ve en çok 64 KiB okunur (kimliksiz
istemci sunucuya büyük gövde okutamaz); yavaş istemciler 30 sn sonra düşürülür; aynı anda tek tur çalışır.
Sunucu düz HTTP konuşur: 127.0.0.1'de ya da dışarıya kapalı bir Docker ağında çalıştırın, açık ağda TLS'li ters vekil
kullanın.
"""

import hmac
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ANAHTAR_BASLIGI = "X-Radar-Anahtari"
AZAMI_GOVDE = 64 * 1024


def sunucu_kur(adres: str, port: int, anahtar: str, tur_calistir) -> ThreadingHTTPServer:
    if not anahtar:
        raise ValueError("Sunucu anahtarsız açılmaz: RADAR_ANAHTARI ortam değişkenini ayarlayın.")
    kilit = threading.Lock()

    class Isleyici(BaseHTTPRequestHandler):
        timeout = 30  # soket okuma/yazma zaman aşımı (yavaş istemci saldırısına karşı)

        def _yaz(self, durum: int, veri: dict, kapat: bool = False) -> None:
            govde = json.dumps(veri, ensure_ascii=False).encode("utf-8")
            if kapat:
                self.close_connection = True
            self.send_response(durum)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(govde)))
            if kapat:
                self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(govde)

        def do_GET(self):
            if self.path == "/saglik":
                self._yaz(200, {"durum": "hazır"})
            else:
                self._yaz(404, {"hata": "bulunamadı"})

        def do_POST(self):
            # Sıra önemli: önce yol ve anahtar, sonra gövde. Gövde hiç okunmadan yanıtlanan istekte bağlantı kapanır.
            if self.path != "/calistir":
                return self._yaz(404, {"hata": "bulunamadı"}, kapat=True)
            if not hmac.compare_digest(self.headers.get(ANAHTAR_BASLIGI, "").encode(), anahtar.encode()):
                return self._yaz(401, {"hata": "geçersiz anahtar"}, kapat=True)
            if hata := self._govdeyi_bosalt():
                return self._yaz(*hata, kapat=True)
            if not kilit.acquire(blocking=False):
                return self._yaz(409, {"hata": "önceki tarama sürüyor"})
            try:
                self._yaz(200, tur_calistir())
            except Exception as hata:  # n8n hata dalına düşsün diye 500 döner (istemci kimliği doğrulanmıştır)
                self._yaz(500, {"hata": f"{type(hata).__name__}: {str(hata)[:300]}"})
            finally:
                kilit.release()

        def _govdeyi_bosalt(self) -> tuple[int, dict] | None:
            """Gövde kullanılmaz ama okunur (okunmamış veriyle kapanan bağlantı yanıtı yarıda kesebilir). En çok 64 KiB."""
            if self.headers.get("Transfer-Encoding", "").strip().lower() == "chunked":
                toplam = 0
                while True:
                    try:
                        boy = int(self.rfile.readline(64).split(b";")[0].strip(), 16)
                    except ValueError:
                        boy = -1
                    if boy < 0:  # int("-5", 16) negatif olur; read(-n) EOF'a kadar beklerdi
                        return 400, {"hata": "bozuk parçalı gövde"}
                    toplam += boy
                    if toplam > AZAMI_GOVDE:
                        return 413, {"hata": "gövde çok büyük"}
                    if boy == 0:
                        while self.rfile.readline(1024) not in (b"\r\n", b"\n", b""):
                            pass
                        return None
                    self.rfile.read(boy + 2)  # parça + CRLF
            uzunluk = (self.headers.get("Content-Length") or "0").strip()
            if not uzunluk.isdigit():
                return 400, {"hata": "geçersiz Content-Length"}
            if int(uzunluk) > AZAMI_GOVDE:
                return 413, {"hata": "gövde çok büyük"}
            self.rfile.read(int(uzunluk))
            return None

        def log_message(self, *args):
            pass

    return ThreadingHTTPServer((adres, port), Isleyici)
