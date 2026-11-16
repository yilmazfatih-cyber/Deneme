"""Örnek uygulamanın HTML şablonları: `render(SABLON, ad=değer)` ile doldurulur; değerler
KAÇIŞLANIR.

Kural: şablonlarda metin yazılmaz, `{…}` yer tutucusuyla `metinler.py`'den gelir. Formlarda gizli
CSRF alanı için `{csrf_alani}` kullanılır. Erişilebilirlik: her alanın `<label for>`'u ve
`lang="tr"` vardır.
Genişletme: yeni sayfa için yeni bir sabit ekleyin; ortak çerçeve `SAYFA`'dır.
"""

from __future__ import annotations

SAYFA = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{baslik} · {uygulama}</title>
<link rel="stylesheet" href="/statik/stil.css">
</head>
<body>
<header><a href="/" class="logo">{uygulama}</a><nav>{menu}</nav></header>
<main>
{flaslar}
<h1>{baslik}</h1>
{icerik}
</main>
</body>
</html>"""

MENU_MISAFIR = '<a href="/giris">{giris}</a> <a href="/kayit">{kayit}</a>'
MENU_UYE = (
    '<a href="/notlar">{notlar}</a> <span class="ad">{ad}</span>'
    '<form method="post" action="/cikis" class="satir">{csrf_alani}<button>{cikis}</button></form>'
)
CSRF_ALANI = '<input type="hidden" name="_csrf" value="{belirtec}">'
FLAS = '<p class="flas {tur}" role="status">{ileti}</p>'
HATA = '<p class="hata" role="alert">{ileti}</p>'

ANA = "<p>{tanitim}</p>"

HESAP_FORMU = """{hata}
<form method="post" action="{eylem}">
{csrf_alani}
<input type="hidden" name="sonra" value="{sonra}">
<label for="ad">{etiket_ad}</label>
<input id="ad" name="ad" value="{ad}" autocomplete="username" required maxlength="32">
<label for="parola">{etiket_parola}</label>
<input id="parola" name="parola" type="password" autocomplete="{otomatik}" required maxlength="128">
<button>{dugme}</button>
</form>"""

NOT_SATIRI = '<li><a href="/notlar/{id}">{baslik}</a></li>'

NOTLAR = """{hata}
<ul class="notlar">{satirlar}</ul>
<h2>{yeni}</h2>
<form method="post" action="/notlar">
{csrf_alani}
<label for="baslik">{etiket_baslik}</label>
<input id="baslik" name="baslik" required maxlength="200">
<label for="metin">{etiket_metin}</label>
<textarea id="metin" name="metin" rows="5" maxlength="10000"></textarea>
<button>{dugme_ekle}</button>
</form>
<h2>{yukle}</h2>
<form method="post" action="/notlar/yukle" enctype="multipart/form-data">
{csrf_alani}
<label for="dosya">{etiket_dosya}</label>
<input id="dosya" name="dosya" type="file" accept=".txt,text/plain" required>
<button>{dugme_yukle}</button>
</form>"""

NOT_AYRINTI = """<pre class="metin">{metin}</pre>
<form method="post" action="/notlar/{id}/sil">
{csrf_alani}
<button class="tehlike">{dugme_sil}</button>
</form>"""
