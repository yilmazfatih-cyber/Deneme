"""Tarayıcı arayüzü: yalnızca bu bilgisayarda (127.0.0.1) çalışan küçük bir web sunucusu.

Ek bağımlılık yoktur; Python'un kendi http.server modülü kullanılır.
Güvenlik önlemleri:
  - Yalnızca 127.0.0.1 dinlenir; aynı ağdaki başka cihazlar erişemez.
  - Ağ kilidi "yalnızca yerel" modda takılır: internete hiçbir bağlantı açılamaz.
  - Host başlığı denetlenir (DNS rebinding saldırısına karşı).
  - POST isteklerinde Origin denetlenir (başka sitelerin sahte form göndermesine karşı).
  - Sayfalar sıkı Content-Security-Policy ile sunulur; hiçbir betik çalışmaz.
"""

from __future__ import annotations

import html
import shutil
import traceback
import webbrowser
from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import pandas as pd

from . import guvenlik

IZINLI_UZANTILAR = {".xlsx", ".xlsm", ".xls", ".csv", ".txt"}
EN_FAZLA_GOVDE = 100 * 1024 * 1024  # 100 MB

CSP = ("default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; "
       "form-action 'self'; frame-ancestors 'none'; base-uri 'none'")


@dataclass
class Ayarlar:
    girdi: Path
    cikti: Path
    bankalar: Path
    kurallar: Path
    kisiler: Path


def _e(x) -> str:
    return html.escape(str(x), quote=True)


def _tl(x) -> str:
    try:
        return f"{float(x):,.2f} ₺".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return _e(x)


STIL = """
:root{--bg:#fff;--fg:#1b1b1b;--soluk:#5c6670;--cizgi:#d9dee4;--vurgu:#1f3a5f;--kart:#f4f6f9;--iyi:#2e7d32;--dikkat:#b26a00}
@media (prefers-color-scheme:dark){:root{--bg:#131518;--fg:#e8e8e8;--soluk:#a0a8b0;--cizgi:#333a42;--vurgu:#9db7d9;--kart:#1d2127;--iyi:#6fbf73;--dikkat:#e0a84a}}
*{box-sizing:border-box} body{font-family:system-ui,sans-serif;margin:0 auto;padding:16px;max-width:1000px;background:var(--bg);color:var(--fg);line-height:1.45}
h1{color:var(--vurgu);margin:4px 0 2px} h2{color:var(--vurgu);margin:28px 0 8px;font-size:1.2em}
.alt{color:var(--soluk);font-size:.9em} a{color:var(--vurgu)}
nav{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 16px} nav a{font-weight:600}
.kutu{background:var(--kart);border-radius:10px;padding:14px 16px;margin:10px 0}
.mesaj{border-left:4px solid var(--iyi)} .uyari{border-left:4px solid var(--dikkat)}
button,.dugme{font:inherit;font-weight:600;padding:10px 16px;border-radius:8px;border:1px solid var(--vurgu);background:var(--vurgu);color:var(--bg);cursor:pointer;text-decoration:none;display:inline-block}
button.ikincil,.dugme.ikincil{background:transparent;color:var(--vurgu)}
table{border-collapse:collapse;width:100%;font-size:.92em} th,td{border-bottom:1px solid var(--cizgi);padding:6px 8px;text-align:left;vertical-align:middle}
th{background:var(--kart)} input[type=text]{font:inherit;width:100%;padding:6px 8px;border:1px solid var(--cizgi);border-radius:6px;background:var(--bg);color:var(--fg)}
select{font:inherit;padding:6px;border-radius:6px;background:var(--bg);color:var(--fg);border:1px solid var(--cizgi)}
.ozet{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.ozet div{background:var(--kart);border-radius:8px;padding:8px 10px} .ozet b{display:block;font-size:1.1em}
.kucuk{font-size:.82em;color:var(--soluk)} .tablo-sar{overflow-x:auto}
input[type=checkbox]{width:22px;height:22px}
@media (max-width:600px){.ornek{display:none}}
"""


def sayfa(baslik: str, govde: str) -> str:
    return f"""<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>{_e(baslik)} · Hesap Analizi</title>
<style>{STIL}</style></head><body>
<h1>Hesap Analizi</h1>
<div class="alt">Bu sayfa yalnızca bu bilgisayarda çalışır. Veriler internete gönderilmez.</div>
<nav><a href="/">Ana sayfa</a><a href="/kisiler">Kişiler</a><a href="/rapor">Rapor</a></nav>
{govde}
</body></html>"""


# ---------------------------------------------------------------- yardımcılar

def _girdi_dosyalari(a: Ayarlar) -> list[Path]:
    if not a.girdi.exists():
        return []
    return sorted(p for p in a.girdi.iterdir()
                  if p.is_file() and p.suffix.lower() in IZINLI_UZANTILAR and not p.name.startswith("~$"))


def guvenli_dosya_adi(ad: str) -> str | None:
    """Yüklenen dosya adından klasör kısmını atar; izinli uzantı değilse None."""
    ad = (ad or "").replace("\\", "/").split("/")[-1].strip()
    ad = "".join(c for c in ad if c.isprintable() and c not in '<>:"|?*')
    if not ad or ad.startswith(".") or Path(ad).suffix.lower() not in IZINLI_UZANTILAR:
        return None
    return ad[:150]


def multipart_dosyalar(content_type: str, govde: bytes) -> list[tuple[str, bytes]]:
    basliklar = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin-1")
    mesaj = BytesParser(policy=policy.HTTP).parsebytes(basliklar + govde)
    dosyalar = []
    for parca in mesaj.iter_parts():
        ad = parca.get_filename()
        if not ad:
            continue
        # Tarayıcılar dosya adını ham UTF-8 gönderir; ayrıştırıcı bunu surrogate olarak bırakır
        ad = ad.encode("utf-8", "surrogateescape").decode("utf-8", "replace")
        veri = parca.get_payload(decode=True) or b""
        if veri:
            dosyalar.append((ad, veri))
    return dosyalar


def _kisileri_oku(a: Ayarlar) -> pd.DataFrame | None:
    if not a.kisiler.exists():
        return None
    k = pd.read_csv(a.kisiler, dtype=str, encoding="utf-8-sig").fillna("")
    return k


# ---------------------------------------------------------------- sayfalar

def ana_sayfa(a: Ayarlar, mesaj: str = "", uyari: str = "") -> str:
    dosyalar = _girdi_dosyalari(a)
    if dosyalar:
        satirlar = "".join(
            f"<tr><td>{_e(p.name)}</td><td>{p.stat().st_size / 1024:,.0f} KB</td>"
            f"<td><a href='/sil?dosya={quote(p.name)}'>Kaldır</a></td></tr>" for p in dosyalar)
        liste = f"<table><tr><th>Dosya</th><th>Boyut</th><th></th></tr>{satirlar}</table>"
    else:
        liste = "<p class='alt'>Henüz ekstre yok. Aşağıdan ekleyin.</p>"

    rapor_var = (a.cikti / "hesap-analizi.html").exists()
    rapor_baglanti = ("<p><a class='dugme ikincil' href='/rapor'>Raporu aç</a> "
                      "<a class='dugme ikincil' href='/rapor.xlsx'>Excel indir</a></p>") if rapor_var else ""

    k = _kisileri_oku(a)
    if k is None:
        kisi_metin = "<p class='alt'>Analiz çalışınca kişiler burada listelenir.</p>"
    else:
        bekleyen = int(((k["tur"] == "kisi") & (k["onay"].str.lower() == "bekliyor")).sum())
        kisi_metin = (f"<p>{bekleyen} kişi onay bekliyor.</p>" if bekleyen else "<p>Tüm kişiler onaylı.</p>")
        kisi_metin += "<p><a class='dugme ikincil' href='/kisiler'>Kişileri düzenle</a></p>"

    kutu = ""
    if mesaj:
        kutu += f"<div class='kutu mesaj'>{mesaj}</div>"
    if uyari:
        kutu += f"<div class='kutu uyari'>{uyari}</div>"

    return sayfa("Ana sayfa", f"""{kutu}
<h2>1. Ekstreler</h2>
<div class="kutu">{liste}
<form method="post" action="/yukle" enctype="multipart/form-data" style="margin-top:12px">
<label for="dosya">Excel veya CSV ekstre seçin (birden fazla olabilir)</label><br>
<input id="dosya" type="file" name="dosya" multiple accept=".xlsx,.xls,.xlsm,.csv,.txt" style="margin:8px 0"><br>
<button type="submit">Ekle</button></form>
<p class="kucuk">Dosyalar yalnızca <code>{_e(a.girdi)}</code> klasörüne kopyalanır.</p></div>

<h2>2. Analiz</h2>
<div class="kutu"><form method="post" action="/calistir"><button type="submit">Analizi çalıştır</button></form>
{rapor_baglanti}</div>

<h2>3. Kişiler</h2>
<div class="kutu">{kisi_metin}</div>
""")


def sonuc_sayfasi(sonuc: dict) -> str:
    ozet = "".join(
        f"<div><span class='kucuk'>{_e(k)}</span><b>{_tl(v) if isinstance(v, float) else _e(v)}</b></div>"
        for k, v in sonuc["ozet"].items())
    uyarilar = "".join(f"<li>{_e(u)}</li>" for u in sonuc["uyarilar"])
    okunan = "".join(f"<li>{_e(d)} · {_e(b)} · {n} satır</li>" for d, b, n in sonuc["okunan"])
    return sayfa("Analiz tamam", f"""
<div class="kutu mesaj">Analiz tamamlandı.</div>
<p><a class="dugme" href="/rapor">Raporu aç</a> <a class="dugme ikincil" href="/rapor.xlsx">Excel indir</a>
<a class="dugme ikincil" href="/kisiler">Kişileri düzenle</a></p>
<h2>Özet</h2><div class="ozet">{ozet}</div>
<h2>Okunan dosyalar</h2><ul>{okunan}</ul>
{f"<h2>Uyarılar</h2><div class='kutu uyari'><ul>{uyarilar}</ul></div>" if uyarilar else ""}
""")


def kisiler_sayfasi(a: Ayarlar, filtre: str, mesaj: str = "") -> str:
    k = _kisileri_oku(a)
    if k is None:
        return sayfa("Kişiler", "<div class='kutu uyari'>Önce ana sayfadan analizi çalıştırın.</div>")
    sekmeler = {"kisi": "Kişiler", "bekleyen": "Onay bekleyenler", "kurum": "Kurumlar", "hepsi": "Tümü"}
    if filtre == "kisi":
        g = k[k["tur"] == "kisi"]
    elif filtre == "kurum":
        g = k[k["tur"] == "kurum"]
    elif filtre == "bekleyen":
        g = k[k["onay"].str.lower() == "bekliyor"]
    else:
        g = k
    sekme_html = " · ".join(
        f"<b>{ad}</b>" if anahtar == filtre else f"<a href='/kisiler?filtre={anahtar}'>{ad}</a>"
        for anahtar, ad in sekmeler.items())
    satirlar = []
    for i, r in enumerate(g.itertuples(index=False)):
        onayli = r.onay.strip().lower() in {"evet", "e", "ok", "tamam"}
        secenek = "".join(
            f"<option value='{t}'{' selected' if r.tur == t else ''}>{ad}</option>"
            for t, ad in (("kisi", "Kişi"), ("kurum", "Kurum")))
        satirlar.append(
            f"<tr><td>{_e(r.ham_ad)}<input type='hidden' name='ham_{i}' value='{_e(r.ham_ad)}'>"
            f"<div class='kucuk'>{_e(getattr(r, 'iban', ''))}</div></td>"
            f"<td><input type='text' name='kanonik_{i}' value='{_e(r.kanonik_ad)}' aria-label='Görünecek ad: {_e(r.ham_ad)}'></td>"
            f"<td><select name='tur_{i}' aria-label='Tür: {_e(r.ham_ad)}'>{secenek}</select></td>"
            f"<td><input type='checkbox' name='onay_{i}' value='evet'{' checked' if onayli else ''} aria-label='Onay: {_e(r.ham_ad)}'></td>"
            f"<td class='kucuk ornek'>{_e(r.ornek_aciklama)}</td></tr>")
    tablo = ("<div class='tablo-sar'><table><tr><th>Dökümde geçen ad</th><th>Görünecek ad</th><th>Tür</th>"
             "<th>Onay</th><th class='ornek'>Örnek açıklama</th></tr>" + "".join(satirlar) + "</table></div>") if satirlar \
        else "<p class='alt'>Bu sekmede kayıt yok.</p>"
    return sayfa("Kişiler", f"""
{f"<div class='kutu mesaj'>{mesaj}</div>" if mesaj else ""}
<p>{sekme_html}</p>
<div class="kutu kucuk">Aynı kişinin iki farklı yazımı varsa ikisine de aynı <b>görünecek adı</b> yazın; raporda tek satırda birleşir.
<b>Kurum</b> seçilenler kişi dengesinden çıkar. Onaylanan satırlar bir sonraki analizde kesinleşir.</div>
<form method="post" action="/kisiler?filtre={_e(filtre)}">
<input type="hidden" name="adet" value="{len(satirlar)}">
{tablo}
<p style="margin-top:12px"><button type="submit" name="sonra" value="kaydet">Kaydet</button>
<button type="submit" name="sonra" value="calistir" class="ikincil">Kaydet ve analizi yenile</button></p>
</form>""")


def kisileri_kaydet(a: Ayarlar, form: dict[str, list[str]]) -> int:
    k = _kisileri_oku(a)
    if k is None:
        return 0
    adet = int(form.get("adet", ["0"])[0] or 0)
    indeks = {ham: i for i, ham in enumerate(k["ham_ad"])}
    degisen = 0
    for i in range(adet):
        ham = form.get(f"ham_{i}", [""])[0]
        if ham not in indeks:
            continue
        j = indeks[ham]
        yeni = {
            "kanonik_ad": form.get(f"kanonik_{i}", [k.at[j, "kanonik_ad"]])[0].strip() or ham,
            "tur": form.get(f"tur_{i}", [k.at[j, "tur"]])[0] if form.get(f"tur_{i}", [""])[0] in {"kisi", "kurum"} else k.at[j, "tur"],
            "onay": "evet" if form.get(f"onay_{i}") else "bekliyor",
        }
        if any(k.at[j, s] != v for s, v in yeni.items()):
            degisen += 1
            for s, v in yeni.items():
                k.at[j, s] = v
    k.to_csv(a.kisiler, index=False, encoding="utf-8-sig")
    return degisen


# ---------------------------------------------------------------- analiz

def analiz_calistir(a: Ayarlar) -> dict:
    from .cli import calistir  # döngüsel içe aktarmayı önler

    # Ağ kilidi arayüz başlarken "yalnızca yerel" modda takıldı; burada tekrar takılmaz
    return calistir(a.girdi, a.cikti, a.bankalar, a.kurallar, a.kisiler, ag_kilidi=False, sessiz=True)


# ---------------------------------------------------------------- HTTP

class Isleyici(BaseHTTPRequestHandler):
    ayarlar: Ayarlar
    server_version = "hesap-analiz"
    sys_version = ""

    # --- güvenlik
    def _izinli_hostlar(self) -> set[str]:
        port = self.server.server_address[1]
        return {f"127.0.0.1:{port}", f"localhost:{port}", f"[::1]:{port}"}

    def _istek_guvenli(self, post: bool) -> bool:
        if self.headers.get("Host", "") not in self._izinli_hostlar():
            return False
        if post:
            origin = self.headers.get("Origin")
            if origin and origin != "null" and urlparse(origin).netloc not in self._izinli_hostlar():
                return False
            if origin == "null":
                return False
        return True

    def log_message(self, format, *args):  # noqa: A002
        pass  # erişim günlüğü tutulmaz; dosya adları konsola düşmesin

    # --- yanıt
    def _gonder(self, durum: int, govde: bytes, tur: str = "text/html; charset=utf-8",
                ekler: dict[str, str] | None = None) -> None:
        self.send_response(durum)
        self.send_header("Content-Type", tur)
        self.send_header("Content-Length", str(len(govde)))
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        # same-origin: kendi formlarımız Origin gönderir; "no-referrer" Origin: null yollatır
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store")
        for k, v in (ekler or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(govde)

    def _html(self, metin: str, durum: int = 200) -> None:
        self._gonder(durum, metin.encode("utf-8"))

    def _yonlendir(self, yer: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", yer)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _govde(self) -> bytes | None:
        uzunluk = int(self.headers.get("Content-Length") or 0)
        if uzunluk > EN_FAZLA_GOVDE:
            self._html(sayfa("Çok büyük", "<div class='kutu uyari'>Dosya 100 MB sınırını aşıyor.</div>"), 413)
            return None
        return self.rfile.read(uzunluk) if uzunluk else b""

    # --- yönlendirme
    def do_GET(self):  # noqa: N802
        if not self._istek_guvenli(post=False):
            return self._gonder(403, b"Yasak")
        a = self.ayarlar
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path == "/":
            return self._html(ana_sayfa(a))
        if url.path == "/kisiler":
            return self._html(kisiler_sayfasi(a, q.get("filtre", ["kisi"])[0]))
        if url.path == "/rapor":
            yol = a.cikti / "hesap-analizi.html"
            if not yol.exists():
                return self._html(ana_sayfa(a, uyari="Henüz rapor yok. Önce analizi çalıştırın."))
            return self._gonder(200, yol.read_bytes())
        if url.path == "/rapor.xlsx":
            yol = a.cikti / "hesap-analizi.xlsx"
            if not yol.exists():
                return self._html(ana_sayfa(a, uyari="Henüz rapor yok. Önce analizi çalıştırın."))
            return self._gonder(200, yol.read_bytes(),
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                {"Content-Disposition": 'attachment; filename="hesap-analizi.xlsx"'})
        if url.path == "/sil":
            ad = q.get("dosya", [""])[0]
            if guvenli_dosya_adi(ad) != ad or not (a.girdi / ad).exists():
                return self._html(ana_sayfa(a, uyari="Dosya bulunamadı."), 404)
            return self._html(sayfa("Kaldır", f"""
<div class="kutu uyari"><p><b>{_e(ad)}</b> girdi klasöründen kaldırılsın mı?</p>
<p class="kucuk">Dosya çöp kutusuna değil, <code>{_e(a.girdi / '.kaldirilanlar')}</code> klasörüne taşınır; oradan geri alabilirsiniz.</p>
<form method="post" action="/sil"><input type="hidden" name="dosya" value="{_e(ad)}">
<button type="submit">Evet, kaldır</button> <a class="dugme ikincil" href="/">Vazgeç</a></form></div>"""))
        return self._gonder(404, b"Bulunamadi", "text/plain; charset=utf-8")

    def do_POST(self):  # noqa: N802
        if not self._istek_guvenli(post=True):
            return self._gonder(403, b"Yasak")
        a = self.ayarlar
        url = urlparse(self.path)
        govde = self._govde()
        if govde is None:
            return None

        if url.path == "/yukle":
            ctype = self.headers.get("Content-Type", "")
            if not ctype.startswith("multipart/form-data"):
                return self._gonder(400, b"Beklenmeyen icerik")
            a.girdi.mkdir(parents=True, exist_ok=True)
            eklenen, reddedilen = [], []
            for ad, veri in multipart_dosyalar(ctype, govde):
                temiz = guvenli_dosya_adi(ad)
                if temiz is None:
                    reddedilen.append(ad)
                    continue
                (a.girdi / temiz).write_bytes(veri)
                eklenen.append(temiz)
            mesaj = f"{len(eklenen)} dosya eklendi: {_e(', '.join(eklenen))}" if eklenen else ""
            uyari = (f"Yalnızca Excel ve CSV kabul edilir. Atlanan: {_e(', '.join(reddedilen))}"
                     if reddedilen else ("Dosya seçilmedi." if not eklenen else ""))
            return self._html(ana_sayfa(a, mesaj=mesaj, uyari=uyari))

        form = parse_qs(govde.decode("utf-8", "replace"), keep_blank_values=True)

        if url.path == "/sil":
            ad = form.get("dosya", [""])[0]
            if guvenli_dosya_adi(ad) != ad or not (a.girdi / ad).exists():
                return self._html(ana_sayfa(a, uyari="Dosya bulunamadı."), 404)
            hedef = a.girdi / ".kaldirilanlar"
            hedef.mkdir(exist_ok=True)
            shutil.move(str(a.girdi / ad), str(hedef / ad))
            return self._html(ana_sayfa(a, mesaj=f"{_e(ad)} kaldırıldı. Geri almak için "
                                                 f"<code>{_e(hedef)}</code> klasöründen geri taşıyın."))

        if url.path == "/calistir":
            return self._analiz_yanit()

        if url.path == "/kisiler":
            filtre = parse_qs(url.query).get("filtre", ["kisi"])[0]
            degisen = kisileri_kaydet(a, form)
            if form.get("sonra", [""])[0] == "calistir":
                return self._analiz_yanit()
            return self._html(kisiler_sayfasi(a, filtre, mesaj=f"{degisen} satır kaydedildi."))

        return self._gonder(404, b"Bulunamadi", "text/plain; charset=utf-8")

    def _analiz_yanit(self):
        a = self.ayarlar
        try:
            sonuc = analiz_calistir(a)
        except (FileNotFoundError, ValueError) as e:
            return self._html(ana_sayfa(a, uyari=_e(e)))
        except guvenlik.AgKilidiHatasi as e:
            return self._html(ana_sayfa(a, uyari="Bir bileşen ağa çıkmaya çalıştı ve durduruldu: " + _e(e)))
        except Exception:  # noqa: BLE001
            ayrinti = traceback.format_exc(limit=3)
            return self._html(ana_sayfa(a, uyari="Beklenmeyen hata. Ayrıntı:<pre>" + _e(ayrinti) + "</pre>"))
        return self._html(sonuc_sayfasi(sonuc))


def sunucu_olustur(ayarlar: Ayarlar, port: int = 8765) -> HTTPServer:
    isleyici = type("AyarliIsleyici", (Isleyici,), {"ayarlar": ayarlar})
    son_hata: OSError | None = None
    for p in ([port] if port == 0 else range(port, port + 20)):
        try:
            return HTTPServer(("127.0.0.1", p), isleyici)
        except OSError as e:
            son_hata = e
    raise OSError(f"{port}-{port + 19} arası portların hepsi dolu") from son_hata


def baslat(ayarlar: Ayarlar, port: int = 8765, tarayici_ac: bool = True) -> None:
    guvenlik.ag_kilidini_tak(yalniz_yerel=True)
    for k in (ayarlar.girdi, ayarlar.cikti):
        k.mkdir(parents=True, exist_ok=True)
    sunucu = sunucu_olustur(ayarlar, port)
    adres = f"http://127.0.0.1:{sunucu.server_address[1]}/"
    print(f"Hesap Analizi arayüzü açık: {adres}")
    print("Yalnızca bu bilgisayardan erişilebilir. İnternete bağlantı kilitli. Kapatmak için Ctrl+C.")
    if tarayici_ac:
        try:
            webbrowser.open(adres)
        except Exception:  # noqa: BLE001
            pass
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        print("\nKapatıldı.")
    finally:
        sunucu.server_close()
