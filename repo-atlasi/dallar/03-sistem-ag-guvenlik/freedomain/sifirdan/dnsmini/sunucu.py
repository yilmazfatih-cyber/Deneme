"""UDP + TCP üzerinden yetkili DNS sunucusu.

Yetkili sunucu port 53'te hem UDP hem TCP yanıtlamalıdır: büyük yanıtlar
TC=1 ile kesilir ve istemci aynı porttan TCP ile yeniden sorar (RFC 7766).
TCP'de her mesajın önünde 2 baytlık uzunluk alanı vardır (RFC 1035 §4.2.2).

Kullanım (ayrıcalıksız port):
    python3 -m dnsmini.sunucu ornekler/ornek.test.zone --port 5353
    python3 -m dnsmini.istemci www.ornek.test A --sunucu 127.0.0.1 --port 5353
"""

import argparse
import socketserver
import struct
import threading
import time

from . import bolge as bolge_mod
from . import yanit as yanit_mod


class HizSinirlayici:
    """Kaynak IP başına jeton kovası: yanıt hızı sınırlama (RRL'nin çekirdeği).

    Sahte kaynak adresli sorgularla yapılan yansıtma/yükseltme saldırılarında
    sunucunun kurbana trafik pompalamasını sınırlar. Kova boşaldığında yanıtlar
    düşürülür; yalnız her `kayma` yanıttan biri ("slip") TC=1 ile kısaltılarak
    gönderilir: gerçek istemci TCP'ye geçip yanıtını alır, sahte adresli
    saldırı ise yükseltme kazanamaz."""

    def __init__(self, saniyede=50.0, kova=100.0, kayma=2, saat=time.monotonic):
        self.saniyede, self.kova, self.kayma, self.saat = saniyede, kova, kayma, saat
        self._durum = {}
        self._kilit = threading.Lock()

    def karar(self, ip):
        """'gonder', 'kisalt' ya da 'dusur' döndürür."""
        with self._kilit:
            simdi = self.saat()
            jeton, son, reddedilen = self._durum.get(ip, (self.kova, simdi, 0))
            jeton = min(self.kova, jeton + (simdi - son) * self.saniyede)
            if jeton >= 1:
                self._durum[ip] = (jeton - 1, simdi, 0)
                return "gonder"
            reddedilen += 1
            self._durum[ip] = (jeton, simdi, reddedilen)
            return "kisalt" if self.kayma and reddedilen % self.kayma == 0 else "dusur"


class _UdpIsleyici(socketserver.BaseRequestHandler):
    def handle(self):
        veri, soket = self.request
        sunucu = self.server.dns
        karar = sunucu.sinirlayici.karar(self.client_address[0])
        if karar == "dusur":
            return
        azami = yanit_mod.UDP_SINIRI if karar == "gonder" else 0  # 0: her yanıt TC=1 ile kısalır
        yanit = yanit_mod.cevapla(veri, sunucu.bolgeler, azami_boy=azami)
        if yanit is not None:
            soket.sendto(yanit, self.client_address)


class _TcpIsleyici(socketserver.StreamRequestHandler):
    timeout = 5  # boşta bekleyen bağlantılar kaynak tüketmesin

    def handle(self):
        while True:  # bir bağlantıda birden çok sorgu olabilir
            try:
                on_ek = self.rfile.read(2)
            except OSError:
                return
            if len(on_ek) < 2:
                return
            uzunluk = struct.unpack("!H", on_ek)[0]
            veri = self.rfile.read(uzunluk)
            if len(veri) < uzunluk:
                return
            yanit = yanit_mod.cevapla(veri, self.server.dns.bolgeler, azami_boy=65535)
            if yanit is None:
                return
            self.wfile.write(struct.pack("!H", len(yanit)) + yanit)


class _UdpSunucu(socketserver.ThreadingUDPServer):
    daemon_threads = True
    allow_reuse_address = True


class _TcpSunucu(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = True


class DnsSunucusu:
    """Aynı port numarasında UDP ve TCP dinler. port=0 → boş bir port seçilir."""

    def __init__(self, bolgeler, adres="127.0.0.1", port=0, sinirlayici=None):
        self.bolgeler = list(bolgeler)
        self.sinirlayici = sinirlayici or HizSinirlayici()
        son_hata = None
        for _ in range(20):  # UDP'nin aldığı port TCP'de doluysa yeniden dene
            udp = _UdpSunucu((adres, port), _UdpIsleyici)
            try:
                tcp = _TcpSunucu((adres, udp.server_address[1]), _TcpIsleyici)
            except OSError as e:
                udp.server_close()
                son_hata = e
                if port:
                    raise
                continue
            self._udp, self._tcp = udp, tcp
            break
        else:
            raise son_hata
        for s in (self._udp, self._tcp):
            s.dns = self
        self._iplikler = []

    @property
    def port(self):
        return self._udp.server_address[1]

    def baslat(self):
        for s in (self._udp, self._tcp):
            t = threading.Thread(target=s.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
            t.start()
            self._iplikler.append(t)
        return self

    def durdur(self):
        for s in (self._udp, self._tcp):
            s.shutdown()
            s.server_close()

    def __enter__(self):
        return self.baslat()

    def __exit__(self, *_):
        self.durdur()


def main(argv=None):
    p = argparse.ArgumentParser(description="dnsmini yetkili DNS sunucusu")
    p.add_argument("bolge_dosyalari", nargs="+")
    p.add_argument("--adres", default="127.0.0.1")
    p.add_argument("--port", type=int, default=5353)
    a = p.parse_args(argv)
    bolgeler = []
    for yol in a.bolge_dosyalari:
        with open(yol, encoding="utf-8") as f:
            bolgeler.append(bolge_mod.oku(f.read()))
    with DnsSunucusu(bolgeler, a.adres, a.port) as s:
        print(f"dinleniyor: {a.adres}:{s.port} (UDP+TCP), bölgeler: {', '.join(b.koken for b in bolgeler)}")
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
