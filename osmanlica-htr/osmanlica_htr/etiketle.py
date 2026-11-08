"""Etiketleme sunucusu: her öğe için modelin A/B/C önerisi, D ile elle yazma.

Yalnızca standart kütüphane (http.server). Tarayıcıda http://127.0.0.1:8765 açılır.
Klavye: 1/2/3 → A/B/C, Enter → D metnini kaydet, S → atla, X → kesim bozuk, Z → geri al.
"""

from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageDraw

from .alfabe import normallestir
from .tahmin import Tahminci

HTML = """<!doctype html>
<html lang="tr" dir="ltr"><head><meta charset="utf-8"><title>Osmanlıca etiketleme</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f6f3ee;--fg:#1d1a16;--kart:#fff;--vurgu:#7a4b12;--cizgi:#d8d0c3}
@media (prefers-color-scheme:dark){:root{--bg:#1c1a17;--fg:#efe9df;--kart:#2a2724;--vurgu:#e0b070;--cizgi:#4a443c}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:16px}
.kart{background:var(--kart);border:1px solid var(--cizgi);border-radius:12px;padding:16px;margin-bottom:14px}
img{max-width:100%;image-rendering:auto;background:#fff;border-radius:6px}
.hedef img{max-height:220px}
.sec{display:flex;flex-direction:column;gap:10px}
button{font:inherit;min-height:56px;border-radius:10px;border:1px solid var(--cizgi);background:var(--kart);color:var(--fg);cursor:pointer;text-align:left;padding:8px 14px}
button:hover{border-color:var(--vurgu)}
.harf{display:inline-block;width:34px;font-weight:700;color:var(--vurgu)}
.osm{font-family:"Amiri","Scheherazade New","Noto Naskh Arabic",serif;font-size:30px;direction:rtl;unicode-bidi:isolate}
.guven{float:right;opacity:.6;font-size:13px}
input[type=text]{font:inherit;width:100%;box-sizing:border-box;min-height:56px;padding:8px 12px;border-radius:10px;border:1px solid var(--cizgi);background:var(--kart);color:var(--fg)}
.sira{display:flex;gap:10px;flex-wrap:wrap}
.sira button{flex:1;text-align:center}
.ust{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.kucuk{opacity:.7;font-size:14px}
.ipucu kbd{border:1px solid var(--cizgi);border-radius:4px;padding:0 5px;font-size:13px}
</style></head><body><main>
<div class="ust"><h1 style="margin:0;font-size:20px">Osmanlıca etiketleme</h1><div id="durum" class="kucuk"></div></div>
<div class="kart hedef"><div id="baglam"></div><div style="margin-top:8px"><img id="goruntu" alt="etiketlenecek kesit"></div>
<div class="kucuk" id="kimlik"></div></div>
<div class="kart sec" id="secenekler"></div>
<div class="kart"><div style="margin-bottom:8px">D) Doğrusunu yazın (Arap harfli):</div>
<input id="d" type="text" class="osm" dir="rtl" lang="ota" autocomplete="off" placeholder="…">
<div class="sira" style="margin-top:10px">
<button onclick="gonder('D', document.getElementById('d').value)">Kaydet (Enter)</button>
<button onclick="gonder('atla','')">Atla (S)</button>
<button onclick="gonder('bozuk','')">Kesim bozuk (X)</button>
<button onclick="geri()">Geri al (Z)</button></div></div>
<div class="kart ipucu kucuk"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> seçenek · <kbd>Enter</kbd> yazdığınızı kaydet · <kbd>S</kbd> atla · <kbd>X</kbd> bozuk · <kbd>Z</kbd> geri ·
<button style="min-height:36px;padding:4px 10px" onclick="egit()">Modeli güncelle</button> <span id="egitim"></span></div>
</main>
<script>
let oge=null;
async function yukle(){
  const r=await fetch('/api/sonraki'); const j=await r.json();
  document.getElementById('durum').textContent=`etiketli ${j.etiketli} · kalan ${j.kalan} · model ${j.model}`;
  if(!j.oge){document.getElementById('secenekler').innerHTML='<b>Kuyruk bitti.</b> Yeni sayfa bölütleyin: osm bolut ...';document.getElementById('goruntu').removeAttribute('src');oge=null;return;}
  oge=j.oge;
  document.getElementById('goruntu').src='/img/'+oge.dosya+'?t='+Date.now();
  document.getElementById('baglam').innerHTML=oge.tur==='kelime'?`<img src="/api/baglam/${encodeURIComponent(oge.kimlik)}" alt="satır bağlamı" style="max-height:120px">`:'';
  document.getElementById('kimlik').textContent=oge.kimlik+' · '+oge.tur;
  const s=document.getElementById('secenekler'); s.innerHTML='';
  const harf=['A','B','C'];
  j.secenekler.forEach((o,i)=>{const b=document.createElement('button');b.innerHTML=`<span class="harf">${harf[i]})</span><span class="osm">${o[0]}</span><span class="guven">%${Math.round(o[1]*100)}</span>`;b.onclick=()=>gonder(harf[i],o[0]);s.appendChild(b);});
  const d=document.getElementById('d'); d.value=j.secenekler.length?j.secenekler[0][0]:''; d.focus(); d.select();
}
async function gonder(secim,metin){ if(!oge) return;
  await fetch('/api/etiket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kimlik:oge.kimlik,secim,metin})});
  yukle(); }
async function geri(){ await fetch('/api/geri',{method:'POST'}); yukle(); }
async function egit(){ const r=await fetch('/api/egit',{method:'POST'}); const j=await r.json(); document.getElementById('egitim').textContent=j.mesaj; }
async function egitimDurum(){ const r=await fetch('/api/egitim'); const j=await r.json(); if(j.mesaj) document.getElementById('egitim').textContent=j.mesaj; }
document.addEventListener('keydown',e=>{
  const d=document.getElementById('d'); const yaziyor=document.activeElement===d;
  if(e.key==='Enter'){e.preventDefault();gonder('D',d.value);return;}
  if(yaziyor && d.value && !['1','2','3'].includes(e.key)) return;
  if(e.key==='1'||e.key==='2'||e.key==='3'){const b=document.querySelectorAll('#secenekler button')[+e.key-1]; if(b){e.preventDefault();b.click();}}
  else if(e.key==='s'||e.key==='S'){e.preventDefault();gonder('atla','');}
  else if(e.key==='x'||e.key==='X'){e.preventDefault();gonder('bozuk','');}
  else if(e.key==='z'||e.key==='Z'){e.preventDefault();geri();}
});
yukle(); setInterval(egitimDurum,5000);
</script></body></html>"""


class Durum:
    def __init__(self, veri_kok: Path, model_yolu: Path, kuyruk: Path, etiketler: Path, manifest: Path, duzey: str, secenek: int):
        self.veri_kok = veri_kok
        self.kuyruk = kuyruk
        self.etiketler = etiketler
        self.manifest = manifest
        self.duzey = duzey
        self.secenek = secenek
        self.kilit = threading.Lock()
        self.tahminci = Tahminci(model_yolu) if model_yolu and Path(model_yolu).exists() else None
        self.model_yolu = Path(model_yolu) if model_yolu else None
        self.egitim_sureci: subprocess.Popen | None = None
        self.egitim_log = veri_kok / "egitim.log"
        self._yukle()

    def _yukle(self):
        self.ogeler = []
        if self.kuyruk.exists():
            for s in self.kuyruk.read_text(encoding="utf-8").splitlines():
                if s.strip():
                    self.ogeler.append(json.loads(s))
        if self.duzey != "hepsi":
            self.ogeler = [o for o in self.ogeler if o["tur"] == self.duzey] or self.ogeler
        self.islenen: dict[str, dict] = {}
        if self.etiketler.exists():
            for s in self.etiketler.read_text(encoding="utf-8").splitlines():
                if s.strip():
                    k = json.loads(s)
                    self.islenen[k["kimlik"]] = k

    def sonraki(self):
        for o in self.ogeler:
            if o["kimlik"] not in self.islenen:
                return o
        return None

    def istatistik(self):
        etiketli = sum(1 for k in self.islenen.values() if k["secim"] not in ("atla", "bozuk"))
        kalan = sum(1 for o in self.ogeler if o["kimlik"] not in self.islenen)
        model = "yok"
        if self.tahminci:
            m = self.tahminci.meta
            model = f"{self.model_yolu.name} (CER %{m.get('cer', 0) * 100:.1f}, {m.get('gercek', 0)} gerçek örnekle)"
        return etiketli, kalan, model

    def secenekler(self, oge):
        if not self.tahminci:
            return []
        self.tahminci.yenile()
        try:
            return self.tahminci.secenekler(Image.open(self.veri_kok / oge["dosya"]), adet=self.secenek)
        except Exception as e:  # noqa: BLE001
            return [(f"(hata: {e})", 0.0)]

    def etiketle(self, kimlik: str, secim: str, metin: str):
        oge = next((o for o in self.ogeler if o["kimlik"] == kimlik), None)
        if oge is None:
            return False
        metin = normallestir(metin) if secim not in ("atla", "bozuk") else ""
        if secim == "D" and not metin:
            secim = "atla"
        kayit = {"kimlik": kimlik, "secim": secim, "metin": metin, "dosya": oge["dosya"], "tur": oge["tur"], "zaman": time.time()}
        with self.kilit:
            with self.etiketler.open("a", encoding="utf-8") as f:
                f.write(json.dumps(kayit, ensure_ascii=False) + "\n")
            self.islenen[kimlik] = kayit
            self._manifest_yaz()
        return True

    def geri_al(self):
        with self.kilit:
            if not self.etiketler.exists():
                return
            satirlar = [s for s in self.etiketler.read_text(encoding="utf-8").splitlines() if s.strip()]
            if not satirlar:
                return
            son = json.loads(satirlar.pop())
            self.etiketler.write_text("\n".join(satirlar) + ("\n" if satirlar else ""), encoding="utf-8")
            self.islenen.pop(son["kimlik"], None)
            self._manifest_yaz()

    def _manifest_yaz(self):
        """Eğitim manifesti: yalnızca metni olan etiketler, kaynak = etiket. Yollar veri köküne göre."""
        self.manifest.parent.mkdir(parents=True, exist_ok=True)
        with self.manifest.open("w", encoding="utf-8") as f:
            for k in self.islenen.values():
                if k["metin"]:
                    rel = Path(k["dosya"])
                    try:
                        rel = (self.veri_kok / k["dosya"]).resolve().relative_to(self.manifest.parent.resolve())
                    except ValueError:
                        rel = (self.veri_kok / k["dosya"]).resolve()
                    f.write(json.dumps({"dosya": str(rel), "metin": k["metin"], "kaynak": "etiket", "tur": k["tur"], "kimlik": k["kimlik"]}, ensure_ascii=False) + "\n")

    def baglam_goruntusu(self, kimlik: str) -> bytes | None:
        oge = next((o for o in self.ogeler if o["kimlik"] == kimlik), None)
        if oge is None or "satir_dosya" not in oge:
            return None
        img = Image.open(self.veri_kok / oge["satir_dosya"]).convert("RGB")
        k, sk = oge["kutu"], oge["satir_kutu"]
        d = ImageDraw.Draw(img)
        d.rectangle((k["x0"] - sk["x0"], k["y0"] - sk["y0"], k["x1"] - sk["x0"], k["y1"] - sk["y0"]), outline=(200, 90, 20), width=3)
        import io

        b = io.BytesIO()
        img.save(b, "PNG")
        return b.getvalue()

    def egitimi_baslat(self) -> str:
        if self.egitim_sureci and self.egitim_sureci.poll() is None:
            return "Eğitim zaten sürüyor."
        if not self.manifest.exists():
            return "Önce birkaç etiket kaydedin."
        n = sum(1 for _ in self.manifest.open(encoding="utf-8"))
        if n < 20:
            return f"En az 20 etiket gerekir (şu an {n})."
        cikti = self.veri_kok / "model_ince"
        komut = [sys.executable, "-m", "osmanlica_htr.cli", "egit", "--manifest", str(self.manifest), "--cikti", str(cikti), "--donem", "8", "--ogrenme-orani", "5e-4"]
        if self.model_yolu and self.model_yolu.exists():
            komut += ["--baslangic", str(self.model_yolu)]
        sentez = self.veri_kok / "sentez_v0" / "manifest.jsonl"
        if sentez.exists():
            komut += ["--manifest", str(sentez), "--sentez-ust-sinir", "4000"]
        self.egitim_log.write_text("", encoding="utf-8")
        self.egitim_sureci = subprocess.Popen(komut, stdout=self.egitim_log.open("a", encoding="utf-8"), stderr=subprocess.STDOUT)
        self._yeni_model = cikti / "model.pt"
        return f"Eğitim başladı ({n} gerçek örnek). Bittiğinde öneriler yeni modelden gelir."

    def egitim_durumu(self) -> str:
        if not self.egitim_sureci:
            return ""
        son = ""
        if self.egitim_log.exists():
            satirlar = self.egitim_log.read_text(encoding="utf-8").strip().splitlines()
            son = satirlar[-1] if satirlar else ""
        if self.egitim_sureci.poll() is None:
            return f"Eğitim sürüyor… {son}"
        if self.egitim_sureci.returncode == 0 and getattr(self, "_yeni_model", None) and self._yeni_model.exists():
            if self.model_yolu != self._yeni_model:
                self.model_yolu = self._yeni_model
                self.tahminci = Tahminci(self.model_yolu)
            return f"Eğitim bitti. {son}"
        return f"Eğitim hata verdi: {son}"


def sunucu_baslat(durum: Durum, port: int = 8765, ac: bool = True):
    class Istek(BaseHTTPRequestHandler):
        def log_message(self, *a):  # sessiz
            pass

        def _json(self, veri, kod=HTTPStatus.OK):
            b = json.dumps(veri, ensure_ascii=False).encode("utf-8")
            self.send_response(kod)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            yol = urlparse(self.path).path
            if yol == "/":
                b = HTML.encode("utf-8")
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            elif yol == "/api/sonraki":
                oge = durum.sonraki()
                etiketli, kalan, model = durum.istatistik()
                self._json({"oge": oge, "secenekler": durum.secenekler(oge) if oge else [], "etiketli": etiketli, "kalan": kalan, "model": model})
            elif yol == "/api/egitim":
                self._json({"mesaj": durum.egitim_durumu()})
            elif yol.startswith("/api/baglam/"):
                b = durum.baglam_goruntusu(unquote(yol[len("/api/baglam/") :]))
                if b is None:
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            elif yol.startswith("/img/"):
                dosya = (durum.veri_kok / unquote(yol[5:])).resolve()
                if not str(dosya).startswith(str(durum.veri_kok.resolve())) or not dosya.exists():
                    self.send_error(HTTPStatus.NOT_FOUND)
                    return
                b = dosya.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            else:
                self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self):
            yol = urlparse(self.path).path
            n = int(self.headers.get("Content-Length") or 0)
            govde = json.loads(self.rfile.read(n) or b"{}") if n else {}
            if yol == "/api/etiket":
                self._json({"tamam": durum.etiketle(govde.get("kimlik", ""), govde.get("secim", "atla"), govde.get("metin", ""))})
            elif yol == "/api/geri":
                durum.geri_al()
                self._json({"tamam": True})
            elif yol == "/api/egit":
                self._json({"mesaj": durum.egitimi_baslat()})
            else:
                self.send_error(HTTPStatus.NOT_FOUND)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), Istek)
    print(f"Etiketleme arayüzü: http://127.0.0.1:{port}  (durdurmak için Ctrl+C)")
    if ac:
        try:
            import webbrowser

            webbrowser.open(f"http://127.0.0.1:{port}")
        except Exception:  # noqa: BLE001
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
