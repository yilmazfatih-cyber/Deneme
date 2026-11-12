"""Küçük MCP istemcisi: sunucuyu alt süreç olarak başlatır, stdio üzerinden konuşur.

Bir ajan barındırıcısı (Claude Code, Codex ...) özünde bunu yapar: süreci
başlatır, initialize el sıkışması yapar, tools/list ile kataloğu alır ve
modelin seçtiği araçları tools/call ile çağırır.

Tanıtım: python3 -m reamini.istemci /yol/ikili
"""

import json
import os
import subprocess
import sys


class McpHatasi(Exception):
    def __init__(self, hata):
        super().__init__(f"{hata['code']}: {hata['message']}")
        self.kod = hata["code"]


class Istemci:
    def __init__(self, kokler, python=sys.executable):
        paket_dizini = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        komut = [python, "-B", "-m", "reamini.sunucu"] + [x for k in kokler for x in ("--kok", k)]
        self.surec = subprocess.Popen(komut, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True, encoding="utf-8", bufsize=1, cwd=paket_dizini)
        self._sayac = 0

    def gonder_ham(self, satir):
        self.surec.stdin.write(satir + "\n")
        self.surec.stdin.flush()

    def oku(self):
        satir = self.surec.stdout.readline()
        if not satir:
            raise ConnectionError("sunucu kapandı: " + self.surec.stderr.read())
        return json.loads(satir)

    def istek(self, yontem, params=None):
        self._sayac += 1
        mesaj = {"jsonrpc": "2.0", "id": self._sayac, "method": yontem}
        if params is not None:
            mesaj["params"] = params
        self.gonder_ham(json.dumps(mesaj, ensure_ascii=False))
        yanit = self.oku()
        if yanit.get("id") != self._sayac:
            raise ValueError(f"beklenmeyen yanıt kimliği: {yanit}")
        if "error" in yanit:
            raise McpHatasi(yanit["error"])
        return yanit["result"]

    def bildirim(self, yontem, params=None):
        mesaj = {"jsonrpc": "2.0", "method": yontem}
        if params is not None:
            mesaj["params"] = params
        self.gonder_ham(json.dumps(mesaj))

    def baslat(self, surum="2025-06-18"):
        sonuc = self.istek("initialize", {"protocolVersion": surum, "capabilities": {},
                                          "clientInfo": {"name": "reamini-istemci", "version": "0.1.0"}})
        self.bildirim("notifications/initialized")
        return sonuc

    def araclar(self):
        return self.istek("tools/list")["tools"]

    def cagir(self, arac_adi, /, **argumanlar):
        # '/' : araç adı yalnız konumsal; böylece araçların kendi 'ad' argümanıyla çakışmaz.
        return self.istek("tools/call", {"name": arac_adi, "arguments": argumanlar})

    def kapat(self):
        if self.surec.stdin and not self.surec.stdin.closed:
            self.surec.stdin.close()
        self.surec.wait(timeout=5)
        self.surec.stdout.close()
        self.surec.stderr.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.kapat()


def main(argv=None):
    argv = argv or sys.argv[1:]
    if len(argv) != 1:
        print("kullanım: python3 -m reamini.istemci /yol/ikili", file=sys.stderr)
        return 2
    yol = os.path.abspath(argv[0])
    with Istemci([os.path.dirname(yol)]) as m:
        bilgi = m.baslat()
        print(f"sunucu: {bilgi['serverInfo']['name']} · protokol {bilgi['protocolVersion']}")
        print("araçlar:", ", ".join(a["name"] for a in m.araclar()))
        for ad in ("elf_basligi", "sertlestirme_denetle"):
            print(f"\n## {ad}\n" + json.dumps(m.cagir(ad, yol=yol)["structuredContent"], ensure_ascii=False, indent=2))
        f = m.cagir("fonksiyonlari_listele", yol=yol, azami=10)["structuredContent"]
        print("\n## fonksiyonlar")
        for x in f["fonksiyonlar"]:
            print(f"  {x['adres']:#010x}  {x['boyut']:5d}  {x['ad']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
