"""Günlük özet: Markdown (arşiv), HTML (e-posta), Telegram metni ve n8n'in okuyacağı JSON.

Telegram için iki biçim üretilir: `telegram_metni` düz metindir (doğrudan Bot API gönderimi, parse_mode yok);
`telegram_html` aynı metnin HTML kaçışlı halidir. n8n'in Telegram düğümü parse_mode boşsa "Markdown" (eski sürüm)
kullanır (n8n-io/n8n @ 5ee06d3, packages/nodes-base/nodes/Telegram/GenericFunctions.ts → addAdditionalFields); o
kipte URL'deki "_" ya da "[" iletiyi bozabilir. Bu yüzden iş akışı parse_mode "HTML" ile `telegram_html` gönderir.
"""

import html
from datetime import datetime

from .fiyat import tl_yaz
from .radar import Calisma

TELEGRAM_SINIRI = 4000  # Telegram mesaj sınırı 4096 karakter (Bot API belgesi; doğrulanmadı); pay bırakılır


def _tarih(calisma: Calisma) -> str:
    return datetime.fromisoformat(calisma.zaman).strftime("%d.%m.%Y %H:%M")


def _stok(stokta: bool | None) -> str:
    return {True: "var", False: "yok", None: "?"}[stokta]


def _hucre(metin) -> str:
    """Markdown tablo hücresi: satır sonu ve "|" tabloyu bozmasın."""
    return " ".join(str(metin).split()).replace("|", "\\|") or "—"


def _ozet_satiri(calisma: Calisma) -> str:
    satir = f"{len(calisma.onemli)} değişiklik, {len(calisma.hatalar)} hata · {len(calisma.olcumler)} sayfa tarandı"
    return satir + (f" · {len(calisma.atlananlar)} sayfa sonraki tura kaldı" if calisma.atlananlar else "")


def markdown(calisma: Calisma) -> str:
    s = [f"# Fiyat radarı — {_tarih(calisma)}", "", f"**{_ozet_satiri(calisma)}**", ""]
    if calisma.onemli:
        s += ["## Değişiklikler", ""] + [f"- **{d.urun} · {d.magaza}:** {d.mesaj}" for d in calisma.onemli] + [""]
    if calisma.surenler:
        s += ["## Sizden ucuz rakipler (sürüyor)", ""] + [f"- **{d.urun}:** {d.mesaj}" for d in calisma.surenler] + [""]
    s += ["## Güncel tablo", "", "| Ürün | Mağaza | Fiyat | Eski fiyat | Stok | Kampanya | Kaynak |"]
    s.append("| --- | --- | --- | --- | --- | --- | --- |")
    for o in calisma.olcumler:
        if not o.hata:
            hucreler = [o.urun, o.magaza, tl_yaz(o.fiyat), tl_yaz(o.eski_fiyat), _stok(o.stokta), "; ".join(o.kampanyalar), o.kaynak]
            s.append("| " + " | ".join(_hucre(h) for h in hucreler) + " |")
    if calisma.hatalar:
        s += ["", "## Okunamayanlar", ""] + [f"- **{d.urun} · {d.magaza}:** {d.mesaj}" for d in calisma.hatalar]
    if calisma.atlananlar:
        s += ["", "## Sonraki tura kalanlar", ""] + [f"- {a}" for a in calisma.atlananlar]
    if calisma.notlar:
        s += ["", "## Notlar", ""] + [f"- {n}" for n in calisma.notlar]
    return "\n".join(s) + "\n"


def html_eposta(calisma: Calisma) -> str:
    e = html.escape
    satirlar = "".join(
        f"<tr><td>{e(o.urun)}</td><td>{e(o.magaza)}</td><td>{e(tl_yaz(o.fiyat))}</td><td>{e(_stok(o.stokta))}</td>"
        f"<td>{e('; '.join(o.kampanyalar) or '—')}</td></tr>"
        for o in calisma.olcumler
        if not o.hata
    )
    degisimler = "".join(
        f"<li><b>{e(d.urun)} · {e(d.magaza)}:</b> {e(d.mesaj)}</li>" for d in calisma.onemli + calisma.hatalar + calisma.surenler
    )
    return (
        f'<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Fiyat radarı</title></head><body>'
        f"<h1>Fiyat radarı — {e(_tarih(calisma))}</h1><p><b>{e(_ozet_satiri(calisma))}</b></p>"
        f"<ul>{degisimler}</ul><table border=\"1\" cellpadding=\"4\"><tr><th>Ürün</th><th>Mağaza</th><th>Fiyat</th>"
        f"<th>Stok</th><th>Kampanya</th></tr>{satirlar}</table></body></html>"
    )


def telegram_metni(calisma: Calisma) -> str:
    satirlar = [f"Fiyat radarı · {_tarih(calisma)}", _ozet_satiri(calisma), ""]
    satirlar += [f"• {d.urun} / {d.magaza}: {d.mesaj}" for d in calisma.onemli + calisma.hatalar]
    metin = "\n".join(satirlar).strip()
    return metin if len(metin) <= TELEGRAM_SINIRI else metin[: TELEGRAM_SINIRI - 25].rstrip() + "\n… (devamı raporda)"


def telegram_html(calisma: Calisma) -> str:
    """Telegram'ın HTML kipi için: <, > ve & kaçırılır (Bot API kuralı; doğrulanmadı). Kısaltma kaçıştan önce yapılır."""
    return html.escape(telegram_metni(calisma), quote=False)


def bildirim_gerekli(calisma: Calisma) -> bool:
    return bool(calisma.onemli or calisma.hatalar)


def n8n_yaniti(calisma: Calisma) -> dict:
    return {
        "zaman": calisma.zaman,
        "sayfa_sayisi": len(calisma.olcumler),
        "degisim_sayisi": len(calisma.onemli),
        "hata_sayisi": len(calisma.hatalar),
        "atlanan_sayisi": len(calisma.atlananlar),
        "bildirim_gerekli": bildirim_gerekli(calisma),
        "telegram_metni": telegram_metni(calisma),
        "telegram_html": telegram_html(calisma),
        "markdown": markdown(calisma),
    }
