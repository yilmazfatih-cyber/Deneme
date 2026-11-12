"""Çıktılar: Markdown ders notu, transkript ve Anki'ye aktarılabilir CSV.

Anki dosya başlıkları (#separator, #html, #tags column, #deck) Anki 2.1.55+ metin içe aktarma biçimine göredir
(doğrulanmadı: Anki 51 depo arasında değil; kaynak, Anki kılavuzunun "Importing → Text Files → File Headers" bölümü).
"""

import csv
import html
import io
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .altyazi import Parca, zaman_yaz
from .kaynak import gizle, url_mi
from .ozet import DersNotu

HARFLER = "ABCDE"
AYLAR = ("Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık")
try:
    TURKIYE = ZoneInfo("Europe/Istanbul")
except ZoneInfoNotFoundError:  # saat dilimi verisi yoksa (ör. tzdata'sız Windows): Türkiye 2016'dan beri hep UTC+3
    TURKIYE = timezone(timedelta(hours=3), "TSİ")
_FORMUL_BASI = ("=", "+", "-", "@", "\t", "\r")


def turkce_tarih(an: datetime) -> str:
    """'12 Kasım 2026, 10:30' biçimi, Türkiye saatiyle. Saat dilimi olmayan değer Türkiye saati sayılır."""
    an = an.replace(tzinfo=TURKIYE) if an.tzinfo is None else an.astimezone(TURKIYE)
    return f"{an.day} {AYLAR[an.month - 1]} {an.year}, {an:%H:%M}"


def md_metin(metin: str) -> str:
    """Tek satıra indirir ve HTML sayılabilecek &, <, > karakterlerini kaçışlar.

    Altyazıdaki "&lt;script&gt;" ayrıştırmada "<script>" olur; not HTML'e çevrilip yayımlanırsa çalışmasın.
    """
    return html.escape(" ".join(str(metin).split()), quote=False)


def _hucre(metin: str) -> str:
    return md_metin(metin).replace("|", "\\|")


def kaynak_goster(adres: str) -> str:
    """Notta görünen kaynak: URL'de kimlik bilgisi ve sorgu yok, yerel dosyada yalnızca dosya adı.

    Yerel yol (/home/ayse/...) kullanıcı adını, URL sorgusu (imzalı bağlantı) erişim jetonunu sızdırabilir.
    """
    return gizle(adres.strip()) if url_mi(adres) else (Path(adres).name or adres)


def atomik_yaz(yol: Path, metin: str) -> None:
    """Önce geçici dosyaya yazar, sonra yerine koyar: yarıda kalan çalışma eksik bir dosya bırakmaz."""
    gecici = yol.with_name(f".{yol.name}.{os.getpid()}.tmp")
    try:
        gecici.write_text(metin, encoding="utf-8", newline="")
        os.replace(gecici, yol)
    finally:
        gecici.unlink(missing_ok=True)


def transkript_md(parcalar: list[Parca], baslik: str) -> str:
    satirlar = [f"# Transkript: {md_metin(baslik)}", ""]
    satirlar += [f"- **[{zaman_yaz(p.bas)}]** {md_metin(p.metin)}" for p in parcalar]
    return "\n".join(satirlar) + "\n"


def not_md(not_: DersNotu, kaynak: str, simdi: datetime | None = None) -> str:
    an = turkce_tarih(simdi or datetime.now(TURKIYE))
    s = [f"# {md_metin(not_.baslik)}", ""]
    s += [f"> Kaynak: {md_metin(kaynak_goster(kaynak))} · Yöntem: {not_.yontem} · Oluşturulma: {an} (Türkiye saati)"]
    s += [">", "> Otomatik üretildi. Öğrencilerle paylaşmadan önce öğretmen kontrol etmeli."]
    for uyari in not_.uyarilar:
        s += [">", f"> Uyarı: {md_metin(uyari)}"]
    s.append("")
    if not_.giris:
        s += [md_metin(not_.giris), ""]
    s += ["## Ana fikirler", ""] + [f"- {md_metin(f)}" for f in not_.ana_fikirler] + ["", "## Bölüm bölüm notlar", ""]
    for bolum, maddeler in not_.bolumler:
        s += [f"### [{zaman_yaz(bolum.bas)}–{zaman_yaz(bolum.son)}]", ""]
        s += [f"- {md_metin(m)}" for m in maddeler] + [""]
    if not_.kavramlar:
        s += ["## Kavram sözlüğü", "", "| Kavram | Tanım | Zaman |", "| --- | --- | --- |"]
        s += [f"| {_hucre(k.terim)} | {_hucre(k.tanim)} | {zaman_yaz(k.zaman)} |" for k in not_.kavramlar]
        s.append("")
    if not_.sorular:
        s += ["## Kendini sına", ""]
        for i, soru in enumerate(not_.sorular, start=1):
            s.append(f"{i}. {md_metin(soru.soru)}")
            s += [f"   - {HARFLER[j]}) {md_metin(secenek)}" for j, secenek in enumerate(soru.secenekler)]
            aciklama = f" {md_metin(soru.aciklama)}" if soru.aciklama else ""
            cevap = f"{md_metin(soru.cevap)}.{aciklama} [{zaman_yaz(soru.zaman)}]"
            s += ["", f"   <details><summary>Cevap</summary>{cevap}</details>", ""]
    return "\n".join(s).rstrip() + "\n"


def _csv_alan(metin: str) -> str:
    """Anki HTML alanı. Tabloda açılırsa formül sanılmasın diye baştaki =, +, -, @ HTML varlığına çevrilir.

    Anki "&#61;" gibi varlıkları HTML açıkken normal karakter olarak gösterir.
    """
    return f"&#{ord(metin[0])};{metin[1:]}" if metin.startswith(_FORMUL_BASI) else metin


def anki_csv(not_: DersNotu, yol: Path, deste: str) -> int:
    """Ön yüz, arka yüz, etiket; HTML açık. Yazılan kart sayısını döndürür."""
    deste = " ".join(str(deste).split()) or "Ders notları"  # satır sonu başlığa yeni satır ekleyemesin
    tampon = io.StringIO()
    tampon.write(f"#separator:Comma\n#html:true\n#tags column:3\n#deck:{deste}\n")
    yazici = csv.writer(tampon, lineterminator="\n")
    for k in not_.kavramlar:
        arka = f"{html.escape(k.tanim)}<br><small>[{zaman_yaz(k.zaman)}]</small>"
        yazici.writerow([_csv_alan(html.escape(k.terim)), _csv_alan(arka), "kavram"])
    for soru in not_.sorular:
        on = html.escape(soru.soru)
        if soru.secenekler:
            on += "<br>" + "<br>".join(f"{HARFLER[j]}) {html.escape(x)}" for j, x in enumerate(soru.secenekler))
        arka = html.escape(soru.cevap) + (f"<br>{html.escape(soru.aciklama)}" if soru.aciklama else "")
        yazici.writerow([_csv_alan(on), _csv_alan(arka), "soru"])
    atomik_yaz(yol, tampon.getvalue())
    return len(not_.kavramlar) + len(not_.sorular)
