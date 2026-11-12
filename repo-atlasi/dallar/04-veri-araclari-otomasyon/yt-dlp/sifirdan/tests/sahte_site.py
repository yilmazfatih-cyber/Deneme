"""Testler için yerel "video sitesi". İnternete hiç çıkılmaz.

Yollar:
  /izle/<id>    gömülü JSON'lu video sayfası (OrnekVideoIE bunu okur)
  /liste/<id>   video bağlantıları içeren liste sayfası (OrnekListeIE)
  /genel/<ad>   yalnızca <video src> içeren sayfa (GenelIE)
  /medya/<ad>   dosya; Range destekli. Davranışlar: 'kes' (ilk istekte N bayttan
                sonra bağlantıyı kopar), 'range_yok' (Range'i yok say, hep 200 dön)
"""

from __future__ import annotations

import html
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class SahteSite:
    def __init__(self):
        self.dosyalar: dict[str, bytes] = {}
        self.davranis: dict[str, dict] = {}
        self.videolar: dict[str, dict] = {}
        self.listeler: dict[str, dict] = {}
        self.istekler: list[tuple[str, str | None]] = []
        site = self

        class Isleyici(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                site.istekler.append((self.path, self.headers.get('Range')))
                yol = self.path
                if yol.startswith('/izle/'):
                    self._sayfa(site._video_sayfasi(yol[len('/izle/') :]))
                elif yol.startswith('/liste/'):
                    self._sayfa(site._liste_sayfasi(yol[len('/liste/') :]))
                elif yol.startswith('/genel/'):
                    ad = yol[len('/genel/') :]
                    self._sayfa(f'<html><title>{ad} kaydı</title><video src="/medya/{ad}.mp4"></video></html>')
                elif yol.startswith('/medya/'):
                    self._medya(yol[len('/medya/') :])
                else:
                    self._sayfa(None)

            def _sayfa(self, govde: str | None):
                if govde is None:
                    self.send_error(404)
                    return
                veri = govde.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(veri)))
                self.end_headers()
                self.wfile.write(veri)

            def _medya(self, ad: str):
                if ad not in site.dosyalar:
                    self.send_error(404)
                    return
                veri = site.dosyalar[ad]
                davranis = site.davranis.get(ad, {})
                aralik = self.headers.get('Range')
                if aralik and not davranis.get('range_yok'):
                    eslesme = re.match(r'bytes=(\d+)-(\d*)', aralik)
                    bas = int(eslesme.group(1))
                    son = int(eslesme.group(2)) if eslesme.group(2) else len(veri) - 1
                    if bas >= len(veri):
                        self.send_response(416)
                        self.send_header('Content-Range', f'bytes */{len(veri)}')
                        self.send_header('Content-Length', '0')
                        self.end_headers()
                        return
                    parca = veri[bas : son + 1]
                    self.send_response(206)
                    self.send_header('Content-Range', f'bytes {bas}-{bas + len(parca) - 1}/{len(veri)}')
                else:
                    parca = veri
                    self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                self.send_header('Content-Length', str(len(parca)))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                kes = davranis.get('kes')
                if kes is not None and not davranis.get('kesildi'):
                    davranis['kesildi'] = True
                    self.wfile.write(parca[:kes])
                    self.wfile.flush()
                    self.close_connection = True  # Content-Length'ten az bayt: istemci kopukluk görür
                    return
                self.wfile.write(parca)

        self.sunucu = ThreadingHTTPServer(('127.0.0.1', 0), Isleyici)
        self.sunucu.daemon_threads = True
        self.taban = f'http://127.0.0.1:{self.sunucu.server_address[1]}'

    def baslat(self) -> 'SahteSite':
        threading.Thread(target=self.sunucu.serve_forever, daemon=True).start()
        return self

    def durdur(self) -> None:
        self.sunucu.shutdown()
        self.sunucu.server_close()

    # --- içerik --------------------------------------------------------------------------
    def video_ekle(self, video_id: str, baslik: str, formatlar: list[dict], yukleyen: str = 'Deneme Kanalı'):
        """formatlar: [{'id', 'uzanti', 'veri': bytes, ...codec/yükseklik alanları}]"""
        kayitlar = []
        for f in formatlar:
            dosya_adi = f'{video_id}-{f["id"]}.{f["uzanti"]}'
            self.dosyalar[dosya_adi] = f['veri']
            kayit = {k: v for k, v in f.items() if k != 'veri'}
            kayit.update({'url': f'/medya/{dosya_adi}', 'boyut': len(f['veri'])})
            kayitlar.append(kayit)
        self.videolar[video_id] = {'baslik': baslik, 'yukleyen': yukleyen, 'sure': 42, 'formatlar': kayitlar}

    def _video_sayfasi(self, video_id: str) -> str | None:
        video = self.videolar.get(video_id)
        if video is None:
            return None
        veri = json.dumps(video, ensure_ascii=False)
        baslik = html.escape(video['baslik'])
        return (
            f'<html><head><title>{baslik} - Örnek Site</title>'
            f'<meta property="og:title" content="{baslik}">'
            f'<meta property="og:description" content="Yerel test videosu"></head>'
            f'<body><h1>{baslik}</h1><script id="video-verisi" type="application/json">{veri}</script></body></html>'
        )

    def _liste_sayfasi(self, liste_id: str) -> str | None:
        liste = self.listeler.get(liste_id)
        if liste is None:
            return None
        baglantilar = ''.join(f'<li><a class="video" href="/izle/{v}">{v}</a></li>' for v in liste['videolar'])
        return f'<html><body><h1>{html.escape(liste["baslik"])}</h1><ul>{baglantilar}</ul></body></html>'
